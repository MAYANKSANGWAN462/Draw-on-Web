// Draw on Web — content script entry point / controller
// ---------------------------------------------------------------------------
// Owns draw-mode lifecycle and wires the two-layer canvas manager, drawing
// engine, and toolbar together. Committed strokes repaint the static layer only
// when they change (engine.onChange); the in-progress stroke uses the cheap
// live layer, so both scrolling and drawing stay smooth.
// ---------------------------------------------------------------------------

(function () {
  'use strict';
  if (window.__drawingPen) return; // guard against double injection

  const CanvasManager = window.__DrawingPenCanvasManager;
  const DrawingEngine = window.__DrawingPenDrawingEngine;
  const Toolbar = window.__DrawingPenToolbar;
  const Storage = window.__DrawingPenStorage;

  const HOTKEYS = {
    s: 'select', p: 'pen', h: 'highlighter', l: 'line', r: 'rect', o: 'ellipse',
    a: 'arrow', t: 'text', e: 'eraser', f: 'rectFill', g: 'ellipseFill', n: 'counter'
  };
  const HANDLE_CURSORS = {
    nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
    n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize'
  };

  // Input-device glyphs, shared by the first-run picker and the toolbar switcher.
  const INPUT_ICONS = {
    auto: '<path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6v6l4 2"/>',
    mouse: '<rect x="5" y="2" width="14" height="20" rx="7"/><path d="M12 6v4"/>',
    trackpad: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 14h18"/><path d="M11 17.5h2"/>',
    touch: '<path d="M18 11.5V9a2 2 0 0 0-4 0"/><path d="M14 10V8a2 2 0 0 0-4 0v1"/><path d="M10 9V5a2 2 0 0 0-4 0v9"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'
  };
  const INPUT_LABELS = { auto: 'Auto-detect', mouse: 'Mouse', trackpad: 'Trackpad', touch: 'Touchscreen' };
  function inputSvg(name, size = 24) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
      `stroke-linecap="round" stroke-linejoin="round" width="${size}" height="${size}" aria-hidden="true">` +
      (INPUT_ICONS[name] || '') + '</svg>';
  }

  const DrawingPen = {
    active: false,
    interactive: true,
    canvas: null,
    engine: null,
    toolbar: null,
    cursor: null,
    settings: null,
    _pointerId: null,
    _mode: null,
    _shiftDown: false,
    // Input device handling (mouse / trackpad / touch). `_inputMode` is the
    // resolved effective mode; `_pointers` tracks live touch points so a second
    // finger switches from drawing to a two-finger pan gesture.
    _inputMode: 'mouse',
    _pointers: new Map(),
    _pan: null,
    _penDown: false,
    _textEl: null,
    _textEdit: null,
    _saveTimer: null,
    _unsubSettings: null,
    _toolState: null,
    // selection state
    selection: { indices: [], bbox: null },
    _hiddenSet: null,
    _selGesture: null,
    _selHandle: null,
    _selOriginals: null,
    _selPreview: null,
    _selPreviewBBox: null,
    _selAnchor: null,
    _selMoving: null,
    _selAxis: null,
    _selStart: null,
    _selMoved: false,
    _marquee: null,

    async toggle() { this.active ? this.deactivate() : await this.activate(); },

    async activate() {
      if (this.active) return;
      this.active = true;
      this.interactive = true;

      this.settings = await Storage.getSettings();
      this._inputMode = this._resolveInputMode(this.settings.inputMode);

      this.engine = new DrawingEngine();
      this.engine.tool = this.settings.defaultTool || 'pen';
      this.engine.color = this.settings.defaultColor || '#ef4444';
      this.engine.width = this.settings.defaultThickness || 4;
      this.engine.opacity = this.settings.defaultOpacity ?? 1;
      this.engine.smoothing = this.settings.smoothing ?? 0.5;
      this.engine.onChange = () => this._onSceneChange();

      // Per-tool memory of thickness + opacity, so e.g. the highlighter's
      // translucency never leaks onto the pen. Color stays shared across tools.
      const dt = this.settings.defaultThickness || 4;
      const op = this.settings.defaultOpacity ?? 1;
      this._toolState = {
        select: {},
        pen: { width: dt, opacity: op },
        highlighter: { width: Math.max(12, dt * 3), opacity: 0.3 },
        line: { width: dt, opacity: op },
        rect: { width: dt, opacity: op },
        ellipse: { width: dt, opacity: op },
        rectFill: { width: dt, opacity: 0.3 },
        ellipseFill: { width: dt, opacity: 0.3 },
        arrow: { width: dt, opacity: op },
        text: { width: dt, opacity: op },
        counter: { width: dt, opacity: op },
        eraser: { width: 16, opacity: 1 }
      };
      const initSt = this._toolState[this.engine.tool];
      if (initSt) {
        if (initSt.width != null) this.engine.width = initSt.width;
        if (initSt.opacity != null) this.engine.opacity = initSt.opacity;
      }

      this.selection = { indices: [], bbox: null };
      this._hiddenSet = new Set();

      this.canvas = new CanvasManager({
        renderCommitted: (ctx) => this.engine.renderCommitted(ctx, this._hiddenSet),
        renderActive: (ctx) => this._renderLive(ctx)
      });
      this.canvas.mount();

      this._attachPointerHandlers();
      this._buildCursor();
      this._applyInputMode();

      this.toolbar = new Toolbar(this._buildApi());
      await this.toolbar.mount();

      this._applyMode();
      this._startRouteWatch();
      document.addEventListener('keydown', this._onKeyDown, true);
      document.addEventListener('keyup', this._onKeyUp, true);

      this._unsubSettings = Storage.onSettingsChanged((s) => {
        this.settings = s;
        if (this.engine) this.engine.smoothing = s.smoothing ?? 0.5;
        this._inputMode = this._resolveInputMode(s.inputMode);
        this._applyInputMode();
        this.toolbar && this.toolbar.applySettings(s);
      });

      if (this.settings.autoRestore) await this._restoreForUrl();

      // First-run onboarding: ask which input device they use (so drawing feels
      // right on a mouse, trackpad, or touchscreen), THEN show the interactive
      // welcome tour. Each is shown at most once; the picker chains into the tour.
      const inputAsked = await Storage.getLocal('inputModeAsked', false);
      const welcomeSeen = await Storage.getLocal('welcomeSeen', false);
      const showWelcome = () => {
        if (!welcomeSeen) { Storage.setLocal('welcomeSeen', true); this._showGuide(); }
      };
      if (!inputAsked) {
        Storage.setLocal('inputModeAsked', true);
        this._showInputPicker(showWelcome);
      } else {
        showWelcome();
      }

      console.log('%cDraw on Web active', 'color:#f97316;font-weight:bold');
    },

    deactivate() {
      if (!this.active) return;
      this.active = false;
      this._commitText(true);

      document.removeEventListener('keydown', this._onKeyDown, true);
      document.removeEventListener('keyup', this._onKeyUp, true);
      this._stopRouteWatch();
      this._detachPointerHandlers();
      if (this._unsubSettings) { this._unsubSettings(); this._unsubSettings = null; }

      this._pointers.clear();
      this._pan = null;
      this._penDown = false;

      if (this._modal) { this._modal.remove(); this._modal = null; }
      if (this._inputPicker) { this._inputPicker.remove(); this._inputPicker = null; }
      if (this._inputMenu) { this._inputMenu.remove(); this._inputMenu = null; }
      if (this._guide) { this._guide.remove(); this._guide = null; }
      if (this.cursor) { this.cursor.remove(); this.cursor = null; }
      if (this.toolbar) { this.toolbar.destroy(); this.toolbar = null; }
      if (this.canvas) { this.canvas.unmount(); this.canvas = null; }
      this.engine = null;
      console.log('%cDraw on Web off', 'color:#9ca3af');
    },

    // ---- toolbar API -----------------------------------------------------
    _buildApi() {
      const self = this;
      return {
        getState() {
          const e = self.engine;
          return {
            tool: e.tool, color: e.color, width: e.width, opacity: e.opacity,
            interactive: self.interactive,
            canUndo: e.canUndo(), canRedo: e.canRedo(), canClear: !e.isEmpty()
          };
        },
        selectTool(id) { self.selectTool(id); },
        setColor(hex) { self.engine.color = hex; self._styleCursor(); self._refresh(); },
        setWidth(n) { self.engine.width = n; self._styleCursor(); self._refresh(); },
        setOpacity(n) { self.engine.opacity = n; self._styleCursor(); self._refresh(); },
        setInteractive(on) { self.setInteractive(on); },
        // Resolved effective mode (mouse/trackpad/touch) vs the raw stored setting
        // (which may be 'auto'). The toolbar shows the effective icon but ticks the
        // stored choice in its menu.
        getInputMode() { return self._inputMode; },
        getInputModeSetting() { return (self.settings && self.settings.inputMode) || 'auto'; },
        setInputMode(mode) { self.setInputMode(mode); },
        undo() { self._clearSelection(); self.engine.undo(); },
        redo() { self._clearSelection(); self.engine.redo(); },
        clear() {
          if (self.engine.isEmpty()) return;
          self._confirmClear();
        },
        exportPng() { self.exportPng(); },
        openSettings() { chrome.runtime.sendMessage({ type: 'DP_OPEN_OPTIONS' }); },
        openGuide() { self._showGuide(); },
        exit() { self.deactivate(); }
      };
    },

    selectTool(id) {
      this._commitText(true);
      if (id !== 'select') this._clearSelection();
      // Save the outgoing tool's size/opacity, then load the incoming tool's.
      const prev = this.engine.tool;
      if (this._toolState && this._toolState[prev]) {
        this._toolState[prev].width = this.engine.width;
        this._toolState[prev].opacity = this.engine.opacity;
      }
      this.engine.tool = id;
      const st = this._toolState && this._toolState[id];
      if (st) {
        if (st.width != null) this.engine.width = st.width;
        if (st.opacity != null) this.engine.opacity = st.opacity;
      }
      this.setInteractive(true);
      this._styleCursor();
      if (this.canvas) {
        this.canvas.base.style.cursor =
          id === 'select' ? 'default' : id === 'text' ? 'text' : 'crosshair';
      }
      this._refresh();
    },

    setInteractive(on) {
      this.interactive = on;
      if (!on) { this._commitText(true); this._clearSelection(); }
      this._applyMode();
      this._refresh();
    },

    _applyMode() {
      this.canvas.setInteractive(this.interactive);
      if (!this.interactive) this._showCursor(false);
    },

    // ---- input device (mouse / trackpad / touch) -------------------------
    // Turn the stored setting into a concrete mode. 'auto' resolves to 'touch'
    // on coarse, no-hover devices (phones/tablets) and 'mouse' otherwise —
    // trackpad can't be told apart from a mouse automatically (both surface as
    // "mouse" pointers), which is exactly why we offer the explicit picker.
    _resolveInputMode(setting) {
      if (setting === 'mouse' || setting === 'trackpad' || setting === 'touch') return setting;
      try {
        const coarse = matchMedia('(pointer: coarse)').matches;
        const noHover = matchMedia('(hover: none)').matches;
        if (coarse && noHover) return 'touch';
      } catch (_e) { /* matchMedia unavailable — fall through */ }
      return 'mouse';
    },

    // Persist an explicit choice; the settings-changed listener re-resolves and
    // re-applies. Called from the first-run picker and the toolbar switcher.
    setInputMode(mode) {
      this._inputMode = this._resolveInputMode(mode);
      // Reflect the choice locally right away so the toolbar updates without
      // waiting for the async storage round-trip; setSettings then persists it.
      if (this.settings) this.settings.inputMode = mode;
      this._applyInputMode();
      Storage.setSettings({ inputMode: mode });
      this._refresh();
    },

    // Reflect the current mode on the DOM (a data attribute for CSS hooks) and
    // hide the brush-preview dot on touch, where a fingertip covers it anyway.
    _applyInputMode() {
      try { document.documentElement.setAttribute('data-dp-input', this._inputMode); } catch (_e) {}
      if (this._inputMode === 'touch') this._showCursor(false);
    },

    // Pointer hit-slop multiplier: coarse pointers (trackpad taps, fingertips)
    // need a more forgiving grab radius for selection handles and text than a
    // pixel-precise mouse. Keeps the same tools usable across devices.
    _hitTol() {
      return this._inputMode === 'touch' ? 2.4 : this._inputMode === 'trackpad' ? 1.6 : 1;
    },
    // Extra px added to stroke/text hit-testing, so tapping a thin line or a
    // small text block actually grabs it on a trackpad or touchscreen.
    _hitExtra() {
      return this._inputMode === 'touch' ? 12 : this._inputMode === 'trackpad' ? 6 : 0;
    },

    _refresh() { this.toolbar && this.toolbar.refresh(); },

    // Committed scene changed -> repaint static layer, refresh UI, autosave.
    // Adding a single stroke paints just that stroke onto the static layer
    // (O(1)); everything else (undo/erase/move/clear) does a coalesced full
    // repaint. This keeps drawing on a heavily-annotated page smooth no matter
    // how many strokes are already down.
    _onSceneChange() {
      if (this.canvas) {
        const eng = this.engine;
        const last = eng.strokes[eng.strokes.length - 1];
        if (eng._changeKind === 'add' && last && (!this._hiddenSet || this._hiddenSet.size === 0)) {
          this.canvas.appendBase((ctx) => eng._paint(ctx, last));
        } else {
          this.canvas.requestBasePaint();
        }
      }
      this._refresh();
      this._scheduleSave();
    },

    // ---- pointer handling ------------------------------------------------
    _attachPointerHandlers() {
      const el = this.canvas.base;
      this._onDown = (e) => {
        if (!this.interactive) return;
        if (e.pointerType === 'pen') {
          this._penDown = true;                 // a stylus is in contact
        } else if (e.pointerType === 'touch') {
          // Palm rejection: while a stylus draws, ignore stray touches (a resting
          // hand on a pen display) so they can't scribble or pan.
          if (this._penDown) { e.preventDefault(); return; }
          this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          // A second finger turns the gesture into a two-finger pan: abandon any
          // stroke the first finger just began, so scrolling never leaves a mark.
          if (this._pointers.size >= 2) { this._beginPan(); e.preventDefault(); return; }
        } else if (e.button !== 0) {
          return; // ignore right / middle mouse buttons
        }
        const tool = this.engine.tool;
        // Anchor this stroke to whatever actually scrolls the content under the
        // pointer (an inner container, or the page root) so it tracks that
        // content when scrolled — works on ChatGPT-style inner scrollers too.
        this._syncScroller(e.clientX, e.clientY);
        const dp = this.canvas.toDocPoint(e.clientX, e.clientY);

        if (tool === 'counter') { this.engine.addCounter(dp); e.preventDefault(); return; }

        // The Text tool doubles as a lightweight text picker: clicking directly on
        // an existing text (or a selected text's handles) grabs it to move/resize
        // in place — no need to switch to the Select tool, and without the marquee
        // that would rope in every other mark. Clicking empty space places a new
        // text as before.
        if (tool === 'text') {
          if (this._textGrab(dp)) {
            el.setPointerCapture?.(e.pointerId);
            this._pointerId = e.pointerId;
            e.preventDefault();
            return;
          }
          this._clearSelection();
          this._openText(e.clientX, e.clientY, dp);
          return;
        }

        el.setPointerCapture?.(e.pointerId);
        this._pointerId = e.pointerId;

        if (tool === 'select') {
          this._selectDown(dp);
        } else if (tool === 'eraser') {
          this._mode = 'eraser';
          this.engine.eraseBegin();
          this.engine.eraseAt(dp);          // -> onChange -> paintBase
        } else if (this.engine.isShape(tool)) {
          this._mode = 'shape';
          this.engine.beginShape(dp);
          this.canvas.requestLivePaint();
        } else {
          this._mode = 'freehand';
          this.engine.beginStroke(dp);
          this.canvas.requestLivePaint();
        }
        e.preventDefault();
      };

      this._onMove = (e) => {
        if (e.pointerType === 'touch' && this._pointers.has(e.pointerId)) {
          this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        // Two-finger pan in progress: scroll instead of drawing / hovering.
        if (this._pan) { this._updatePan(); e.preventDefault(); return; }

        this._moveCursor(e.clientX, e.clientY);

        // Select tool: hover cursor feedback when not dragging.
        if (this.engine.tool === 'select' && this._pointerId == null) {
          this._updateSelectCursor(this.canvas.toDocPoint(e.clientX, e.clientY));
        } else if (this.engine.tool === 'text' && this._pointerId == null) {
          this._updateTextHoverCursor(this.canvas.toDocPoint(e.clientX, e.clientY));
        }

        if (this._pointerId !== e.pointerId) return;

        if (this._selGesture) {
          this._selectMove(this.canvas.toDocPoint(e.clientX, e.clientY));
        } else if (this._mode === 'freehand') {
          // Coalesced events -> smoother, denser strokes.
          const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
          for (const ev of evs) this.engine.extendStroke(this.canvas.toDocPoint(ev.clientX, ev.clientY));
          this.canvas.requestLivePaint();
        } else if (this._mode === 'shape') {
          this.engine.updateShape(this.canvas.toDocPoint(e.clientX, e.clientY), this._shiftDown);
          this.canvas.requestLivePaint();
        } else if (this._mode === 'eraser') {
          this.engine.eraseAt(this.canvas.toDocPoint(e.clientX, e.clientY));
        }
      };

      this._onUp = (e) => {
        if (e.pointerType === 'pen') this._penDown = false;
        if (e.pointerType === 'touch') this._pointers.delete(e.pointerId);
        // A pan ends once fewer than two fingers remain on the surface. The last
        // finger left over does nothing until it too lifts (no new pointerdown).
        if (this._pan) { if (this._pointers.size < 2) this._endPan(); return; }
        if (this._pointerId !== e.pointerId) return;
        this._pointerId = null;
        if (this._selGesture) this._selectUp();
        else if (this._mode === 'eraser') this.engine.eraseEnd();
        else if (this._mode === 'freehand' || this._mode === 'shape') {
          this.engine.endStroke();           // -> onChange -> paintBase (static)
          this.canvas.requestLivePaint();    // clear the now-empty live layer
        }
        this._mode = null;
      };

      this._onEnter = () => { if (this.interactive) this._showCursor(true); };
      this._onLeave = () => this._showCursor(false);

      // Double-click a text stroke (with the Select OR Text tool) to edit it.
      this._onDblClick = (e) => {
        if (!this.interactive) return;
        const tool = this.engine.tool;
        if (tool !== 'select' && tool !== 'text') return;
        if (this._editText(this.canvas.toDocPoint(e.clientX, e.clientY))) e.preventDefault();
      };

      this._onWheel = (e) => {
        if (!this.interactive) return;

        // Pinch-to-zoom on a trackpad (and Ctrl/⌘ + wheel) arrives as a wheel
        // event with ctrlKey set. Let the browser zoom the page natively rather
        // than hijacking it to scroll — essential for trackpad users who pinch.
        if (e.ctrlKey) return;

        // Alt + wheel = quick brush-size change without leaving the canvas.
        if (e.altKey) {
          if (this.engine.tool === 'select') return;
          e.preventDefault();
          const next = Math.max(1, Math.min(20, this.engine.width + (e.deltaY < 0 ? 1 : -1)));
          if (next === this.engine.width) return;
          this.engine.width = next;
          this._styleCursor();
          this._refresh();
          return;
        }

        // In draw mode the canvas sits on top and would otherwise swallow the
        // wheel — the page (or an inner container) wouldn't scroll at all. If the
        // content under the pointer is an inner scroll container, scroll it
        // manually and keep our anchor on it. For a root-scrolling page we let
        // the browser scroll natively (no preventDefault), so sites that already
        // work stay smooth.
        const scroller = this._findScrollerAt(e.clientX, e.clientY);
        if (scroller) {
          this.canvas.setScroller(scroller);
          scroller.scrollBy({ left: e.deltaX, top: e.deltaY });
          e.preventDefault();
        }
      };

      el.addEventListener('pointerdown', this._onDown);
      el.addEventListener('pointermove', this._onMove);
      el.addEventListener('pointerup', this._onUp);
      el.addEventListener('pointercancel', this._onUp);
      el.addEventListener('pointerenter', this._onEnter);
      el.addEventListener('pointerleave', this._onLeave);
      el.addEventListener('dblclick', this._onDblClick);
      el.addEventListener('wheel', this._onWheel, { passive: false });
    },

    _detachPointerHandlers() {
      const el = this.canvas?.base;
      if (!el) return;
      for (const [ev, fn] of [
        ['pointerdown', this._onDown], ['pointermove', this._onMove],
        ['pointerup', this._onUp], ['pointercancel', this._onUp],
        ['pointerenter', this._onEnter], ['pointerleave', this._onLeave],
        ['dblclick', this._onDblClick], ['wheel', this._onWheel]
      ]) el.removeEventListener(ev, fn);
    },

    // ---- scroll-anchor detection -----------------------------------------
    // Pick the scroll container the annotation should follow, and tell the
    // canvas manager. Prefer an inner scrollable element under the pointer; fall
    // back to the page root. On single-scroller apps (root not itself scrollable,
    // e.g. ChatGPT) keep the existing element anchor when the pointer lands on a
    // non-scrolling region, so the whole drawing stays on one consistent anchor.
    _syncScroller(clientX, clientY) {
      let scroller = this._findScrollerAt(clientX, clientY);
      if (!scroller && this.canvas.scroller && !this._rootScrollable()) {
        scroller = this.canvas.scroller;
      }
      this.canvas.setScroller(scroller);
    },

    // Nearest scrollable ancestor of the top-most page element at (x, y), skipping
    // our own overlay elements. Returns null when only the page root scrolls.
    _findScrollerAt(x, y) {
      const mine = new Set([
        this.canvas && this.canvas.base, this.canvas && this.canvas.live, this.cursor,
        this.toolbar && this.toolbar.root, this.toolbar && this.toolbar.puck,
        this.toolbar && this.toolbar.popover
      ].filter(Boolean));
      let els = [];
      try { els = document.elementsFromPoint(x, y) || []; } catch (_e) {}
      for (const el of els) {
        if (mine.has(el)) continue;
        return this._nearestScrollable(el);
      }
      return null;
    },
    _nearestScrollable(el) {
      let node = el;
      while (node && node !== document.body && node !== document.documentElement) {
        if (this._isScrollable(node)) return node;
        node = node.parentElement;
      }
      return null; // root/window scrolls
    },
    _isScrollable(el) {
      let cs;
      try { cs = getComputedStyle(el); } catch (_e) { return false; }
      const canScroll = (overflow, scrollSize, clientSize) =>
        (overflow === 'auto' || overflow === 'scroll') && scrollSize - clientSize > 2;
      return canScroll(cs.overflowY, el.scrollHeight, el.clientHeight) ||
             canScroll(cs.overflowX, el.scrollWidth, el.clientWidth);
    },
    _rootScrollable() {
      const de = document.scrollingElement || document.documentElement;
      return de.scrollHeight - de.clientHeight > 2 || de.scrollWidth - de.clientWidth > 2;
    },

    // ---- two-finger pan (touchscreens) -----------------------------------
    // On touch, one finger draws and two fingers scroll — mirroring how the page
    // behaves normally, so touch users can navigate without leaving draw mode.
    _centroid() {
      let x = 0, y = 0, n = 0;
      this._pointers.forEach((p) => { x += p.x; y += p.y; n++; });
      return n ? { x: x / n, y: y / n } : { x: 0, y: 0 };
    },
    _beginPan() {
      // Roll back whatever the first finger started so a pan never draws.
      if (this._mode === 'freehand' || this._mode === 'shape') {
        this.engine.cancelActive();
        this.canvas.requestLivePaint();
      } else if (this._mode === 'eraser') {
        this.engine.eraseEnd();
      } else if (this._selGesture) {
        this._selGesture = null; this._selPreview = null; this._selPreviewBBox = null;
        this._selOriginals = null; this._selAnchor = null; this._marquee = null;
        this._selMoved = false;
        if (this._hiddenSet) this._hiddenSet.clear();
        this.canvas.paintBase();
        this.canvas.requestLivePaint();
      }
      this._mode = null;
      this._pointerId = null;
      this._showCursor(false);
      const c = this._centroid();
      // Anchor to (and scroll) whatever container is under the fingers.
      this.canvas.setScroller(this._findScrollerAt(c.x, c.y));
      this._pan = { x: c.x, y: c.y };
    },
    _updatePan() {
      const c = this._centroid();
      const dx = this._pan.x - c.x, dy = this._pan.y - c.y;
      this._pan = { x: c.x, y: c.y };
      const s = this.canvas.scroller;
      if (s && s.isConnected) s.scrollBy(dx, dy);
      else window.scrollBy(dx, dy);
    },
    _endPan() { this._pan = null; },

    // ---- select tool (marquee / move / resize) ---------------------------
    _selectDown(dp) {
      this._selMoved = false;
      const box = this.selection.bbox;
      if (box) {
        const h = this._handleAt(dp);
        if (h) { this._beginResize(h, box, dp); return; }
        if (this._insideBBox(dp)) { this._beginMove(dp); return; }
      }
      const idx = this.engine.hitTest(dp, this._hitExtra());
      if (idx >= 0) {
        this.selection.indices = [idx];
        this.selection.bbox = this.engine.bboxOfIndices([idx]);
        this._beginMove(dp);
        return;
      }
      // empty space -> rubber-band marquee
      this._clearSelection();
      this._selGesture = 'marquee';
      this._selStart = dp;
      this._marquee = { x: dp.x, y: dp.y, w: 0, h: 0 };
      this.canvas.requestLivePaint();
    },

    _beginMove(dp) {
      this._selGesture = 'move';
      this._selStart = dp;
      this._liftSelection();
      this._selPreviewBBox = { ...this.selection.bbox };
      this.canvas.paintBase();
      this.canvas.requestLivePaint();
    },

    _beginResize(handle, box, dp) {
      this._selGesture = 'resize';
      this._selHandle = handle;
      this._selStart = dp;
      this._liftSelection();
      const x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
      const map = {
        nw: { ax: x1, ay: y1, ox: x0, oy: y0, axisX: true, axisY: true },
        ne: { ax: x0, ay: y1, ox: x1, oy: y0, axisX: true, axisY: true },
        se: { ax: x0, ay: y0, ox: x1, oy: y1, axisX: true, axisY: true },
        sw: { ax: x1, ay: y0, ox: x0, oy: y1, axisX: true, axisY: true },
        n: { ax: x0, ay: y1, ox: x0, oy: y0, axisX: false, axisY: true },
        s: { ax: x0, ay: y0, ox: x0, oy: y1, axisX: false, axisY: true },
        e: { ax: x0, ay: y0, ox: x1, oy: y0, axisX: true, axisY: false },
        w: { ax: x1, ay: y0, ox: x0, oy: y0, axisX: true, axisY: false }
      };
      this._selAnchor = map[handle];
      this._selPreviewBBox = { ...box };
      this.canvas.paintBase();
      this.canvas.requestLivePaint();
    },

    // Lift selected strokes off the static layer onto the live preview.
    _liftSelection() {
      this._selOriginals = this.selection.indices.map((i) => this.engine.cloneStroke(this.engine.strokes[i]));
      this._selPreview = this._selOriginals.map((s) => this.engine.cloneStroke(s));
      this._hiddenSet = new Set(this.selection.indices);
    },

    _selectMove(dp) {
      const eng = this.engine;
      if (this._selGesture === 'marquee') {
        this._marquee = {
          x: Math.min(this._selStart.x, dp.x), y: Math.min(this._selStart.y, dp.y),
          w: Math.abs(dp.x - this._selStart.x), h: Math.abs(dp.y - this._selStart.y)
        };
        this.canvas.requestLivePaint();
        return;
      }
      if (this._selGesture === 'move') {
        const dx = dp.x - this._selStart.x, dy = dp.y - this._selStart.y;
        if (Math.abs(dx) + Math.abs(dy) > 1) this._selMoved = true;
        this._selPreview = this._selOriginals.map((s) => eng.translateStroke(eng.cloneStroke(s), dx, dy));
        const b = this.selection.bbox;
        this._selPreviewBBox = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
        this.canvas.requestLivePaint();
        return;
      }
      if (this._selGesture === 'resize') {
        const a = this._selAnchor;
        const sx = a.axisX ? this._safeScale(dp.x - a.ax, a.ox - a.ax) : 1;
        const sy = a.axisY ? this._safeScale(dp.y - a.ay, a.oy - a.ay) : 1;
        this._selMoved = true;
        this._selPreview = this._selOriginals.map((s) => eng.scaleStroke(eng.cloneStroke(s), a.ax, a.ay, sx, sy));
        this._selPreviewBBox = this._scaleBox(this.selection.bbox, a.ax, a.ay, sx, sy);
        this.canvas.requestLivePaint();
      }
    },

    _selectUp() {
      const g = this._selGesture;
      this._selGesture = null;
      if (g === 'marquee') {
        const rect = this._marquee;
        this._marquee = null;
        const indices = (rect && (rect.w > 2 || rect.h > 2)) ? this.engine.strokesInRect(rect) : [];
        this.selection.indices = indices;
        this.selection.bbox = this.engine.bboxOfIndices(indices);
        this.canvas.requestLivePaint();
        return;
      }
      // move / resize -> bake into the strokes (or just re-show if unchanged)
      this._hiddenSet.clear();
      if (this._selMoved && this._selPreview) {
        this.engine.replaceStrokes(this.selection.indices, this._selPreview); // -> paintBase
        this.selection.bbox = this.engine.bboxOfIndices(this.selection.indices);
      } else {
        this.canvas.paintBase();
      }
      this._selPreview = null; this._selPreviewBBox = null;
      this._selOriginals = null; this._selAnchor = null;
      this.canvas.requestLivePaint();
    },

    _clearSelection() {
      const had = (this.selection && this.selection.indices.length) || (this._hiddenSet && this._hiddenSet.size) || this._marquee;
      this.selection = { indices: [], bbox: null };
      this._selGesture = null; this._selPreview = null; this._selPreviewBBox = null;
      this._selOriginals = null; this._selAnchor = null; this._marquee = null; this._selMoved = false;
      if (this._hiddenSet) this._hiddenSet.clear();
      if (this.canvas && had) { this.canvas.paintBase(); this.canvas.requestLivePaint(); }
    },

    _safeScale(num, den) {
      if (Math.abs(den) < 0.001) return 1;
      return Math.max(0.05, num / den);
    },
    _scaleBox(b, ax, ay, sx, sy) {
      const x0 = ax + (b.x - ax) * sx, y0 = ay + (b.y - ay) * sy;
      const x1 = ax + (b.x + b.w - ax) * sx, y1 = ay + (b.y + b.h - ay) * sy;
      return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
    },
    _handlePoints(box) {
      const x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
      const mx = box.x + box.w / 2, my = box.y + box.h / 2;
      return [
        { id: 'nw', x: x0, y: y0 }, { id: 'n', x: mx, y: y0 }, { id: 'ne', x: x1, y: y0 },
        { id: 'e', x: x1, y: my }, { id: 'se', x: x1, y: y1 }, { id: 's', x: mx, y: y1 },
        { id: 'sw', x: x0, y: y1 }, { id: 'w', x: x0, y: my }
      ];
    },
    _handleAt(dp) {
      const box = this.selection.bbox;
      if (!box) return null;
      const tol = 7 * this._hitTol();
      for (const h of this._handlePoints(box)) {
        if (Math.abs(dp.x - h.x) <= tol && Math.abs(dp.y - h.y) <= tol) return h.id;
      }
      return null;
    },
    _insideBBox(dp) {
      const b = this.selection.bbox;
      if (!b) return false;
      return dp.x >= b.x && dp.x <= b.x + b.w && dp.y >= b.y && dp.y <= b.y + b.h;
    },
    _updateSelectCursor(dp) {
      let cur = 'default';
      if (this.selection.bbox) {
        const h = this._handleAt(dp);
        if (h) cur = HANDLE_CURSORS[h];
        else if (this._insideBBox(dp)) cur = 'move';
      }
      if (this.canvas) this.canvas.base.style.cursor = cur;
    },

    // ---- text tool: grab existing text to move/resize --------------------
    // Called on pointerdown while the Text tool is active. If the click lands on
    // the current selection's handles/body, or directly on any text block, start
    // the matching select-tool gesture (resize / move) and return true. Return
    // false for an empty click so the caller opens a fresh text editor instead.
    _textGrab(dp) {
      // Save (don't discard) any text still being typed before grabbing another.
      const box = this.selection.bbox;
      if (box && this.selection.indices.length) {
        const h = this._handleAt(dp);
        if (h) { this._commitText(false); this._beginResize(h, box, dp); return true; }
        if (this._insideBBox(dp)) { this._commitText(false); this._beginMove(dp); return true; }
      }
      const idx = this.engine.hitTestText(dp, this._hitExtra());
      if (idx >= 0) {
        this._commitText(false);
        // Committing typed text can shift indices/scene; re-resolve the hit so we
        // grab the text actually under the pointer.
        const grab = this.engine.hitTestText(dp, this._hitExtra());
        if (grab < 0) return false;
        this.selection.indices = [grab];
        this.selection.bbox = this.engine.bboxOfIndices([grab]);
        this._beginMove(dp);
        return true;
      }
      return false;
    },

    // Hover feedback for the Text tool: a move/resize cursor over grabbable text,
    // otherwise an I-beam to signal "click to place text here".
    _updateTextHoverCursor(dp) {
      let cur = 'text';
      const extra = this._hitExtra();
      if (this.selection.bbox) {
        const h = this._handleAt(dp);
        if (h) cur = HANDLE_CURSORS[h];
        else if (this._insideBBox(dp) || this.engine.hitTestText(dp, extra) >= 0) cur = 'move';
      } else if (this.engine.hitTestText(dp, extra) >= 0) {
        cur = 'move';
      }
      if (this.canvas) this.canvas.base.style.cursor = cur;
    },

    // Live-layer render: in-progress stroke + selection overlay.
    _renderLive(ctx) {
      this.engine.renderActive(ctx);
      // The Text tool shows the same move/resize overlay as Select when a text
      // is grabbed, so it can be repositioned without leaving the tool.
      if (this.engine.tool !== 'select' && this.engine.tool !== 'text') return;
      if (this._selPreview) this.engine.renderStrokes(ctx, this._selPreview);
      this._renderSelection(ctx);
    },
    _renderSelection(ctx) {
      const accent = (this.settings && this.settings.accentColor) || '#f97316';
      if (this._marquee) {
        ctx.save();
        ctx.fillStyle = 'rgba(249, 115, 22, 0.12)';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.fillRect(this._marquee.x, this._marquee.y, this._marquee.w, this._marquee.h);
        ctx.strokeRect(this._marquee.x, this._marquee.y, this._marquee.w, this._marquee.h);
        ctx.restore();
        return;
      }
      const box = this._selPreviewBBox || this.selection.bbox;
      if (box) this._drawSelectionBox(ctx, box, accent);
    },
    _drawSelectionBox(ctx, box, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.setLineDash([]);
      if (!this._selGesture) {
        const hs = 8;
        for (const h of this._handlePoints(box)) {
          ctx.fillStyle = '#fff';
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
          ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
        }
      }
      ctx.restore();
    },

    // ---- text tool -------------------------------------------------------
    // Open the inline text editor. Pass `edit = { index, orig }` to re-edit an
    // existing text stroke (double-click via the select tool): the editor adopts
    // that stroke's font/size/colour/wrap and pre-fills its text, and the
    // original is hidden on the static layer until the edit is committed.
    _openText(clientX, clientY, docPoint, edit) {
      // Save (don't discard) any text still being typed. Placing another text —
      // e.g. by clicking elsewhere on the page — commits the current one, exactly
      // like pressing Enter, so switching to the mouse never loses your words.
      this._commitText(false);

      if (edit) {
        this._textEdit = edit;
        this._hiddenSet = new Set([edit.index]);
        this.canvas.paintBase();
      }
      const orig = edit && edit.orig;

      const box = document.createElement('div');
      box.className = 'dp-text-input';
      box.contentEditable = 'true';
      box.spellcheck = false;
      // Align the editable box so the typed baseline sits exactly where the text
      // will be committed (fillText draws at the document point, baseline = y).
      const FONTS = Storage.FONT_STACKS;
      const fontSize = orig ? orig.size : Math.max(12, this.engine.width * 4 + 8);
      const fontFamily = orig ? (orig.fontFamily || FONTS.sans)
        : (FONTS[(this.settings && this.settings.textFont)] || FONTS.sans);
      const color = orig ? orig.color : this.engine.color;
      const opacity = orig ? (orig.opacity ?? 1) : this.engine.opacity;
      box._fontFamily = fontFamily;
      // Wrap width = space from the click point to the right edge of the window,
      // so long text flows to the next line instead of running off-screen. The
      // box shrink-to-fits within this, and the committed canvas text re-wraps to
      // the same width, so what you type is what you get. When editing, keep the
      // original wrap width (if it still fits) so re-opening looks identical.
      const availW = Math.max(60, window.innerWidth - (clientX - 5) - 12);
      const maxW = orig && orig.maxWidth ? Math.min(orig.maxWidth, availW) : availW;
      Object.assign(box.style, {
        left: (clientX - 5) + 'px',
        top: (clientY - Math.round(fontSize * 0.92) - 3) + 'px',
        maxWidth: maxW + 'px',
        color: color,
        opacity: String(opacity),
        fontSize: fontSize + 'px',
        fontFamily: fontFamily
      });
      if (orig) box.textContent = orig.text;   // pre-fill when editing
      box._docPoint = docPoint;
      box._fontSize = fontSize;
      // Shield host-page keyboard shortcuts while typing. Sites like YouTube
      // listen for keys (Space = play/pause, J/K/L, F, etc.) on document/window,
      // and a contentEditable appended to <html> doesn't stop them — so a space
      // would both type AND toggle the video. We intercept at the window capture
      // phase (the outermost point in the event path, before any page handler)
      // and stop propagation so those handlers never fire. The browser's default
      // action — inserting the character — is independent of propagation, so text
      // still types normally. Enter/Escape are handled here for the same reason.
      this._textKeyShield = (e) => {
        if (!this._textEl) return;
        e.stopPropagation();
        if (e.type !== 'keydown') return;
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._commitText(false); }
        else if (e.key === 'Escape') { e.preventDefault(); this._commitText(true); }
      };
      for (const type of ['keydown', 'keyup', 'keypress']) {
        window.addEventListener(type, this._textKeyShield, true);
      }
      box.addEventListener('blur', () => this._commitText(false));
      document.documentElement.appendChild(box);
      this._textEl = box;

      // Keep the input pinned to its document point while the page scrolls, so
      // what you type stays exactly where it will be committed.
      this._textScroll = () => {
        const el = this._textEl;
        if (!el) return;
        const s = this.canvas.getScroll();
        el.style.left = (el._docPoint.x - s.x - 5) + 'px';
        el.style.top = (el._docPoint.y - s.y - Math.round(el._fontSize * 0.92) - 3) + 'px';
      };
      window.addEventListener('scroll', this._textScroll, { passive: true, capture: true });

      // Focus and drop the caret at the end (matters when pre-filled for editing).
      setTimeout(() => {
        box.focus();
        const sel = window.getSelection();
        if (sel) {
          const r = document.createRange();
          r.selectNodeContents(box);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      }, 0);
    },

    _commitText(discard) {
      if (this._textScroll) {
        window.removeEventListener('scroll', this._textScroll, true);
        this._textScroll = null;
      }
      if (this._textKeyShield) {
        for (const type of ['keydown', 'keyup', 'keypress']) {
          window.removeEventListener(type, this._textKeyShield, true);
        }
        this._textKeyShield = null;
      }
      const box = this._textEl;
      const edit = this._textEdit;
      this._textEdit = null;
      if (!box) { if (edit) this._finishTextEdit(edit, true, '', 0); return; }
      this._textEl = null;
      // innerText (not textContent) keeps the user's own line breaks (Shift+Enter).
      // Capture the wrapped width while the box is still laid out, so the canvas
      // text re-wraps to exactly the width the user saw. Small slack avoids a
      // stray extra wrap from sub-pixel canvas/DOM metric differences.
      const text = box.innerText;
      const maxWidth = Math.max(0, box.clientWidth - 8) + 4;
      const dp = box._docPoint;
      const fontFamily = box._fontFamily;
      box.remove();
      if (edit) { this._finishTextEdit(edit, discard, text, maxWidth); return; }
      if (!discard && text && text.trim()) this.engine.addText({ x: dp.x, y: dp.y }, text, maxWidth, fontFamily);
    },

    // Double-click a text stroke (Select or Text tool) to re-edit its contents.
    _editText(dp) {
      if (this._textEl) return false;
      const idx = this.engine.hitTestText(dp, this._hitExtra());
      if (idx < 0) return false;
      const orig = this.engine.strokes[idx];
      this._clearSelection();
      const s = this.canvas.getScroll();
      const clientX = orig.x - s.x;
      const clientY = orig.y - s.y;
      this._openText(clientX, clientY, { x: orig.x, y: orig.y }, { index: idx, orig });
      return true;
    },

    // Resolve a text edit: keep the original (discard), delete it (emptied), or
    // replace it with the new text — each a single undoable step. Then re-select
    // the result so it's ready to move/resize.
    _finishTextEdit(edit, discard, text, maxWidth) {
      if (this._hiddenSet) this._hiddenSet.clear();
      const cleaned = (text || '').replace(/^\n+|\n+$/g, '').replace(/[ \t]+$/gm, '');
      let selIdx = -1;
      if (discard) {
        this.canvas.paintBase();
      } else if (!cleaned.trim()) {
        this.engine.deleteStrokes([edit.index]);   // emptied -> remove
      } else {
        const next = this.engine.cloneStroke(edit.orig);
        next.text = cleaned;
        next.maxWidth = maxWidth && maxWidth > 0 ? maxWidth : undefined;
        this.engine.replaceStrokes([edit.index], [next]);
        selIdx = edit.index;
      }
      if (selIdx >= 0 && (this.engine.tool === 'select' || this.engine.tool === 'text')) {
        this.selection.indices = [selIdx];
        this.selection.bbox = this.engine.bboxOfIndices([selIdx]);
      }
      this.canvas.requestLivePaint();
    },

    // ---- cursor preview --------------------------------------------------
    _buildCursor() {
      const dot = document.createElement('div');
      dot.className = 'drawing-pen-cursor';
      dot.style.display = 'none';
      // Position purely via `transform` (see _moveCursor), so pin the box to the
      // origin and let the translate do all the moving.
      dot.style.left = '0';
      dot.style.top = '0';
      document.documentElement.appendChild(dot);
      this.cursor = dot;
      this._cursorX = 0; this._cursorY = 0;
      this._styleCursor();
    },
    _styleCursor() {
      if (!this.cursor) return;
      const eraser = this.engine.tool === 'eraser';
      // The eraser cursor's diameter now matches its real hit area, so what you
      // see under the pointer is exactly what will be erased.
      const size = eraser ? Math.max(14, this.engine.width) : Math.max(8, this.engine.width);
      if (eraser) this.engine.eraseRadius = size / 2;
      Object.assign(this.cursor.style, {
        width: size + 'px', height: size + 'px',
        background: eraser ? 'transparent' : this.engine.color,
        opacity: eraser ? '1' : String(this.engine.opacity)
      });
      this.cursor.classList.toggle('is-eraser', eraser);
    },
    _moveCursor(x, y) {
      if (!this.cursor || !this.interactive) return;
      // On a touchscreen the fingertip covers the dot, so there's nothing to show.
      if (this._inputMode === 'touch') { this._showCursor(false); return; }
      // Select and Text tools use native cursors (move/resize/I-beam), not the
      // paint dot, so hide the brush preview for both.
      if (this.engine.tool === 'select' || this.engine.tool === 'text') { this._showCursor(false); return; }
      // Move with `transform` (not left/top): a translate stays on the compositor
      // and skips layout/paint, so the preview tracks the pointer with no lag even
      // at high pointer-event rates. The -50%,-50% keeps the dot centred.
      this._cursorX = x; this._cursorY = y;
      this.cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      if (this.cursor.style.display === 'none') this.cursor.style.display = 'block';
    },
    _showCursor(show) { if (this.cursor) this.cursor.style.display = show ? 'block' : 'none'; },

    // ---- export ----------------------------------------------------------
    async exportPng() {
      this._commitText(false);
      const mode = (this.settings && this.settings.exportMode) || 'viewport';
      if (mode === 'full') { this._exportFullPage(); return; }

      const hidden = [this.toolbar?.root, this.toolbar?.puck, this.toolbar?.popover, this.cursor, this.canvas?.live].filter(Boolean);
      const prev = hidden.map((el) => el.style.visibility);
      hidden.forEach((el) => (el.style.visibility = 'hidden'));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      chrome.runtime.sendMessage({ type: 'DP_CAPTURE' }, (resp) => {
        hidden.forEach((el, i) => (el.style.visibility = prev[i]));
        if (!resp || resp.error || !resp.dataUrl) {
          console.warn('[Draw on Web] Export failed:', resp && resp.error);
          return;
        }
        this._downloadDataUrl(resp.dataUrl);
      });
    },

    // Full-page export: render EVERY stroke across the whole document (not just
    // the viewport) onto one PNG, so nothing you drew off-screen is lost. Ink is
    // composited on white; annotation fidelity is exact at any page length.
    _exportFullPage() {
      const { w, h } = this.canvas.documentSize();
      if (!w || !h) return;
      // Bound the backing store so a very tall page can't blow up memory.
      const MAX_PX = 40000000;
      let scale = Math.min(window.devicePixelRatio || 1, 2);
      if (w * h * scale * scale > MAX_PX) scale = Math.max(0.25, Math.sqrt(MAX_PX / (w * h)));

      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * scale));
      c.height = Math.max(1, Math.round(h * scale));
      const ctx = c.getContext('2d');
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      this.engine.render(ctx); // strokes are in document coordinates

      let url;
      try { url = c.toDataURL('image/png'); }
      catch (e) { console.warn('[Draw on Web] Full-page export failed:', e && e.message); return; }
      this._downloadDataUrl(url);
    },

    _downloadDataUrl(dataUrl) {
      if (!dataUrl) return;
      const a = document.createElement('a');
      const name = (document.title || 'drawing-pen').replace(/[^\w.-]+/g, '_').slice(0, 60);
      a.href = dataUrl;
      a.download = `${name || 'annotation'}.png`;
      document.documentElement.appendChild(a);
      a.click();
      a.remove();
    },

    // ---- confirm dialog (custom, premium, "ask once") --------------------
    async _confirmClear() {
      const skip = await Storage.getLocal('clearNoConfirm', false);
      if (skip) { this._doClear(); return; }
      this._showConfirm({
        title: 'Clear all annotations?',
        message: 'This removes everything you drew on this page. You can still undo with Ctrl+Z.',
        confirmLabel: 'Clear all',
        danger: true,
        remember: true
      }, (ok, dontAskAgain) => {
        if (!ok) return;
        if (dontAskAgain) Storage.setLocal('clearNoConfirm', true);
        this._doClear();
      });
    },
    _doClear() { this._clearSelection(); this.engine.clear(); },

    _showConfirm(opts, cb) {
      if (this._modal) this._modal.remove();
      const overlay = document.createElement('div');
      overlay.className = 'dp-modal-overlay';
      overlay.innerHTML =
        '<div class="dp-modal" role="dialog" aria-modal="true">' +
        `<div class="dp-modal-title">${opts.title}</div>` +
        `<div class="dp-modal-msg">${opts.message || ''}</div>` +
        (opts.remember
          ? '<label class="dp-modal-remember"><input type="checkbox" class="dp-modal-dontask"><span>Don’t ask again</span></label>'
          : '') +
        '<div class="dp-modal-actions">' +
        '<button type="button" class="dp-modal-btn dp-cancel">Cancel</button>' +
        `<button type="button" class="dp-modal-btn dp-confirm${opts.danger ? ' danger' : ''}">${opts.confirmLabel || 'OK'}</button>` +
        '</div></div>';
      const theme = this.settings && this.settings.theme;
      if (theme === 'light') overlay.classList.add('dp-theme-light');
      else if (theme === 'dark') overlay.classList.add('dp-theme-dark');
      if (this.settings) overlay.style.setProperty('--dp-accent', this.settings.accentColor);

      const done = (ok) => {
        const dontAsk = overlay.querySelector('.dp-modal-dontask');
        overlay.remove();
        this._modal = null;
        cb(ok, dontAsk ? dontAsk.checked : false);
      };
      overlay.querySelector('.dp-cancel').addEventListener('click', () => done(false));
      overlay.querySelector('.dp-confirm').addEventListener('click', () => done(true));
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) done(false); });
      document.documentElement.appendChild(overlay);
      this._modal = overlay;
      setTimeout(() => overlay.querySelector('.dp-confirm').focus(), 0);
    },

    // ---- first-run input-device picker -----------------------------------
    // Shown once, the very first time the pen is switched on, so we can tune
    // gestures + hit tolerances to how the person actually points. Pre-highlights
    // the auto-detected device; choosing is optional (Skip keeps auto-detect).
    // `done` is called after the picker closes, to chain into the welcome tour.
    _showInputPicker(done) {
      if (this._inputPicker) this._inputPicker.remove();
      const detected = this._resolveInputMode('auto');
      const OPTS = [
        { id: 'mouse', desc: 'A regular mouse — click and drag to draw.' },
        { id: 'trackpad', desc: 'A laptop touchpad — press and glide to draw; two-finger scroll and pinch-to-zoom keep working.' },
        { id: 'touch', desc: 'A touchscreen — one finger draws, two fingers scroll the page.' }
      ];

      const overlay = document.createElement('div');
      overlay.className = 'dp-modal-overlay dp-input-overlay';
      const theme = this.settings && this.settings.theme;
      if (theme === 'light') overlay.classList.add('dp-theme-light');
      else if (theme === 'dark') overlay.classList.add('dp-theme-dark');
      if (this.settings) overlay.style.setProperty('--dp-accent', this.settings.accentColor);

      overlay.innerHTML =
        '<div class="dp-input-picker" role="dialog" aria-modal="true" aria-label="Choose your input device">' +
          '<div class="dp-ip-title">How do you draw?</div>' +
          '<div class="dp-ip-sub">Pick your device so drawing feels right everywhere. You can change it anytime from the toolbar or Settings.</div>' +
          '<div class="dp-ip-grid">' +
          OPTS.map((o) =>
            `<button type="button" class="dp-ip-card${o.id === detected ? ' is-suggested' : ''}" data-mode="${o.id}">` +
              `<span class="dp-ip-ico">${inputSvg(o.id, 30)}</span>` +
              `<span class="dp-ip-name">${INPUT_LABELS[o.id]}${o.id === detected ? '<em>Detected</em>' : ''}</span>` +
              `<span class="dp-ip-desc">${o.desc}</span>` +
            '</button>').join('') +
          '</div>' +
          '<button type="button" class="dp-ip-skip">Not sure — decide for me</button>' +
        '</div>';

      const close = (mode) => {
        overlay.remove();
        if (this._inputPicker === overlay) this._inputPicker = null;
        if (mode) this.setInputMode(mode);
        if (done) done();
      };
      overlay.querySelectorAll('.dp-ip-card').forEach((btn) =>
        btn.addEventListener('click', () => close(btn.dataset.mode)));
      overlay.querySelector('.dp-ip-skip').addEventListener('click', () => close(null));
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(null); });

      document.documentElement.appendChild(overlay);
      this._inputPicker = overlay;
      setTimeout(() => { const c = overlay.querySelector('.dp-ip-card.is-suggested') || overlay.querySelector('.dp-ip-card'); c && c.focus(); }, 0);
    },

    // ---- interactive welcome / guide (onboarding + reopenable) -----------
    // A short, animated carousel that shows what makes Draw on Web different,
    // rather than a wall of text. Each slide has its own little visual so the
    // unique bits (ink that scrolls with the page, the full toolset, the
    // customisation) actually land. Reopenable anytime from the toolbar's help
    // button. Navigable by dots, Back/Next, or arrow keys.
    _showGuide() {
      if (this._guide) { this._guide.remove(); this._guide = null; }

      const slides = this._guideSlides();
      let idx = 0;

      const overlay = document.createElement('div');
      overlay.className = 'dp-modal-overlay dp-guide-overlay';
      overlay.innerHTML =
        '<div class="dp-guide2" role="dialog" aria-modal="true" aria-label="Welcome to Draw on Web">' +
          '<button type="button" class="dp-guide2-skip" aria-label="Close">Skip</button>' +
          '<div class="dp-guide2-stage"></div>' +
          '<div class="dp-guide2-foot">' +
            '<div class="dp-guide2-dots" role="tablist"></div>' +
            '<div class="dp-guide2-nav">' +
              '<button type="button" class="dp-guide2-btn dp-guide2-back">Back</button>' +
              '<button type="button" class="dp-guide2-btn dp-guide2-next is-primary"></button>' +
            '</div>' +
          '</div>' +
        '</div>';

      const theme = this.settings && this.settings.theme;
      if (theme === 'light') overlay.classList.add('dp-theme-light');
      else if (theme === 'dark') overlay.classList.add('dp-theme-dark');
      if (this.settings) overlay.style.setProperty('--dp-accent', this.settings.accentColor);

      const stage = overlay.querySelector('.dp-guide2-stage');
      const dotsEl = overlay.querySelector('.dp-guide2-dots');
      const backBtn = overlay.querySelector('.dp-guide2-back');
      const nextBtn = overlay.querySelector('.dp-guide2-next');

      dotsEl.innerHTML = slides
        .map((_, i) => `<button type="button" class="dp-guide2-dot" data-i="${i}" aria-label="Slide ${i + 1}"></button>`)
        .join('');
      const dots = Array.from(dotsEl.querySelectorAll('.dp-guide2-dot'));

      const close = () => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        if (this._guide === overlay) this._guide = null;
      };

      const render = (dir) => {
        const s = slides[idx];
        const card = document.createElement('div');
        card.className = 'dp-guide2-slide' + (dir < 0 ? ' from-left' : dir > 0 ? ' from-right' : '');
        card.innerHTML =
          `<div class="dp-guide2-visual">${s.visual}</div>` +
          `<div class="dp-guide2-copy">` +
            (s.tag ? `<div class="dp-guide2-tag">${s.tag}</div>` : '') +
            `<div class="dp-guide2-title">${s.title}</div>` +
            `<div class="dp-guide2-desc">${s.desc}</div>` +
          `</div>`;
        stage.replaceChildren(card);
        // Trigger the enter transition on the next frame.
        requestAnimationFrame(() => card.classList.remove('from-left', 'from-right'));
        dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
        backBtn.style.visibility = idx === 0 ? 'hidden' : 'visible';
        nextBtn.textContent = idx === slides.length - 1 ? 'Start drawing' : 'Next';
        // Wire any in-slide action buttons (e.g. "Open settings").
        const act = card.querySelector('[data-action="settings"]');
        if (act) act.addEventListener('click', () => this._buildApi().openSettings());
      };

      const go = (n) => {
        const dir = n > idx ? 1 : -1;
        idx = Math.max(0, Math.min(slides.length - 1, n));
        render(dir);
      };
      const next = () => { if (idx >= slides.length - 1) close(); else go(idx + 1); };
      const back = () => go(idx - 1);

      const onKey = (e) => {
        if (e.key === 'ArrowRight') { next(); e.preventDefault(); e.stopPropagation(); }
        else if (e.key === 'ArrowLeft') { back(); e.preventDefault(); e.stopPropagation(); }
        else if (e.key === 'Enter') { next(); e.preventDefault(); e.stopPropagation(); }
        else if (e.key === 'Escape') { close(); e.preventDefault(); e.stopPropagation(); }
      };

      nextBtn.addEventListener('click', next);
      backBtn.addEventListener('click', back);
      dots.forEach((d) => d.addEventListener('click', () => go(Number(d.dataset.i))));
      overlay.querySelector('.dp-guide2-skip').addEventListener('click', close);
      overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
      document.addEventListener('keydown', onKey, true);

      document.documentElement.appendChild(overlay);
      this._guide = overlay;
      render(0);
      setTimeout(() => nextBtn.focus(), 0);
    },

    // Slide content for the welcome carousel. Kept as data (visual HTML + copy)
    // so the flow above stays generic. Visuals are tiny inline SVG/CSS scenes —
    // no assets, no network — themed by the same accent as the rest of the UI.
    _guideSlides() {
      const MOD = Storage.MOD_LABEL;   // "⌘" on macOS, "Ctrl" elsewhere
      const penLogo =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="34" height="34"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
      const toolIco = (p) =>
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">${p}</svg>`;

      return [
        {
          tag: 'Welcome',
          title: 'Meet Draw on Web',
          desc: 'Draw, highlight, and annotate right on top of any web page. Here’s what makes it different from every other pen extension — in a few quick cards.',
          visual:
            '<div class="dp-g-hero">' +
              `<div class="dp-g-hero-logo">${penLogo}</div>` +
              '<div class="dp-g-hero-scribble"><svg viewBox="0 0 220 120" width="100%" height="100%" fill="none" stroke-linecap="round">' +
                '<path class="dp-g-draw" d="M20 80 C 55 20, 85 20, 110 70 S 170 120, 200 45" stroke-width="6"/>' +
                '<circle class="dp-g-draw2" cx="150" cy="60" r="26" stroke="#38bdf8" stroke-width="4" stroke-dasharray="4 6"/>' +
              '</svg></div>' +
            '</div>'
        },
        {
          tag: 'What sets it apart',
          title: 'Your ink scrolls with the page',
          desc: 'Most drawing extensions freeze your marks on a single screen — scroll, and they slide out of place. Draw on Web pins every mark to the <b>content itself</b>. Scroll a long article, a docs page, even inner panels like ChatGPT threads, and your annotations follow — exactly where you left them.',
          visual:
            '<div class="dp-g-browser">' +
              '<div class="dp-g-bar"><span></span><span></span><span></span></div>' +
              '<div class="dp-g-viewport">' +
                '<div class="dp-g-scroll">' +
                  '<div class="dp-g-line l1"></div><div class="dp-g-line l2"></div><div class="dp-g-line l3"></div>' +
                  '<div class="dp-g-anno"><svg viewBox="0 0 120 60" width="120" height="60" fill="none"><path d="M8 40 C 30 8, 60 8, 74 34" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M74 34 l -12 -2 M74 34 l -2 -12" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg></div>' +
                  '<div class="dp-g-line l1"></div><div class="dp-g-line l3"></div><div class="dp-g-line l2"></div>' +
                  '<div class="dp-g-hl"></div>' +
                  '<div class="dp-g-line l2"></div><div class="dp-g-line l1"></div>' +
                '</div>' +
              '</div>' +
              '<div class="dp-g-pin">stays anchored while you scroll</div>' +
            '</div>'
        },
        {
          tag: 'One toolkit for everything',
          title: 'A whole annotation studio',
          desc: 'Pen and highlighter, arrows and lines, rectangles and ellipses, text boxes, and auto-numbered step stamps. Then <b>select, move, resize, or restyle</b> anything you’ve drawn — nothing is locked once it’s down.',
          visual:
            '<div class="dp-g-tools">' +
              [
                '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',       // pen
                '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>', // highlighter
                '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',                                                 // arrow
                '<rect x="3" y="4" width="18" height="16" rx="2"/>',                                         // rect
                '<circle cx="12" cy="12" r="9"/>',                                                           // ellipse
                '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',                             // text
                '<circle cx="12" cy="12" r="9"/><path d="M11 9.5 12.5 8.5V16"/><path d="M11 16h3"/>',        // number stamp
                '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>' // select
              ].map((inner, i) => `<div class="dp-g-tool" style="--d:${i * 55}ms">${toolIco(inner)}</div>`).join('') +
            '</div>'
        },
        {
          tag: 'Any device',
          title: 'Mouse, trackpad, or touch',
          desc: 'Draw on Web <b>detects how you point</b> and adapts to it. Click-drag with a mouse; press-and-glide on a trackpad — <b>two-finger scroll and pinch-to-zoom keep working</b>; or one-finger draw and two-finger scroll on a touchscreen, with bigger touch targets and stylus palm-rejection. It asks once on first run, and you can switch anytime from the toolbar or Settings.',
          visual:
            '<div class="dp-g-devices">' +
              [['mouse', 'Mouse'], ['trackpad', 'Trackpad'], ['touch', 'Touch']]
                .map(([id, label], i) => `<div class="dp-g-device" style="--d:${i * 110}ms">${inputSvg(id, 26)}<span>${label}</span></div>`).join('') +
              '<div class="dp-g-device-note">Auto-detected · switch anytime</div>' +
            '</div>'
        },
        {
          tag: 'Make it yours',
          title: 'A toolbar that fits you',
          desc: 'Shape the bar to your workflow — <b>size, corner shape, colour, position</b>, and which tools appear (and in what order). Drag it anywhere or collapse it to a puck; it even <b>compacts itself</b> on narrow windows. Plus themes and accents, a custom palette, stroke smoothing, PNG export, and auto-restore. <button type="button" class="dp-g-link" data-action="settings">Open Settings</button> to dial it in.',
          visual:
            '<div class="dp-g-custom">' +
              '<div class="dp-g-swatches">' +
                ['#ef4444', '#f59e0b', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#a855f7', '#ec4899']
                  .map((c, i) => `<span style="background:${c};--d:${i * 40}ms"></span>`).join('') +
              '</div>' +
              '<div class="dp-g-rows">' +
                '<div class="dp-g-row"><span class="dp-g-chip">Theme</span><span class="dp-g-toggle"></span></div>' +
                '<div class="dp-g-row"><span class="dp-g-chip">Smoothing</span><span class="dp-g-track"><i></i></span></div>' +
                '<div class="dp-g-row"><span class="dp-g-chip">Toolbar</span><span class="dp-g-track alt"><i></i></span></div>' +
              '</div>' +
            '</div>'
        },
        {
          tag: 'You’re ready',
          title: 'Start annotating',
          desc: `Toggle anytime with <kbd>${MOD}</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd>. Switch tools with single keys — <kbd>P</kbd>en, <kbd>H</kbd>ighlighter, <kbd>T</kbd>ext, <kbd>E</kbd>raser. Undo with <kbd>${MOD}</kbd>+<kbd>Z</kbd>, and press <kbd>C</kbd> to use the site normally while your marks stay put.`,
          visual:
            '<div class="dp-g-ready">' +
              `<div class="dp-g-ready-logo">${penLogo}</div>` +
              '<div class="dp-g-ready-keys">' +
                `<kbd>${MOD}</kbd><kbd>Shift</kbd><kbd>D</kbd>` +
              '</div>' +
            '</div>'
        }
      ];
    },

    // ---- persistence -----------------------------------------------------
    _scheduleSave() {
      if (!this.settings || !this.settings.autoRestore) return;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        if (this.engine) Storage.saveDrawing(location.href, this.engine.toJSON());
      }, 600);
    },
    async _restoreForUrl() {
      const saved = await Storage.loadDrawing(location.href);
      if (saved && saved.length) this.engine.loadJSON(saved);
    },

    // ---- SPA route watching ---------------------------------------------
    _startRouteWatch() {
      this._lastHref = location.href;
      window.addEventListener('popstate', this._checkRoute, true);
      window.addEventListener('hashchange', this._checkRoute, true);
      this._routeTimer = setInterval(this._checkRoute, 350);
    },
    _stopRouteWatch() {
      clearInterval(this._routeTimer);
      this._routeTimer = null;
      window.removeEventListener('popstate', this._checkRoute, true);
      window.removeEventListener('hashchange', this._checkRoute, true);
    },
    async _checkRoute() {
      if (!this.active || location.href === this._lastHref) return;
      const prevHref = this._lastHref;
      this._lastHref = location.href;
      this._commitText(true);
      this._clearSelection();
      // Flush any pending autosave for the page we're leaving, so annotations
      // made just before an SPA navigation aren't lost to the debounce window.
      if (this.settings && this.settings.autoRestore && this.engine) {
        clearTimeout(this._saveTimer);
        Storage.saveDrawing(prevHref, this.engine.toJSON());
      }
      this.engine.loadJSON([]);
      // New view: drop the old scroll anchor (its container is likely gone) and
      // fall back to the root until the next stroke/scroll re-detects one.
      this.canvas && this.canvas.setScroller(null);
      this.canvas && this.canvas.resize(); // new view may differ in size
      if (this.settings && this.settings.autoRestore) await this._restoreForUrl();
    },

    // ---- keyboard --------------------------------------------------------
    _onKeyDown(e) {
      const self = window.__drawingPen;
      if (!self.active) return;
      // The welcome carousel installs its own capture-phase key handler (arrows /
      // Enter / Esc drive its navigation), so keep the canvas keys out of the way
      // while it's open and let that handler own the keyboard.
      if (self._guide) return;
      // In native fullscreen (e.g. a fullscreen video) our overlay isn't on screen
      // and the keyboard belongs entirely to the page/browser — Esc exits, F/J/L
      // drive the player. Claim nothing until fullscreen is left, so exiting
      // fullscreen never doubles as "turn drawing off".
      if (document.fullscreenElement) return;
      // While the confirm dialog is open, keep keys out of the canvas.
      if (self._modal) {
        if (e.key === 'Escape') { self._modal.querySelector('.dp-cancel').click(); e.preventDefault(); }
        else if (e.key === 'Enter') { self._modal.querySelector('.dp-confirm').click(); e.preventDefault(); }
        return;
      }
      if (e.key === 'Shift') { self._shiftDown = true; return; }

      const t = e.target;
      const typing = self._textEl || (t && (t.isContentEditable ||
        /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)));

      if (e.key === 'Escape') {
        if (self._textEl) self._commitText(true);
        else if (self.selection.indices.length || self._marquee) self._clearSelection();
        else self.deactivate();
        e.preventDefault();
        return;
      }
      if (typing) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && self.selection.indices.length) {
        self.engine.deleteStrokes(self.selection.indices);
        self._clearSelection();
        e.preventDefault();
        return;
      }

      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === 'z' || e.key === 'Z')) {
        self._clearSelection();
        e.shiftKey ? self.engine.redo() : self.engine.undo();
        e.preventDefault(); return;
      }
      if (mod && (e.key === 'y' || e.key === 'Y')) { self._clearSelection(); self.engine.redo(); e.preventDefault(); return; }
      if (mod) return;

      // On pages that drive themselves from the keyboard (video players like
      // YouTube: F = fullscreen, J/L = seek, M = mute, C = captions, T = theater…)
      // a bare letter belongs to the SITE, not our tool shortcuts. If we grabbed it
      // — and called preventDefault — the page's own handler would see the event as
      // already handled and do nothing, which is exactly why F wouldn't go
      // fullscreen while drawing. So yield every single-key shortcut on those pages
      // and let the site keep its keys; tools are still one click away on the
      // toolbar, and the pen still draws with the pointer. Ordinary pages (no
      // prominent media) keep the single-key hotkeys unchanged.
      if (self._hostHandlesKeys()) return;

      const k = e.key.toLowerCase();
      if (k === 'c') { self.setInteractive(!self.interactive); e.preventDefault(); return; }
      if (HOTKEYS[k]) { self.selectTool(HOTKEYS[k]); e.preventDefault(); }
    },

    // True when the page itself is likely listening for bare-letter keyboard
    // shortcuts, so we should NOT claim single keys as tool hotkeys. Signals: an
    // active native fullscreen, or a <video>/<audio> that's playing or a paused
    // video still shown prominently on screen (a paused YouTube player still owns
    // F/J/L). Kept cheap since it runs per keydown; permissive on any error.
    _hostHandlesKeys() {
      try {
        if (document.fullscreenElement) return true;
        const media = document.querySelectorAll('video, audio');
        const vw = window.innerWidth, vh = window.innerHeight;
        for (const m of media) {
          if (!m.paused) return true;                       // actively playing
          if (m.tagName === 'AUDIO') {
            if (m.currentTime > 0 || m.controls) return true;
            continue;
          }
          // Paused but prominent, on-screen video (e.g. a paused player).
          const r = m.getBoundingClientRect();
          const onScreen = r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
          if (onScreen && r.width >= 200 && r.height >= 120) return true;
        }
      } catch (_e) { /* be permissive — never let detection break key handling */ }
      return false;
    },

    _onKeyUp(e) {
      const self = window.__drawingPen;
      if (e.key === 'Shift') self._shiftDown = false;
    }
  };

  DrawingPen._onKeyDown = DrawingPen._onKeyDown.bind(DrawingPen);
  DrawingPen._onKeyUp = DrawingPen._onKeyUp.bind(DrawingPen);
  DrawingPen._checkRoute = DrawingPen._checkRoute.bind(DrawingPen);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'DP_TOGGLE') {
      DrawingPen.toggle().then(() => sendResponse?.({ active: DrawingPen.active }));
      return true;
    }
    return false;
  });

  window.__drawingPen = DrawingPen;

  // ---- first-run hint (shown once, points at the toolbar icon) ----------
  async function maybeShowFirstRun() {
    if (window.top !== window) return;
    const seen = await Storage.getLocal('firstRunSeen', false);
    if (seen) return;
    Storage.setLocal('firstRunSeen', true);

    const tip = document.createElement('div');
    tip.className = 'dp-firstrun';
    tip.innerHTML =
      '<div class="dp-firstrun-arrow"></div>' +
      '<strong>Draw on Web</strong> is ready — click the pinned icon ' +
      `or press <kbd>${Storage.MOD_LABEL}</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> to start drawing.` +
      '<button class="dp-firstrun-x" aria-label="Dismiss">&times;</button>';
    const close = () => tip.remove();
    tip.querySelector('.dp-firstrun-x').addEventListener('click', close);
    document.documentElement.appendChild(tip);
    setTimeout(close, 8000);
  }
  maybeShowFirstRun();
})();
