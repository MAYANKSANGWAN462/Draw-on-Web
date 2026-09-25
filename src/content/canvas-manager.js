// Draw on Web — canvas manager (virtualized static + live layers)
// ---------------------------------------------------------------------------
// Smoothness AND crispness AND bounded memory:
//
//   * STATIC layer — a `position: absolute` canvas that covers a BAND of the
//     document around the current viewport (~3 screens tall), rendered at full
//     device resolution so committed strokes are always crisp. Because it lives
//     in the page's coordinate space, the browser scrolls it natively — no JS
//     on scroll while you stay within the band. When the viewport approaches the
//     band's edge, the band is repositioned and repainted (occasional, cheap).
//     This bounds memory no matter how long the page is (no giant canvas, no
//     downscaling, so no blur).
//
//   * LIVE layer — a `position: fixed`, viewport-sized canvas that only draws
//     the single in-progress stroke, so drawing stays smooth.
//
// Strokes are stored in DOCUMENT coordinates; both layers place them correctly.
// ---------------------------------------------------------------------------

(function () {
  'use strict';
  if (window.__DrawingPenCanvasManager) return;

  const BASE_Z = 2147483643;
  const MAX_WIDTH = 8192;              // css px cap for the static layer width
  const MAX_BAND_PX = 32000000;        // device-px budget for the static band (~128 MB)

  class CanvasManager {
    constructor({ renderCommitted, renderActive }) {
      this.renderCommitted = renderCommitted;
      this.renderActive = renderActive;

      this.base = null; this.baseCtx = null; this.baseDpr = 1;
      this.live = null; this.liveCtx = null;
      this.region = { top: 0, left: 0, width: 0, height: 0 };

      // Active scroll anchor. `null` = the page root (window) scrolls, which is
      // the common case (whole-document scroll, e.g. YouTube) — the static band
      // then scrolls natively with no JS on scroll. When the content that's being
      // annotated lives in an INNER scroll container (e.g. ChatGPT), that element
      // is the anchor instead: strokes are stored relative to its scroll offset
      // and the static layer switches to a viewport-fixed canvas repainted on
      // scroll, so annotations track the container's content on every site.
      this.scroller = null;
      this._baseFixed = false;

      this._docW = 0; this._docH = 0;
      this._scrollRaf = false;
      this._resizeRaf = false;

      this._onScroll = this._onScroll.bind(this);
      this._onResize = this._onResize.bind(this);
      this._checkSize = this._checkSize.bind(this);
    }

    mount() {
      if (this.base) return;

      const base = document.createElement('canvas');
      base.className = 'drawing-pen-canvas dp-base';
      Object.assign(base.style, {
        position: 'absolute', top: '0', left: '0',
        zIndex: String(BASE_Z), pointerEvents: 'none', touchAction: 'none'
      });
      this.base = base;
      this.baseCtx = base.getContext('2d', { desynchronized: true });
      document.documentElement.appendChild(base);

      const live = document.createElement('canvas');
      live.className = 'drawing-pen-canvas dp-live';
      // Size with % (not vw/vh) so the fixed layer excludes the scrollbar gutter
      // and never introduces a spurious horizontal scrollbar. resize() then sets
      // exact px from clientWidth/clientHeight.
      Object.assign(live.style, {
        position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
        zIndex: String(BASE_Z + 1), pointerEvents: 'none', touchAction: 'none'
      });
      this.live = live;
      this.liveCtx = live.getContext('2d', { desynchronized: true });
      document.documentElement.appendChild(live);

      this.resize();

      window.addEventListener('scroll', this._onScroll, { passive: true, capture: true });
      window.addEventListener('resize', this._onResize, { passive: true });
      this._ro = new ResizeObserver(this._onResize);
      try { this._ro.observe(document.documentElement); this._ro.observe(document.body); } catch (_e) {}
      this._sizeTimer = setInterval(this._checkSize, 800);
    }

    unmount() {
      if (!this.base) return;
      window.removeEventListener('scroll', this._onScroll, { capture: true });
      window.removeEventListener('resize', this._onResize);
      this._ro && this._ro.disconnect();
      clearInterval(this._sizeTimer);
      this.base.remove(); this.live.remove();
      this.base = this.live = this.baseCtx = this.liveCtx = null;
    }

    setInteractive(on) {
      if (!this.base) return;
      this.base.style.pointerEvents = on ? 'auto' : 'none';
      this.base.style.cursor = on ? 'crosshair' : 'default';
    }

    // Current scroll offset of the active anchor (inner container or window).
    // All stroke coordinates are stored relative to this, so annotations follow
    // whatever actually scrolls the content under them.
    getScroll() {
      const s = this.scroller;
      if (s && s.isConnected) return { x: s.scrollLeft, y: s.scrollTop };
      return { x: window.scrollX, y: window.scrollY };
    }

    // Set the active scroll anchor (an inner scrollable element, or null for the
    // page root). Switches the static layer between the natively-scrolling band
    // (root) and a viewport-fixed, repaint-on-scroll canvas (inner container).
    setScroller(el) {
      const norm = (el && el.nodeType === 1 &&
        el !== document.documentElement && el !== document.body &&
        el !== document.scrollingElement) ? el : null;
      if (this.scroller === norm) return;
      this.scroller = norm;
      this._baseFixed = !!norm;
      this.base.style.position = norm ? 'fixed' : 'absolute';
      // Both the fixed viewport canvas and the reset absolute band sit at the
      // origin; _applyRegion re-places the band on the next paint.
      this.base.style.left = '0';
      this.base.style.top = '0';
      this.resize();
    }

    toDocPoint(clientX, clientY) {
      const s = this.getScroll();
      return { x: clientX + s.x, y: clientY + s.y };
    }

    // Current full document size in CSS px (used for full-page export).
    documentSize() {
      this._measureDoc();
      return { w: this._docW, h: this._docH };
    }

    // ---- document sizing -------------------------------------------------
    _measureDoc() {
      const de = document.documentElement;
      const b = document.body;
      // Collapse our own layer so it can't inflate the scroll size.
      const pw = this.base.style.width, ph = this.base.style.height;
      this.base.style.width = '0px'; this.base.style.height = '0px';
      // clientWidth/clientHeight exclude the scrollbar gutter; using innerWidth/
      // innerHeight here would size the absolute base layer ~15px too wide on any
      // page with a vertical scrollbar and create a spurious horizontal scrollbar.
      this._docW = Math.max(de.scrollWidth, b ? b.scrollWidth : 0, de.clientWidth);
      this._docH = Math.max(de.scrollHeight, b ? b.scrollHeight : 0, de.clientHeight);
      this.base.style.width = pw; this.base.style.height = ph;
    }

    _computeRegion() {
      const vh = window.innerHeight;
      const margin = vh;                                   // 1 screen of buffer each side
      let width = Math.min(this._docW, MAX_WIDTH);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Cap band height so the backing store stays within the memory budget.
      const maxCssH = MAX_BAND_PX / (width * dpr * dpr);
      let height = Math.min(this._docH, vh + margin * 2, maxCssH);
      height = Math.max(height, vh);                       // always cover the viewport
      const top = clamp(window.scrollY - margin, 0, Math.max(0, this._docH - height));
      return { top, left: 0, width, height, dpr };
    }

    // Apply a region: (re)size the backing store at full DPR, move it, repaint.
    _applyRegion(region) {
      const base = this.base;
      const wPx = Math.max(1, Math.round(region.width * region.dpr));
      const hPx = Math.max(1, Math.round(region.height * region.dpr));
      if (base.width !== wPx) base.width = wPx;
      if (base.height !== hPx) base.height = hPx;
      base.style.width = region.width + 'px';
      base.style.height = region.height + 'px';
      base.style.left = region.left + 'px';
      base.style.top = region.top + 'px';
      this.region = region;
      this.baseDpr = region.dpr;
      this.paintBase();
    }

    resize() {
      if (!this.base) return;
      this._measureDoc();

      const dpr = window.devicePixelRatio || 1;
      const de = document.documentElement;
      const vw = de.clientWidth, vh = de.clientHeight;

      if (this._baseFixed) {
        // Inner-container anchor: the static layer is a viewport-sized fixed
        // canvas (the absolute band can't ride an inner scroller), repainted on
        // scroll via a transform. Full DPR keeps committed strokes crisp.
        this.base.width = Math.round(vw * dpr);
        this.base.height = Math.round(vh * dpr);
        this.base.style.width = vw + 'px';
        this.base.style.height = vh + 'px';
        this.baseDpr = dpr;
        this.paintBase();
      } else {
        this._applyRegion(this._computeRegion());
      }

      // Live layer tracks the viewport at full DPR (always crisp). Use the
      // client size (scrollbar excluded) so the fixed layer never overflows.
      this.live.width = Math.round(vw * dpr);
      this.live.height = Math.round(vh * dpr);
      this.live.style.width = vw + 'px';
      this.live.style.height = vh + 'px';
      this.paintLive();
    }

    _needsReposition() {
      const r = this.region;
      const vh = window.innerHeight;
      const sy = window.scrollY;
      const nearTop = r.top > 0 && sy < r.top + vh * 0.4;
      const nearBottom = (r.top + r.height) < this._docH && (sy + vh) > (r.top + r.height) - vh * 0.4;
      return nearTop || nearBottom;
    }

    _onScroll() {
      if (this._scrollRaf) return;
      this._scrollRaf = true;
      requestAnimationFrame(() => {
        this._scrollRaf = false;
        if (this._baseFixed) this.paintBase();            // inner container: strokes tracked via transform
        else if (this._needsReposition()) this._applyRegion(this._computeRegion());
        this.paintLive(); // keep an in-progress stroke aligned if scrolling mid-draw
      });
    }

    _onResize() {
      if (this._resizeRaf) return;
      this._resizeRaf = true;
      requestAnimationFrame(() => { this._resizeRaf = false; this.resize(); });
    }

    _checkSize() {
      const de = document.documentElement;
      const h = Math.max(de.scrollHeight, document.body ? document.body.scrollHeight : 0);
      const w = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
      if (Math.abs(h - this._docH) > 4 || Math.abs(w - this._docW) > 4) this._onResize();
    }

    // ---- painting --------------------------------------------------------
    paintBase() {
      const ctx = this.baseCtx;
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.base.width, this.base.height);
      if (this._baseFixed) {
        // Inner-container anchor: draw at the viewport, offset by the container's
        // current scroll (same mapping as the live layer).
        const dpr = this.baseDpr || (window.devicePixelRatio || 1);
        const s = this.getScroll();
        ctx.setTransform(dpr, 0, 0, dpr, -s.x * dpr, -s.y * dpr);
      } else {
        // Map document coords into the band's local space.
        const r = this.region, dpr = this.baseDpr;
        ctx.setTransform(dpr, 0, 0, dpr, -r.left * dpr, -r.top * dpr);
      }
      this.renderCommitted(ctx);
    }

    // Draw ONE freshly-committed stroke onto the existing static layer without
    // clearing it. Adding a stroke is otherwise an O(n) full repaint of every
    // committed stroke; on a heavily-annotated page that makes each new stroke
    // progressively jankier. Because a new stroke always lands on top (last in
    // paint order) and inside the current viewport (⊂ the band), we can just
    // paint it over what's already there — same transform as paintBase, no clear
    // — which keeps adding strokes O(1) no matter how many are already down. A
    // later full repaint (scroll reposition, erase, undo…) reconciles everything.
    appendBase(renderOne) {
      const ctx = this.baseCtx;
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (this._baseFixed) {
        const dpr = this.baseDpr || (window.devicePixelRatio || 1);
        const s = this.getScroll();
        ctx.setTransform(dpr, 0, 0, dpr, -s.x * dpr, -s.y * dpr);
      } else {
        const r = this.region, dpr = this.baseDpr;
        ctx.setTransform(dpr, 0, 0, dpr, -r.left * dpr, -r.top * dpr);
      }
      renderOne(ctx);
    }

    paintLive() {
      const ctx = this.liveCtx;
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const s = this.getScroll();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.live.width, this.live.height);
      ctx.setTransform(dpr, 0, 0, dpr, -s.x * dpr, -s.y * dpr);
      this.renderActive(ctx);
    }

    requestLivePaint() {
      if (this._liveRaf) return;
      this._liveRaf = true;
      requestAnimationFrame(() => { this._liveRaf = false; this.paintLive(); });
    }

    // Coalesce static-layer repaints to at most one per frame. Repainting the
    // whole band on every scene change (e.g. each stroke the eraser removes
    // during a drag) is wasteful; batching it keeps erasing/undo smooth.
    requestBasePaint() {
      if (this._baseRaf) return;
      this._baseRaf = true;
      requestAnimationFrame(() => { this._baseRaf = false; this.paintBase(); });
    }
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  window.__DrawingPenCanvasManager = CanvasManager;
})();
