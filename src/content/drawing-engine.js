// Draw on Web — drawing engine
// ---------------------------------------------------------------------------
// Owns the scene (an ordered list of strokes) and an undo/redo history.
// Every stroke is a plain, serialisable object with coordinates in DOCUMENT
// space, so persistence (JSON) and scroll-anchoring both work unchanged.
//
// Stroke shapes:
//   pen / highlighter : { type, color, width, opacity, points:[{x,y}...] }
//   line / arrow      : { type, color, width, opacity, start:{x,y}, end:{x,y} }
//   rect / ellipse    : { type, color, width, opacity, start:{x,y}, end:{x,y} }
//   text              : { type, color, opacity, x, y, size, text }
//
// History is snapshot-based (shallow copies of the strokes array). Committed
// strokes are never mutated in place, so a shallow copy is a valid snapshot,
// and add / erase / clear all undo uniformly. History is unlimited per session.
// ---------------------------------------------------------------------------

(function () {
  'use strict';
  if (window.__DrawingPenDrawingEngine) return;

  // Memory safety caps — NOT a page-length limit (scroll-anchoring is
  // unbounded). They only stop RAM growing without limit on endless sessions.
  const MAX_STROKES = 5000;
  const MAX_POINTS_PER_STROKE = 20000;

  const FREEHAND = new Set(['pen', 'highlighter']);
  const SHAPES = new Set(['line', 'rect', 'ellipse', 'arrow', 'rectFill', 'ellipseFill']);

  // Geometry bounding-box cache. Committed strokes are immutable (never mutated
  // in place — transforms operate on clones), so a stroke's raw bbox is computed
  // once and reused. Keyed weakly, so entries are freed automatically when the
  // stroke is dropped (undo/clear/erase). Clones (JSON round-trip) start fresh.
  // This turns hit-testing — the eraser's per-move hot path — into a cheap bbox
  // reject for all but the strokes actually near the pointer.
  // Shared text metrics. One font string, used both when measuring (for wrap +
  // bbox) and when painting, so layout and rendering can never drift apart.
  const TEXT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const TEXT_LINE_HEIGHT = 1.3;   // matches .dp-text-input line-height
  const fontFor = (size, family) => `${size}px ${family || TEXT_FONT}`;

  let _measureCtx = null;
  function measureCtx() {
    if (!_measureCtx) _measureCtx = document.createElement('canvas').getContext('2d');
    return _measureCtx;
  }

  // Break `text` into rendered lines: honour explicit newlines, then word-wrap
  // each paragraph to `maxWidth` (breaking any single word too long to fit). With
  // no maxWidth (legacy strokes) only explicit newlines split the text. `ctx`
  // must already have its font set. Kept in the engine so canvas painting, bbox,
  // and hit-testing all agree on exactly where the text sits.
  function wrapText(ctx, text, maxWidth) {
    const paras = String(text).split('\n');
    if (!maxWidth || maxWidth <= 0) return paras;
    const out = [];
    for (const para of paras) {
      if (para === '') { out.push(''); continue; }
      let line = '';
      for (const word of para.split(' ')) {
        const withWord = line ? line + ' ' + word : word;
        if (ctx.measureText(withWord).width <= maxWidth) { line = withWord; continue; }
        if (line) { out.push(line); line = ''; }
        if (ctx.measureText(word).width <= maxWidth) { line = word; continue; }
        // Single word wider than the wrap width — break it character by character.
        let chunk = '';
        for (const ch of word) {
          if (chunk && ctx.measureText(chunk + ch).width > maxWidth) { out.push(chunk); chunk = ch; }
          else chunk += ch;
        }
        line = chunk;
      }
      out.push(line);
    }
    return out;
  }

  const _bboxCache = new WeakMap();
  function rawBBox(s) {
    let bb = _bboxCache.get(s);
    if (bb) return bb;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const acc = (x, y) => {
      if (x < minX) minX = x; if (y < minY) minY = y;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    };
    if (s.points) for (const p of s.points) acc(p.x, p.y);
    if (s.start) acc(s.start.x, s.start.y);
    if (s.end) acc(s.end.x, s.end.y);
    if (s.type === 'text') {
      const mctx = measureCtx();
      mctx.font = fontFor(s.size, s.fontFamily);
      const lines = wrapText(mctx, s.text, s.maxWidth);
      let w = 0;
      for (const ln of lines) { const lw = mctx.measureText(ln).width; if (lw > w) w = lw; }
      const lineH = s.size * TEXT_LINE_HEIGHT;
      acc(s.x, s.y - s.size);                                        // top of first line
      acc(s.x + w, s.y + (Math.max(1, lines.length) - 1) * lineH + s.size * 0.25); // bottom of last
    }
    if (s.type === 'counter') {
      const r = s.size / 2;
      acc(s.x - r, s.y - r); acc(s.x + r, s.y + r);
    }
    bb = { minX, minY, maxX, maxY };
    _bboxCache.set(s, bb);
    return bb;
  }

  class DrawingEngine {
    constructor() {
      this.strokes = [];
      this.undoStack = [];
      this.redoStack = [];
      this.active = null;          // in-progress freehand/shape stroke
      this._eraseSnapshot = null;  // snapshot taken at the start of an erase drag
      this._erasedAny = false;
      this._restyleSnap = null;    // snapshot open while a selection is being restyled
      this._counter = 0;           // running number for the step-marker stamp
      this._smx = 0; this._smy = 0; // smoothing anchor for the active freehand
      // Classifies the last scene change so the canvas can repaint cheaply:
      // 'add' = one new stroke appended on top (paint just that stroke);
      // 'reset' = anything else (undo/redo/erase/clear/move) -> full repaint.
      this._changeKind = null;

      // Current tool settings (driven by the toolbar).
      this.tool = 'pen';
      this.color = '#ef4444';
      this.width = 4;
      this.opacity = 1;
      this.smoothing = 0.5;        // 0 = raw input, →1 = heavier smoothing/lag
      this.eraseRadius = 8;        // px radius of the eraser hit area

      // Notified whenever the scene changes (for autosave / toolbar refresh).
      this.onChange = null;
    }

    isFreehand(tool = this.tool) { return FREEHAND.has(tool); }
    isShape(tool = this.tool) { return SHAPES.has(tool); }

    // Every scene change flows through _emit; `kind` defaults to 'reset' (full
    // repaint) so any mutator is safe by default, and only the add path opts into
    // the cheap incremental append.
    _emit(kind = 'reset') { this._changeKind = kind; if (this.onChange) this.onChange(); }

    _snapshot() { return this.strokes.slice(); }
    // Only the add-a-stroke methods (endStroke / addText / addCounter) call
    // _commit, so this is exactly the incremental-append case — unless the cap
    // trims an old stroke off the front, which shifts indices and needs a full
    // repaint to drop the evicted ink.
    _commit(snapshot) {
      this.flushRestyle();       // close any open restyle step first, so undo order stays correct
      this.undoStack.push(snapshot);
      this.redoStack.length = 0;
      let trimmed = false;
      if (this.strokes.length > MAX_STROKES) { this.strokes.shift(); trimmed = true; }
      this._emit(trimmed ? 'reset' : 'add');
    }

    // ---- freehand (pen, highlighter) -------------------------------------
    beginStroke(p) {
      this.active = {
        type: this.tool,
        color: this.color,
        width: this.width,
        opacity: this.opacity,
        points: [{ x: p.x, y: p.y }]
      };
      this._smx = p.x; this._smy = p.y; // seed the smoothing filter at the start
    }
    extendStroke(p) {
      if (!this.active || !this.active.points) return;
      const pts = this.active.points;
      if (pts.length >= MAX_POINTS_PER_STROKE) return;
      let x = p.x, y = p.y;
      // Velocity-adaptive smoothing (a lightweight "one-euro" filter). A constant
      // exponential filter trades jitter for lag uniformly: crank it up and slow,
      // careful strokes get clean, but fast strokes visibly trail the pen — the
      // "laggy/stuck" feel. Instead we scale the smoothing by pointer speed:
      // strong jitter rejection when the hand moves slowly, and near-raw tracking
      // (ink stays under the pen) when it moves fast.
      const strength = Math.max(0, Math.min(0.9, this.smoothing || 0));
      if (strength > 0) {
        const dx = x - this._smx, dy = y - this._smy;
        const speed = Math.hypot(dx, dy);
        // maxF = heaviest blend at rest; it relaxes toward 0 as speed rises, so
        // the filtered point catches up to the pointer during quick movements.
        const maxF = 0.35 + strength * 0.55;
        const f = maxF / (1 + speed / 7);
        this._smx = x - dx * f;
        this._smy = y - dy * f;
        x = this._smx; y = this._smy;
      } else {
        this._smx = x; this._smy = y;
      }
      const last = pts[pts.length - 1];
      if (last && Math.abs(last.x - x) < 0.5 && Math.abs(last.y - y) < 0.5) return;
      pts.push({ x, y });
    }

    // ---- shapes (line, rect, ellipse, arrow) -----------------------------
    beginShape(p) {
      this.active = {
        type: this.tool,
        color: this.color,
        width: this.width,
        opacity: this.opacity,
        start: { x: p.x, y: p.y },
        end: { x: p.x, y: p.y }
      };
    }
    updateShape(p, constrain = false) {
      if (!this.active || !this.active.start) return;
      let { x, y } = p;
      if (constrain) {
        // Shift = square/circle for rect/ellipse (incl. filled), 45° for line/arrow.
        const dx = x - this.active.start.x;
        const dy = y - this.active.start.y;
        const t = this.active.type;
        if (t === 'rect' || t === 'ellipse' || t === 'rectFill' || t === 'ellipseFill') {
          const s = Math.max(Math.abs(dx), Math.abs(dy));
          x = this.active.start.x + Math.sign(dx || 1) * s;
          y = this.active.start.y + Math.sign(dy || 1) * s;
        } else {
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(dx, dy);
          x = this.active.start.x + Math.cos(ang) * len;
          y = this.active.start.y + Math.sin(ang) * len;
        }
      }
      this.active.end = { x, y };
    }

    // Commit whatever is in `active` (freehand or shape).
    endStroke() {
      if (!this.active) return;
      const a = this.active;
      this.active = null;
      if (a.points) {
        if (a.points.length < 1) return;
      } else if (a.start && a.end) {
        // Drop a zero-size shape produced by a click without a drag — it would
        // be an invisible artifact that still clutters undo history.
        if (Math.abs(a.end.x - a.start.x) < 2 && Math.abs(a.end.y - a.start.y) < 2) return;
      }
      const snap = this._snapshot();
      this.strokes.push(a);
      this._commit(snap);
    }

    cancelActive() { this.active = null; }

    // ---- text ------------------------------------------------------------
    addText(p, text, maxWidth, fontFamily) {
      const t = (text || '').replace(/^\n+|\n+$/g, '').replace(/[ \t]+$/gm, '');
      if (!t.trim()) return;
      const snap = this._snapshot();
      this.strokes.push({
        type: 'text',
        color: this.color,
        opacity: this.opacity,
        x: p.x,
        y: p.y,
        size: Math.max(12, this.width * 4 + 8),
        // Width the text wraps to (document px). Absent for legacy strokes, in
        // which case rendering falls back to honouring only explicit newlines.
        maxWidth: maxWidth && maxWidth > 0 ? maxWidth : undefined,
        // Resolved CSS font stack, stamped in so the stroke keeps its font even
        // if the setting later changes. Absent -> default sans (see TEXT_FONT).
        fontFamily: fontFamily || undefined,
        text: t
      });
      this._commit(snap);
    }

    // ---- number stamp (auto-incrementing step marker) --------------------
    addCounter(p) {
      const snap = this._snapshot();
      this.strokes.push({
        type: 'counter',
        color: this.color,
        opacity: this.opacity,
        x: p.x,
        y: p.y,
        size: Math.max(22, this.width * 3 + 14),
        n: ++this._counter
      });
      this._commit(snap);
    }
    resetCounter() { this._counter = 0; }

    // ---- eraser (stroke-level) -------------------------------------------
    eraseBegin() { this.flushRestyle(); this._eraseSnapshot = this._snapshot(); this._erasedAny = false; }
    eraseAt(p) {
      const idx = this._hitTest(p, this.eraseRadius || 0);
      if (idx === -1) return false;
      this.strokes.splice(idx, 1);
      this._erasedAny = true;
      this._emit();
      return true;
    }
    eraseEnd() {
      if (this._erasedAny && this._eraseSnapshot) {
        this.undoStack.push(this._eraseSnapshot);
        this.redoStack.length = 0;
      }
      this._eraseSnapshot = null;
      this._erasedAny = false;
    }

    // Return the index of the topmost stroke hit by point p, or -1.
    // `extra` widens the hit tolerance (used by the eraser for a bigger radius).
    _hitTest(p, extra = 0) {
      for (let i = this.strokes.length - 1; i >= 0; i--) {
        if (this._strokeHit(this.strokes[i], p, extra)) return i;
      }
      return -1;
    }
    _strokeHit(s, p, extra = 0) {
      const pad = Math.max(8, (s.width || 4) / 2 + 6) + extra;
      // Cheap bbox reject first: skip the per-segment / geometric test entirely
      // for strokes nowhere near the pointer. `pad` is a conservative margin
      // (>= every geometry-specific fudge below), so a real hit is never dropped.
      const bb = rawBBox(s);
      if (p.x < bb.minX - pad || p.x > bb.maxX + pad ||
          p.y < bb.minY - pad || p.y > bb.maxY + pad) return false;
      if (s.type === 'counter') {
        return Math.hypot(p.x - s.x, p.y - s.y) <= s.size / 2 + extra;
      }
      if (s.type === 'text') {
        // Accurate multi-line bounds (cached); anywhere on the text block hits.
        return p.x >= bb.minX - 4 - extra && p.x <= bb.maxX + 4 + extra &&
               p.y >= bb.minY - extra && p.y <= bb.maxY + extra;
      }
      if (s.points) {
        for (let i = 0; i < s.points.length - 1; i++) {
          if (distToSegment(p, s.points[i], s.points[i + 1]) <= pad) return true;
        }
        if (s.points.length === 1) return Math.hypot(p.x - s.points[0].x, p.y - s.points[0].y) <= pad;
        return false;
      }
      if (s.type === 'line' || s.type === 'arrow') {
        return distToSegment(p, s.start, s.end) <= pad;
      }
      if (s.type === 'rect' || s.type === 'rectFill') {
        const x1 = Math.min(s.start.x, s.end.x), x2 = Math.max(s.start.x, s.end.x);
        const y1 = Math.min(s.start.y, s.end.y), y2 = Math.max(s.start.y, s.end.y);
        if (s.type === 'rectFill') {
          return p.x >= x1 - pad && p.x <= x2 + pad && p.y >= y1 - pad && p.y <= y2 + pad;
        }
        const onX = (p.x >= x1 - pad && p.x <= x2 + pad);
        const onY = (p.y >= y1 - pad && p.y <= y2 + pad);
        const nearLeft = Math.abs(p.x - x1) <= pad, nearRight = Math.abs(p.x - x2) <= pad;
        const nearTop = Math.abs(p.y - y1) <= pad, nearBottom = Math.abs(p.y - y2) <= pad;
        return (onY && (nearLeft || nearRight)) || (onX && (nearTop || nearBottom));
      }
      if (s.type === 'ellipse' || s.type === 'ellipseFill') {
        const cx = (s.start.x + s.end.x) / 2, cy = (s.start.y + s.end.y) / 2;
        const rx = Math.abs(s.end.x - s.start.x) / 2, ry = Math.abs(s.end.y - s.start.y) / 2;
        if (rx < 1 || ry < 1) return false;
        const v = ((p.x - cx) ** 2) / (rx * rx) + ((p.y - cy) ** 2) / (ry * ry);
        if (s.type === 'ellipseFill') return v <= 1.05; // anywhere inside
        return Math.abs(v - 1) <= 0.35; // near the outline
      }
      return false;
    }

    // ---- history ---------------------------------------------------------
    undo() {
      this.flushRestyle();
      if (!this.undoStack.length) return false;
      this.redoStack.push(this.strokes.slice());
      this.strokes = this.undoStack.pop();
      this._emit();
      return true;
    }
    redo() {
      this.flushRestyle();
      if (!this.redoStack.length) return false;
      this.undoStack.push(this.strokes.slice());
      this.strokes = this.redoStack.pop();
      this._emit();
      return true;
    }
    clear() {
      this.flushRestyle();
      if (this.isEmpty()) return false;
      const snap = this._snapshot();
      this.strokes = [];
      this.active = null;
      this._counter = 0;
      this.undoStack.push(snap);
      this.redoStack.length = 0;
      this._emit();
      return true;
    }
    isEmpty() { return this.strokes.length === 0 && !this.active; }
    canUndo() { return this.undoStack.length > 0; }
    canRedo() { return this.redoStack.length > 0; }

    // ---- persistence -----------------------------------------------------
    toJSON() { return this.strokes; }
    loadJSON(strokes) {
      this._restyleSnap = null;   // any open restyle step is moot — the scene is being replaced
      this.strokes = Array.isArray(strokes) ? strokes.slice() : [];
      this.undoStack = [];
      this.redoStack = [];
      this.active = null;
      // Resume the step counter past any restored markers.
      this._counter = 0;
      for (const s of this.strokes) {
        if (s && s.type === 'counter' && s.n > this._counter) this._counter = s.n;
      }
      this._emit();
    }

    // ---- selection queries + transforms ----------------------------------
    // `extra` widens the grab radius (px) — coarse pointers (trackpad / touch)
    // pass a larger value so thin strokes stay easy to select.
    hitTest(p, extra = 0) { return this._hitTest(p, extra); }

    // Topmost TEXT stroke hit by p, or -1 (used for double-click-to-edit and the
    // Text tool's grab). `extra` widens the hit for coarse pointers.
    hitTestText(p, extra = 0) {
      for (let i = this.strokes.length - 1; i >= 0; i--) {
        const s = this.strokes[i];
        if (s.type === 'text' && this._strokeHit(s, p, extra)) return i;
      }
      return -1;
    }

    strokeBBox(s) {
      const b = rawBBox(s);
      const pad = (s.width || 2) / 2;
      return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
    }

    // Bounding box of a set of stroke indices, as {x,y,w,h} (or null).
    bboxOfIndices(indices) {
      if (!indices || !indices.length) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const i of indices) {
        const s = this.strokes[i];
        if (!s) continue;
        const b = this.strokeBBox(s);
        if (b.minX < minX) minX = b.minX; if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX; if (b.maxY > maxY) maxY = b.maxY;
      }
      if (minX === Infinity) return null;
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    // Indices of strokes whose bbox intersects rect {x,y,w,h}.
    strokesInRect(rect) {
      const rx2 = rect.x + rect.w, ry2 = rect.y + rect.h;
      const out = [];
      for (let i = 0; i < this.strokes.length; i++) {
        const b = this.strokeBBox(this.strokes[i]);
        if (b.maxX < rect.x || b.minX > rx2 || b.maxY < rect.y || b.minY > ry2) continue;
        out.push(i);
      }
      return out;
    }

    cloneStroke(s) { return JSON.parse(JSON.stringify(s)); }

    _eachPoint(s, fn) {
      if (s.points) for (const p of s.points) { const r = fn(p.x, p.y); p.x = r[0]; p.y = r[1]; }
      if (s.start) { const r = fn(s.start.x, s.start.y); s.start.x = r[0]; s.start.y = r[1]; }
      if (s.end) { const r = fn(s.end.x, s.end.y); s.end.x = r[0]; s.end.y = r[1]; }
      if (s.type === 'text' || s.type === 'counter') { const r = fn(s.x, s.y); s.x = r[0]; s.y = r[1]; }
    }
    translateStroke(s, dx, dy) { this._eachPoint(s, (x, y) => [x + dx, y + dy]); return s; }
    scaleStroke(s, ax, ay, sx, sy) {
      this._eachPoint(s, (x, y) => [ax + (x - ax) * sx, ay + (y - ay) * sy]);
      const f = (Math.abs(sx) + Math.abs(sy)) / 2;
      if (s.width) s.width = Math.max(1, s.width * f);
      if (s.size) s.size = Math.max(6, s.size * f);
      // Scale the text wrap width with the font so wrapping stays proportional
      // (line breaks are preserved and the block scales uniformly).
      if (s.maxWidth) s.maxWidth = Math.max(8, s.maxWidth * f);
      return s;
    }

    // Restyle the given strokes in place (colour / thickness / opacity), cloning
    // each so committed strokes are never mutated (keeps history snapshots valid).
    // A burst of restyles — e.g. dragging the thickness slider over a selection —
    // is coalesced into ONE undoable step: the pre-restyle snapshot is taken on
    // the first call and only pushed to the undo stack by flushRestyle(), which
    // any other mutator (and the controller's debounce) calls to close the step.
    restyleSelection(indices, mutate) {
      if (!indices || !indices.length) return;
      if (!this._restyleSnap) this._restyleSnap = this._snapshot();
      for (const idx of indices) {
        const s = this.strokes[idx];
        if (!s) continue;
        const next = this.cloneStroke(s);
        mutate(next);
        this.strokes[idx] = next;
      }
      this._emit();
    }
    flushRestyle() {
      if (!this._restyleSnap) return;
      this.undoStack.push(this._restyleSnap);
      this.redoStack.length = 0;
      this._restyleSnap = null;
    }

    // Replace strokes at the given indices (one undoable action).
    replaceStrokes(indices, newStrokes) {
      this.flushRestyle();
      const snap = this._snapshot();
      indices.forEach((idx, i) => { if (this.strokes[idx]) this.strokes[idx] = newStrokes[i]; });
      this.undoStack.push(snap);
      this.redoStack.length = 0;
      this._emit();
    }

    // Delete strokes at the given indices (one undoable action).
    deleteStrokes(indices) {
      if (!indices || !indices.length) return;
      this.flushRestyle();
      const snap = this._snapshot();
      const set = new Set(indices);
      this.strokes = this.strokes.filter((_, i) => !set.has(i));
      this.undoStack.push(snap);
      this.redoStack.length = 0;
      this._emit();
    }

    // ---- rendering -------------------------------------------------------
    // Split so the canvas manager can paint committed strokes on the static
    // layer and the in-progress stroke on the cheap live layer. `hide` is an
    // optional Set of indices to skip (used while dragging a selection).
    renderCommitted(ctx, hide) {
      for (let i = 0; i < this.strokes.length; i++) {
        if (hide && hide.has(i)) continue;
        this._paint(ctx, this.strokes[i]);
      }
    }
    renderStrokes(ctx, arr) {
      for (const s of arr) this._paint(ctx, s);
    }
    renderActive(ctx) {
      if (this.active) this._paint(ctx, this.active);
    }
    // Full render (used for one-shot compositing such as export).
    render(ctx) {
      this.renderCommitted(ctx);
      this.renderActive(ctx);
    }

    _paint(ctx, s) {
      ctx.save();
      ctx.globalAlpha = s.opacity ?? 1;
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width || 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Highlighter blends like a real marker.
      if (s.type === 'highlighter') ctx.globalCompositeOperation = 'multiply';

      switch (s.type) {
        case 'pen':
        case 'highlighter': this._paintFreehand(ctx, s); break;
        case 'line': this._paintLine(ctx, s.start, s.end); break;
        case 'arrow': this._paintArrow(ctx, s); break;
        case 'rect': this._paintRect(ctx, s, false); break;
        case 'rectFill': this._paintRect(ctx, s, true); break;
        case 'ellipse': this._paintEllipse(ctx, s, false); break;
        case 'ellipseFill': this._paintEllipse(ctx, s, true); break;
        case 'text': this._paintText(ctx, s); break;
        case 'counter': this._paintCounter(ctx, s); break;
      }
      ctx.restore();
    }

    _paintFreehand(ctx, s) {
      const pts = s.points;
      if (!pts.length) return;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, (s.width || 4) / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      // Quadratic smoothing through midpoints.
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }

    _paintLine(ctx, a, b) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    _paintArrow(ctx, s) {
      const { start: a, end: b } = s;
      this._paintLine(ctx, a, b);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const head = Math.max(10, (s.width || 4) * 3);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 6), b.y - head * Math.sin(ang - Math.PI / 6));
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 6), b.y - head * Math.sin(ang + Math.PI / 6));
      ctx.stroke();
    }

    _paintRect(ctx, s, fill) {
      const x = Math.min(s.start.x, s.end.x), y = Math.min(s.start.y, s.end.y);
      const w = Math.abs(s.end.x - s.start.x), h = Math.abs(s.end.y - s.start.y);
      if (fill) ctx.fillRect(x, y, w, h);
      else ctx.strokeRect(x, y, w, h);
    }

    _paintEllipse(ctx, s, fill) {
      const cx = (s.start.x + s.end.x) / 2, cy = (s.start.y + s.end.y) / 2;
      const rx = Math.abs(s.end.x - s.start.x) / 2, ry = Math.abs(s.end.y - s.start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (fill) ctx.fill();
      else ctx.stroke();
    }

    _paintText(ctx, s) {
      ctx.font = fontFor(s.size, s.fontFamily);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const lines = wrapText(ctx, s.text, s.maxWidth);
      const lineH = s.size * TEXT_LINE_HEIGHT;
      let y = s.y;
      for (const line of lines) { ctx.fillText(line, s.x, y); y += lineH; }
    }

    _paintCounter(ctx, s) {
      const r = s.size / 2;
      // Filled disc in the stroke colour with a thin white ring for contrast.
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.stroke();
      // Number, centred.
      const label = String(s.n);
      const fit = label.length > 2 ? 0.85 : 1;
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(r * 1.05 * fit)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, s.x, s.y + r * 0.06);
    }
  }

  // Distance from point p to segment ab.
  function distToSegment(p, a, b) {
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = p.x - a.x, wy = p.y - a.y;
    const len2 = vx * vx + vy * vy;
    let t = len2 ? (wx * vx + wy * vy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = a.x + t * vx - p.x, dy = a.y + t * vy - p.y;
    return Math.hypot(dx, dy);
  }

  window.__DrawingPenDrawingEngine = DrawingEngine;
})();
