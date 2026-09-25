# Draw on Web

**A Chrome extension for drawing and annotating on any web page — with annotations that stay anchored to the content and scroll with it.**

Most screen-annotation tools pin their marks to the *viewport*: scroll, and the ink slides off the thing you were pointing at. Draw on Web stores every stroke in **document coordinates**, so an arrow drawn next to a paragraph stays next to that paragraph — through scrolling, infinite-scroll loading, and single-page-app navigation.

Built with **vanilla JavaScript, HTML, and CSS**. No framework, no bundler, no dependencies, no build step — the folder you clone is the extension that runs.

---

## Highlights

- **Content-anchored annotations** — ink lives in the page's coordinate space and scrolls natively with it.
- **A full drawing toolkit** — pen, highlighter, line, arrow, rectangle/ellipse (outline + filled), text, auto-numbered step stamps, and a stroke-level eraser.
- **Select, move, resize, edit** — marquee or click to select, drag to move, handles to scale, and double-click text to re-edit it.
- **Multi-line text that wraps** to the window, honours your own line breaks, and offers five font families.
- **A polished, customisable toolbar** — draggable, collapsible to a puck, with configurable size, corner shape, colour, and which tools appear (and in what order).
- **Two export modes** — a viewport screenshot, or a full-page vector render that captures every stroke across the whole document.
- **Works on mouse, trackpad, and touch** — picks the right gestures and touch-target sizes for your device (asked once on first run, changeable anytime), with pinch-to-zoom and two-finger scroll respected. Shortcuts show **⌘/⌥/⇧** on macOS and **Ctrl/Alt/Shift** elsewhere.
- **Settings that sync** across your Chrome installs via `chrome.storage.sync`.

## Engineering highlights

These are the problems that made the project interesting to build:

- **Smooth scrolling with unbounded pages.** A two-layer canvas separates *committed* ink from the *in-progress* stroke, and the committed layer is **virtualized** to a band around the viewport. The browser scrolls it natively — **zero JavaScript runs on a normal scroll** — while memory stays bounded no matter how long the page is.
- **Responsive drawing on dense annotations.** Hit-testing (the eraser's per-move hot path) uses **cached, weak-keyed bounding boxes** to reject far-away strokes in a few comparisons instead of scanning every point of every stroke.
- **Coexisting with the host page's keyboard.** Typing text over a site like YouTube used to trigger the site's shortcuts (space = play/pause). Draw on Web shields key events at the **window capture phase** — the outermost point in the event path — so page handlers never fire, while the browser's native character insertion still works.
- **WYSIWYG multi-line text.** The inline editor and the committed canvas text share one font stack and wrap to the same width, so what you type is exactly what gets drawn — and each stroke stores its own font so a drawing keeps its look even if the setting later changes.
- **Crispness on HiDPI without blur.** Canvases render at device-pixel resolution with a capped backing store, so strokes stay sharp on retina displays without an ever-growing bitmap.
- **Serialisable, immutable strokes.** Every stroke is a plain JSON object; history is snapshot-based, and transforms operate on clones — which keeps undo/redo, persistence, and the bbox cache all correct for free.

---

## Install (load unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** and select this project folder (the one containing `manifest.json`).
4. Pin it (puzzle-piece icon → pin **Draw on Web**).

There is no build command — it loads directly as-is.

## Toggle draw mode

- Click the **Draw on Web** toolbar icon, **or**
- Press **Ctrl+Shift+D** (**Cmd+Shift+D** on Mac). Rebind at `chrome://extensions/shortcuts`.

A slim, glassy toolbar appears. Drag it by the left grip, or collapse it to a puck with the chevron — it remembers where you left it. A **thickness slider sits right on the bar** (the control you reach for most); colour and opacity live in a compact popover behind the colour dot. The first time you switch it on, a **quick guide** introduces the tools — reopen it anytime from the **?** button.

The bar is **responsive**: resize the Chrome window narrow and it automatically compacts (smaller buttons, then it tucks away the inline slider) so it stays a tidy single row instead of wrapping or running off-screen — and it restores your chosen size when the window grows again.

Works on `http(s)` pages, and on local `file://` pages once you enable *Allow access to file URLs* (`chrome://extensions` → Draw on Web → Details).

## Tools

| Tool | Key | Notes |
|------|-----|-------|
| Select | `S` | Marquee or click to select, drag to move, handles to resize; **double-click text to edit it**; **Delete**/**Backspace** removes the selection |
| Pen | `P` | Freehand, quadratic-smoothed strokes |
| Highlighter | `H` | Semi-transparent, multiply-blended like a real marker |
| Line | `L` | Hold **Shift** to snap to 45° |
| Rectangle | `R` | Hold **Shift** for a square |
| Ellipse | `O` | Hold **Shift** for a circle |
| Arrow | `A` | Line with an arrowhead |
| Text | `T` | Click to place, type inline; **wraps to the window**, **Shift+Enter** for a new line, **Enter** to commit; re-edit later by double-clicking it with Select; font is configurable in Settings |
| Number stamp | `N` | Drops auto-incrementing numbered markers (1, 2, 3…) — great for step-by-step callouts |
| Eraser | `E` | Click/drag to delete whole strokes; the cursor shows the exact erase area |
| Filled rectangle | `F` | Off by default — enable in Settings → Tools |
| Filled ellipse | `G` | Off by default — enable in Settings → Tools |
| Cursor mode | `C` | Stop drawing and use the site normally; annotations stay anchored |

Each tool remembers its own **thickness and opacity** (so the highlighter's translucency never carries over to the pen); colour is shared. **Undo** `Ctrl+Z`, **Redo** `Ctrl+Shift+Z` / `Ctrl+Y`, **Exit** `Esc`. Hold **Alt** and scroll the wheel to change brush size without leaving the canvas.

## Pen vs Cursor

- **Pen mode** — you draw on the page; scrolling still works and drawings scroll with the content.
- **Cursor mode** — the drawing layer ignores clicks so you can use the site normally; your annotations remain visible and anchored.

## Mouse, trackpad, and touch

Draw on Web works on Windows, macOS, ChromeOS, Linux, and touch devices — anywhere Chrome runs extensions. The **first time you switch it on it asks how you draw**, and you can change it anytime from the **input-device button on the toolbar** or **Settings → Behaviour → Input device**.

- **Mouse** — click and drag to draw; **wheel** scrolls the page (or an inner scroller under the pointer).
- **Trackpad** — press and glide to draw; **two-finger scroll** moves the page, and **pinch-to-zoom** passes straight through to the browser instead of being hijacked. Selection handles and text get a more forgiving grab radius.
- **Touchscreen** — **one finger draws**, **two fingers scroll/pan** the page (or the container under them), and touch targets are enlarged. The brush preview dot is hidden since your fingertip covers it.

Keyboard shortcuts and tooltips adapt to your platform too — they show **⌘ / ⌥ / ⇧** on macOS and **Ctrl / Alt / Shift** elsewhere.

## Settings

Open via the gear on the toolbar, or right-click the icon → **Options**.

- **Tools** — show/hide individual tools and **drag to reorder** them on the bar
- **Toolbar style** — size (Compact / Regular / Large), corner shape (Sharp / Rounded / Pill, which also reshapes the buttons), a custom toolbar colour with automatic text-contrast, a live preview, and a toggle for the on-bar thickness slider
- **Defaults** — starting tool, colour, thickness, opacity, toolbar position, and **text font** (Monospace by default; also Sans-serif, Serif, Rounded, Handwritten)
- **Behaviour** — **input device** (Auto-detect / Mouse / Trackpad / Touchscreen), pen smoothing (Off / Low / Medium / High), export mode, and **auto-restore drawings when revisiting a page** (off by default; saved per URL on this device)
- **Appearance** — theme (Auto / Light / Dark) and accent colour
- A **keyboard-shortcuts reference**, **Clear saved drawings**, and **Reset to defaults**

Settings sync via `chrome.storage.sync`, so they follow you across Chrome installs.

## Export

The **Export PNG** button has two modes (Settings → Behaviour → Export PNG):

- **Visible area** (default) — hides the toolbar and captures the current viewport (page + annotations) as a screenshot PNG.
- **Full page** — renders **every stroke across the whole document** (ink on white) to a single PNG at any page length, so nothing drawn off-screen is lost. This is an exact vector-to-raster render, not screenshot stitching, so it stays reliable on long, scrollable pages.

## How it works

**Two canvas layers** (the approach used by tools like Excalidraw):

- **Static layer** — a `position: absolute` canvas holding all committed strokes. Because it lives in the page's coordinate space, the browser scrolls it **natively** with the content — no JavaScript runs on scroll, which is what keeps scrolling smooth.
- **Live layer** — a `position: fixed`, viewport-sized canvas that only draws the single in-progress stroke, so drawing stays fast no matter how much is already on the page.

The static layer is **virtualized**: it only covers a band (~3 screens tall) around the viewport at full device resolution, repositioning and repainting occasionally as you approach an edge. That keeps strokes crisp on pages of any length while bounding memory — no giant canvas, no downscaling blur.

Strokes are stored in **document coordinates**, drawn with a low-latency (`desynchronized`) canvas and coalesced pointer events for a responsive pen. Freehand input runs through optional **exponential smoothing**; static-layer repaints are **coalesced to one per frame** so erasing and undo stay smooth. On SPA route changes the scene resets cleanly — flushing any pending autosave first, then reloading saved drawings if auto-restore is on.

## Project structure

```
.
├── manifest.json                         MV3 manifest
├── README.md
└── src/
    ├── background/service-worker.js       icon/keyboard toggle, screenshot capture, open options
    ├── content/
    │   ├── content.js                     controller: lifecycle, tools, keyboard, text, export, persistence
    │   ├── canvas-manager.js              two-layer (static + live) virtualized, scroll-anchored canvas
    │   ├── drawing-engine.js              strokes, all tools, cached-bbox hit-test, undo/redo, serialize
    │   ├── toolbar.js                     floating draggable/collapsible toolbar (inline Lucide icons)
    │   ├── storage.js                     chrome.storage wrapper (settings + per-URL drawings)
    │   └── content.css                    toolbar / canvas / cursor / themes
    ├── options/                           settings page (options.html / .css / .js)
    └── icons/                             extension icons
```

## Limitations & notes

- Works on `http(s)` and local `file://` pages (the latter needs *Allow access to file URLs*). Chrome system pages (`chrome://`, the Web Store) can't be injected into — a browser restriction.
- Top frame only (not inside iframes).
- **Visible area** export captures the current viewport; use **Full page** to export everything across the document.
- Installing or reloading the extension while a tab is already open: the first toggle injects the scripts (a page reload also works).

## Roadmap

Deliberately left as clean extension points, enabled by the serialisable-stroke model, tool registry, and storage wrapper: whiteboard mode, cloud sync and sharing links, stylus pressure, and multi-page PDF markup.
