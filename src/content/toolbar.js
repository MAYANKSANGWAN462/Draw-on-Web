// Draw on Web — floating toolbar (slim horizontal bar)
// ---------------------------------------------------------------------------
// A thin, wide, glassy toolbar: a single row of icon buttons that reads like a
// premium control strip (Linear / Raycast / macOS control center). Color,
// thickness and opacity live in a compact popover so the bar itself stays thin.
//
// Draggable (by the left grip), collapsible to a circular puck, position +
// state persisted in chrome.storage.local. Tool visibility / order / theme /
// accent come from settings (chrome.storage.sync).
// ---------------------------------------------------------------------------

(function () {
  'use strict';
  if (window.__DrawingPenToolbar) return;

  const Storage = window.__DrawingPenStorage;

  // Inline Lucide icons (https://lucide.dev), stroke-based, currentColor.
  const ICONS = {
    select: '<path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h1"/><path d="M14 3h1"/><path d="M14 21h1"/><path d="M3 9v1"/><path d="M21 9v1"/><path d="M3 14v1"/><path d="M21 14v1"/>',
    pen: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/>',
    highlighter: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
    line: '<line x1="20" y1="4" x2="4" y2="20"/>',
    rect: '<rect x="3" y="4" width="18" height="16" rx="2"/>',
    ellipse: '<circle cx="12" cy="12" r="9"/>',
    arrow: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
    text: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
    rectFill: '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" stroke="none"/>',
    ellipseFill: '<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>',
    counter: '<circle cx="12" cy="12" r="9"/><path d="M11 9.5 12.5 8.5V16"/><path d="M11 16h3"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    clear: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
    cursor: '<path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/>',
    export: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    exit: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    collapse: '<path d="m15 18-6-6 6-6"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'
  };

  const TOOL_META = {
    select: { label: 'Select / move / resize', hotkey: 'S' },
    pen: { label: 'Pen', hotkey: 'P' },
    highlighter: { label: 'Highlighter', hotkey: 'H' },
    line: { label: 'Line', hotkey: 'L' },
    rect: { label: 'Rectangle', hotkey: 'R' },
    ellipse: { label: 'Ellipse', hotkey: 'O' },
    arrow: { label: 'Arrow', hotkey: 'A' },
    text: { label: 'Text', hotkey: 'T' },
    eraser: { label: 'Eraser', hotkey: 'E' },
    rectFill: { label: 'Filled rectangle', hotkey: 'F' },
    ellipseFill: { label: 'Filled ellipse', hotkey: 'G' },
    counter: { label: 'Number stamp', hotkey: 'N' }
  };

  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" width="19" height="19" aria-hidden="true">' +
      ICONS[name] + '</svg>';
  }

  class Toolbar {
    constructor(api) {
      this.api = api;
      this.settings = Storage.DEFAULT_SETTINGS;
      this.root = null;
      this.puck = null;
      this.popover = null;
      this.collapsed = false;
      this._toolButtons = {};
      this._swatches = [];
      this._dragCleanups = [];
      this._onDocClick = this._onDocClick.bind(this);
      this._onWinResize = this._onWinResize.bind(this);
    }

    async mount() {
      this.settings = await Storage.getSettings();
      const saved = await Storage.getToolbarState();

      this._build();
      this._applyTheme(this.settings.theme);
      this._applyAccent(this.settings.accentColor);
      this._applyAppearance(this.settings);

      const pos = saved.position || this._cornerToPos(this.settings.defaultPosition);
      this._setPosition(pos);
      if (saved.collapsed) this._collapse(true, false);

      document.addEventListener('pointerdown', this._onDocClick, true);
      window.addEventListener('resize', this._onWinResize);
      this.refresh();
    }

    destroy() {
      this._dragCleanups.forEach((fn) => fn());
      this._dragCleanups = [];
      clearTimeout(this._animTimer);
      document.removeEventListener('pointerdown', this._onDocClick, true);
      window.removeEventListener('resize', this._onWinResize);
      this.root && this.root.remove();
      this.puck && this.puck.remove();
      this.popover && this.popover.remove();
      this.root = this.puck = this.popover = null;
    }

    applySettings(settings) {
      this.settings = settings;
      this._applyTheme(settings.theme);
      this._applyAccent(settings.accentColor);
      this._applyAppearance(settings);
      this._rebuildTools();
      this._rebuildPalette();
      this.refresh();
    }

    // ---- build DOM -------------------------------------------------------
    _build() {
      const root = document.createElement('div');
      root.className = 'dp-toolbar';
      root.setAttribute('role', 'toolbar');
      root.setAttribute('aria-label', 'Draw on Web tools');

      // Drag grip.
      const grip = document.createElement('div');
      grip.className = 'dp-grip';
      grip.title = 'Drag to move';
      grip.setAttribute('aria-label', 'Drag toolbar');
      grip.innerHTML = svg('grip');
      root.appendChild(grip);

      // Tools.
      const tools = document.createElement('div');
      tools.className = 'dp-group dp-tools';
      root.appendChild(tools);
      this._toolsEl = tools;
      this._rebuildTools();

      root.appendChild(this._sep());

      // Color button (opens popover).
      const colorBtn = document.createElement('button');
      colorBtn.type = 'button';
      colorBtn.className = 'dp-color-btn';
      colorBtn.setAttribute('aria-label', 'Color & size');
      colorBtn.title = 'Color & size';
      colorBtn.innerHTML = '<span class="dp-color-dot"></span>';
      colorBtn.addEventListener('click', (e) => { e.stopPropagation(); this._togglePopover(); });
      root.appendChild(colorBtn);
      this._colorBtn = colorBtn;
      this._colorDot = colorBtn.querySelector('.dp-color-dot');

      // Inline size slider — direct thickness access without opening the popover
      // (the most-adjusted control, so it lives right on the bar).
      const sizeWrap = document.createElement('div');
      sizeWrap.className = 'dp-size';
      sizeWrap.title = 'Thickness';
      const sizeInput = document.createElement('input');
      sizeInput.type = 'range';
      sizeInput.min = '1'; sizeInput.max = '20'; sizeInput.step = '1';
      sizeInput.className = 'dp-size-range';
      sizeInput.setAttribute('aria-label', 'Thickness');
      const sizeVal = document.createElement('span');
      sizeVal.className = 'dp-size-val';
      sizeInput.addEventListener('input', () => {
        sizeVal.textContent = sizeInput.value;
        this.api.setWidth(Number(sizeInput.value));
      });
      sizeInput.addEventListener('pointerdown', (e) => e.stopPropagation());
      sizeWrap.append(sizeInput, sizeVal);
      root.appendChild(sizeWrap);
      this._sizeWrap = sizeWrap;
      this._sizeInput = sizeInput;
      this._sizeVal = sizeVal;

      root.appendChild(this._sep());

      // History.
      const hist = document.createElement('div');
      hist.className = 'dp-group';
      this._undoBtn = this._iconButton('undo', 'Undo (Ctrl+Z)', () => this.api.undo());
      this._redoBtn = this._iconButton('redo', 'Redo (Ctrl+Shift+Z)', () => this.api.redo());
      this._clearBtn = this._iconButton('clear', 'Clear all', () => this.api.clear());
      hist.append(this._undoBtn, this._redoBtn, this._clearBtn);
      root.appendChild(hist);

      root.appendChild(this._sep());

      // Cursor / export / settings.
      const meta = document.createElement('div');
      meta.className = 'dp-group';
      // Toggle (not one-way): click once to use the site, click again (or press
      // C) to resume drawing with the current tool — matches the highlighted
      // state the button already shows in cursor mode.
      this._cursorBtn = this._iconButton('cursor', 'Cursor — use the site (C)', () => {
        this.api.setInteractive(!this.api.getState().interactive);
      });
      meta.append(
        this._cursorBtn,
        this._iconButton('export', 'Export PNG', () => this.api.exportPng()),
        this._iconButton('help', 'Quick guide', () => this.api.openGuide()),
        this._iconButton('settings', 'Settings', () => this.api.openSettings())
      );
      root.appendChild(meta);

      root.appendChild(this._sep());

      // Collapse / exit.
      const end = document.createElement('div');
      end.className = 'dp-group';
      end.append(
        this._iconButton('collapse', 'Collapse', () => this._collapse(true)),
        this._iconButton('exit', 'Exit (Esc)', () => this.api.exit())
      );
      root.appendChild(end);

      document.documentElement.appendChild(root);
      this.root = root;

      this._buildPopover();

      // Collapsed puck.
      const puck = document.createElement('button');
      puck.type = 'button';
      puck.className = 'dp-puck';
      puck.setAttribute('aria-label', 'Expand Draw on Web toolbar');
      puck.title = 'Draw on Web';
      puck.innerHTML = svg('pen');
      puck.style.display = 'none';
      puck.addEventListener('click', () => {
        if (this._puckDragged) { this._puckDragged = false; return; }
        this._collapse(false);
      });
      document.documentElement.appendChild(puck);
      this.puck = puck;

      this._wireDrag(grip, root);
      this._wireDrag(puck, puck, true);
    }

    _buildPopover() {
      const pop = document.createElement('div');
      pop.className = 'dp-popover';
      pop.style.display = 'none';
      pop.addEventListener('pointerdown', (e) => e.stopPropagation());

      // Live stroke preview (reflects current color / thickness / opacity).
      const preview = document.createElement('div');
      preview.className = 'dp-preview';
      preview.innerHTML = '<div class="dp-preview-bar"></div>';
      pop.appendChild(preview);
      this._previewBar = preview.querySelector('.dp-preview-bar');

      const palette = document.createElement('div');
      palette.className = 'dp-palette';
      pop.appendChild(palette);
      this._paletteEl = palette;

      // Sliders.
      this._widthSlider = this._slider('Thickness', 1, 20, 1, (v) => this.api.setWidth(v));
      this._opacitySlider = this._slider('Opacity', 5, 100, 5, (v) => this.api.setOpacity(v / 100));
      pop.append(this._widthSlider.wrap, this._opacitySlider.wrap);

      document.documentElement.appendChild(pop);
      this.popover = pop;
      this._rebuildPalette();
    }

    _rebuildPalette() {
      const palette = this._paletteEl;
      if (!palette) return;
      palette.innerHTML = '';
      this._swatches = [];
      for (const hex of this.settings.palette) {
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'dp-swatch';
        sw.style.background = hex;
        sw.dataset.color = hex;
        sw.title = hex;
        sw.setAttribute('aria-label', 'Color ' + hex);
        sw.addEventListener('click', () => { this.api.setColor(hex); });
        palette.appendChild(sw);
        this._swatches.push(sw);
      }
      const custom = document.createElement('label');
      custom.className = 'dp-swatch dp-custom';
      custom.title = 'Custom color';
      custom.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.5" stroke-linecap="round" width="13" height="13" aria-hidden="true">' +
        '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.className = 'dp-color-input';
      colorInput.addEventListener('input', (e) => this.api.setColor(e.target.value));
      custom.appendChild(colorInput);
      palette.appendChild(custom);
      this._colorInput = colorInput;
    }

    _rebuildTools() {
      const el = this._toolsEl;
      if (!el) return;
      el.innerHTML = '';
      this._toolButtons = {};
      const order = this.settings.toolOrder || Storage.ALL_TOOLS;
      for (const id of order) {
        if (!TOOL_META[id]) continue;
        if (this.settings.toolVisibility && this.settings.toolVisibility[id] === false) continue;
        const meta = TOOL_META[id];
        const btn = this._iconButton(id, `${meta.label} (${meta.hotkey})`, () => this.api.selectTool(id));
        btn.dataset.tool = id;
        el.appendChild(btn);
        this._toolButtons[id] = btn;
      }
    }

    // ---- small builders --------------------------------------------------
    _iconButton(icon, label, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'dp-btn';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.innerHTML = svg(icon);
      b.addEventListener('click', onClick);
      return b;
    }

    _sep() {
      const s = document.createElement('div');
      s.className = 'dp-vr';
      return s;
    }

    _slider(label, min, max, step, onInput) {
      const wrap = document.createElement('div');
      wrap.className = 'dp-slider';
      const lab = document.createElement('div');
      lab.className = 'dp-slider-label';
      const name = document.createElement('span'); name.textContent = label;
      const val = document.createElement('span'); val.className = 'dp-slider-val';
      lab.append(name, val);
      const input = document.createElement('input');
      input.type = 'range'; input.min = min; input.max = max; input.step = step;
      input.setAttribute('aria-label', label);
      input.addEventListener('input', () => { val.textContent = input.value; onInput(Number(input.value)); });
      wrap.append(lab, input);
      return { wrap, input, val };
    }

    // ---- popover open/close ---------------------------------------------
    _togglePopover(force) {
      const show = force != null ? force : this.popover.style.display === 'none';
      if (show) {
        this._positionPopover();
        this.popover.style.display = 'block';
        this._colorBtn.classList.add('is-open');
      } else {
        this.popover.style.display = 'none';
        this._colorBtn.classList.remove('is-open');
      }
    }
    _positionPopover() {
      const r = this._colorBtn.getBoundingClientRect();
      const pop = this.popover;
      pop.style.visibility = 'hidden';
      pop.style.display = 'block';
      const pw = pop.offsetWidth, ph = pop.offsetHeight;
      let left = r.left + r.width / 2 - pw / 2;
      let top = r.bottom + 8;
      if (top + ph > window.innerHeight - 8) top = r.top - ph - 8; // flip up
      left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
      pop.style.left = left + 'px';
      pop.style.top = Math.max(8, top) + 'px';
      pop.style.visibility = '';
    }
    _onDocClick(e) {
      if (this.popover && this.popover.style.display !== 'none') {
        if (!this.popover.contains(e.target) && !this._colorBtn.contains(e.target)) {
          this._togglePopover(false);
        }
      }
    }

    // Keep the bar (or collapsed puck) on-screen when the window is resized.
    _onWinResize() {
      if (this._winResizeRaf) return;
      this._winResizeRaf = true;
      requestAnimationFrame(() => {
        this._winResizeRaf = false;
        if (this.collapsed) {
          if (!this.puck) return;
          const r = this.puck.getBoundingClientRect();
          this.puck.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 60)) + 'px';
          this.puck.style.top = Math.max(8, Math.min(r.top, window.innerHeight - 60)) + 'px';
        } else if (this.root) {
          const r = this.root.getBoundingClientRect();
          this._setPosition({ left: r.left, top: r.top });
        }
        this._togglePopover(false);
      });
    }

    // ---- state sync ------------------------------------------------------
    refresh() {
      const s = this.api.getState();
      for (const [id, btn] of Object.entries(this._toolButtons)) {
        btn.classList.toggle('is-active', s.interactive && id === s.tool);
      }
      this._cursorBtn.classList.toggle('is-active', !s.interactive);
      if (this._colorDot) this._colorDot.style.background = s.color;
      if (this._previewBar) {
        this._previewBar.style.height = Math.max(2, Math.min(s.width, 26)) + 'px';
        this._previewBar.style.background = s.color;
        this._previewBar.style.opacity = String(s.opacity ?? 1);
      }
      for (const sw of this._swatches) {
        sw.classList.toggle('is-active', sw.dataset.color.toLowerCase() === (s.color || '').toLowerCase());
      }
      if (this._colorInput) this._colorInput.value = /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#000000';
      this._widthSlider.input.value = s.width;
      this._widthSlider.val.textContent = s.width;
      if (this._sizeInput) {
        this._sizeInput.value = s.width;
        this._sizeVal.textContent = s.width;
      }
      const opPct = Math.round((s.opacity ?? 1) * 100);
      this._opacitySlider.input.value = opPct;
      this._opacitySlider.val.textContent = opPct;
      this._undoBtn.disabled = !s.canUndo;
      this._redoBtn.disabled = !s.canRedo;
      this._clearBtn.disabled = !s.canClear;
    }

    // ---- theme / accent --------------------------------------------------
    _applyTheme(theme) {
      for (const el of [this.root, this.puck, this.popover]) {
        if (!el) continue;
        el.classList.remove('dp-theme-light', 'dp-theme-dark');
        if (theme === 'light') el.classList.add('dp-theme-light');
        else if (theme === 'dark') el.classList.add('dp-theme-dark');
      }
    }
    _applyAccent(hex) {
      if (!hex) return;
      for (const el of [this.root, this.puck, this.popover]) el && el.style.setProperty('--dp-accent', hex);
    }

    // Size / shape / custom colour — all driven through CSS variables so the bar
    // restyles instantly, with automatic light/dark contrast for a custom colour.
    _applyAppearance(s) {
      const SIZES = {
        compact: { btn: '28px', icon: '16px', pad: '4px 5px', gap: '2px' },
        regular: { btn: '34px', icon: '19px', pad: '5px 6px', gap: '3px' },
        large: { btn: '40px', icon: '22px', pad: '7px 8px', gap: '4px' }
      };
      const RADII = { sharp: '8px', rounded: '15px', pill: '26px' };
      // The selected/hovered icon's corners track the bar's shape.
      const BTN_RADII = { sharp: '6px', rounded: '9px', pill: '50%' };
      const sz = SIZES[s.toolbarSize] || SIZES.regular;
      const rad = RADII[s.toolbarRadius] || RADII.rounded;
      const btnRad = BTN_RADII[s.toolbarRadius] || BTN_RADII.rounded;
      if (this.root) {
        this.root.style.setProperty('--dp-btn', sz.btn);
        this.root.style.setProperty('--dp-icon', sz.icon);
        this.root.style.setProperty('--dp-pad', sz.pad);
        this.root.style.setProperty('--dp-gap', sz.gap);
        this.root.style.setProperty('--dp-radius', rad);
        this.root.style.setProperty('--dp-btn-radius', btnRad);
      }
      if (this.popover) this.popover.style.setProperty('--dp-btn', sz.btn);

      const CUSTOM = ['--dp-bg', '--dp-fg', '--dp-fg-dim', '--dp-border', '--dp-hover', '--dp-hi'];
      const paint = (el) => {
        if (!el) return;
        if (s.toolbarColor) {
          const dark = isDarkColor(s.toolbarColor);
          el.style.setProperty('--dp-bg', s.toolbarColor);
          el.style.setProperty('--dp-fg', dark ? '#f5f5f7' : '#1c1c1f');
          el.style.setProperty('--dp-fg-dim', dark ? '#a1a1aa' : '#6b7280');
          el.style.setProperty('--dp-border', dark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.12)');
          el.style.setProperty('--dp-hover', dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)');
          el.style.setProperty('--dp-hi', dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.9)');
        } else {
          for (const p of CUSTOM) el.style.removeProperty(p);
        }
      };
      paint(this.root);
      paint(this.popover);

      // Inline size slider visibility.
      if (this._sizeWrap) this._sizeWrap.style.display = s.showSizeSlider === false ? 'none' : 'flex';
    }

    // ---- collapse / expand (animated) -----------------------------------
    _collapse(collapsed, persist = true) {
      this.collapsed = collapsed;
      this._togglePopover(false);
      clearTimeout(this._animTimer);

      if (collapsed) {
        const r = this.root.getBoundingClientRect();
        // Fade/scale the bar out, then swap to the puck which pops in.
        this.root.classList.add('dp-hide');
        this._animTimer = setTimeout(() => {
          this.root.style.display = 'none';
          this.root.classList.remove('dp-hide');
        }, 190);
        this.puck.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 60)) + 'px';
        this.puck.style.top = Math.max(8, Math.min(r.top, window.innerHeight - 60)) + 'px';
        this.puck.style.display = 'flex';
        this.puck.classList.add('dp-hide');
        requestAnimationFrame(() => this.puck.classList.remove('dp-hide'));
      } else {
        const r = this.puck.getBoundingClientRect();
        this.puck.classList.add('dp-hide');
        this._animTimer = setTimeout(() => {
          this.puck.style.display = 'none';
          this.puck.classList.remove('dp-hide');
        }, 190);
        this.root.style.display = 'flex';
        this._setPosition({ left: Math.min(r.left, window.innerWidth - 120), top: r.top });
        this.root.classList.add('dp-hide');
        requestAnimationFrame(() => this.root.classList.remove('dp-hide'));
      }
      if (persist) Storage.setToolbarState({ collapsed });
    }

    // ---- positioning + drag ---------------------------------------------
    _cornerToPos(corner) {
      const m = 20;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = document.documentElement.clientHeight || window.innerHeight;
      const w = this.root.offsetWidth || 560;
      const h = this.root.offsetHeight || 52;
      let left;
      if (corner === 'tc' || corner === 'bc') left = Math.max(m, (vw - w) / 2);
      else if (corner === 'tl' || corner === 'bl') left = m;
      else left = vw - w - m;
      const bottomRow = corner === 'bl' || corner === 'br' || corner === 'bc';
      const top = bottomRow ? vh - h - m : m;
      return { left, top };
    }

    _setPosition(pos) {
      const el = this.root;
      if (!el) return;
      const w = el.offsetWidth || 560, h = el.offsetHeight || 52;
      el.style.left = clamp(pos.left ?? 20, 4, window.innerWidth - w - 4) + 'px';
      el.style.top = clamp(pos.top ?? 20, 4, window.innerHeight - h - 4) + 'px';
    }

    _wireDrag(handle, target, isPuck = false) {
      let startX = 0, startY = 0, baseLeft = 0, baseTop = 0, dragging = false, moved = false;
      const onDown = (e) => {
        if (e.button !== 0) return;
        dragging = true; moved = false;
        const r = target.getBoundingClientRect();
        baseLeft = r.left; baseTop = r.top;
        startX = e.clientX; startY = e.clientY;
        target.style.left = r.left + 'px';
        target.style.top = r.top + 'px';
        handle.setPointerCapture?.(e.pointerId);
        if (!isPuck) this._togglePopover(false);
        e.preventDefault();
      };
      const onMove = (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX, dy = e.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        const w = target.offsetWidth, h = target.offsetHeight;
        target.style.left = clamp(baseLeft + dx, 2, window.innerWidth - w - 2) + 'px';
        target.style.top = clamp(baseTop + dy, 2, window.innerHeight - h - 2) + 'px';
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        if (isPuck) this._puckDragged = moved;
        else if (moved) {
          Storage.setToolbarState({ position: { left: parseFloat(target.style.left), top: parseFloat(target.style.top) } });
        }
      };
      handle.addEventListener('pointerdown', onDown);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      this._dragCleanups.push(() => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      });
    }
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Relative luminance test for #rgb / #rrggbb, to pick readable foreground text.
  function isDarkColor(hex) {
    if (!hex) return true;
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6) return true;
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const lin = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return L < 0.5;
  }

  window.__DrawingPenToolbar = Toolbar;
})();
