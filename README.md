<div align="center">

# 🖊️ Draw on Web

### Draw, highlight, and annotate on **any** web page — and your ink **scrolls with the content**, not the screen.

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4?logo=googlechrome&logoColor=white)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JS-f7df1e?logo=javascript&logoColor=black)
![No build step](https://img.shields.io/badge/build-none-2ea44f)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-2ea44f)
![Works on](https://img.shields.io/badge/works%20on-mouse%20·%20trackpad%20·%20touch-8b5cf6)

[![Add to Chrome](https://img.shields.io/badge/Chrome%20Web%20Store-Add%20to%20Chrome-FF6B35?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/ahodmhekhpcglhflceahakgojleklenc)

**[⬇️ Add to Chrome](https://chromewebstore.google.com/detail/ahodmhekhpcglhflceahakgojleklenc) · [What's different](#-what-makes-it-different) · [Features](#-features) · [Get started](#-get-started) · [Tools](#-tools) · [Shortcuts](#-shortcuts--gestures) · [Settings](#-settings) · [Under the hood](#-under-the-hood) · [Links](#-links--contact)**

</div>

---

Most screen-annotation tools pin their marks to the *viewport*: scroll, and the ink slides off the thing you were pointing at. **Draw on Web stores every stroke in document coordinates**, so an arrow drawn next to a paragraph stays next to that paragraph — through scrolling, infinite-scroll loading, and single-page-app navigation.

> Built with **vanilla JavaScript, HTML, and CSS**. No framework, no bundler, no dependencies, no build step — the folder you clone is the extension that runs.

---

## ✨ What makes it different

Most pen extensions draw on a frozen layer over the screen. Draw on Web does three things they don't:

| | | |
|:--|:--|:--|
| 📌 **Ink that scrolls with the content** | 🎯 **It knows how you draw** | 🎨 **It's yours to shape** |
| Marks are pinned to the page — even to *inner* scroll areas like ChatGPT threads or docs panels — so they stay put through scrolling, infinite scroll, and SPA navigation. | Detects mouse, trackpad, or touch and tunes gestures + touch targets to match (two-finger scroll, pinch-zoom, stylus palm-rejection). Asks once on first run. | A fully customisable, responsive toolbar — size, shape, colour, position, tool order — plus themes, a custom palette, smoothing, and PNG export, all synced. |

> [!TIP]
> **New here?** The first time you switch it on, a quick **device picker** and a short **welcome tour** walk you through everything — reopen the tour anytime from the **?** button on the toolbar.

---

## 🎨 Features

| Area | What you get |
|------|--------------|
| ✏️ **Full toolkit** | Pen, highlighter, line, arrow, rectangle/ellipse (outline + filled), text, auto-numbered step stamps, and a stroke-level eraser |
| 🔀 **Edit anything** | Marquee or click to select, drag to move, handles to resize, double-click text to re-edit — nothing is locked once it's down |
| 📝 **Smart text** | Multi-line text that wraps to the window, honours your own line breaks, and offers five font families |
| 📌 **Content-anchored** | Ink lives in the page's coordinate space and scrolls natively with it — even inside inner scroll containers |
| 🖱️ **Any input device** | Mouse, trackpad, and touch — the right gestures and touch-target sizes are picked for your device |
| 🧰 **Custom toolbar** | Draggable, collapsible to a puck, responsive, with configurable size, shape, colour, and which tools appear (and in what order) |
| 🖼️ **Two export modes** | A viewport screenshot, or a full-page vector render capturing every stroke across the whole document |
| ☁️ **Settings that sync** | Your preferences follow you across Chrome installs via `chrome.storage.sync` |

---

## 🚀 Get started

**1. Install**

- **From the Chrome Web Store (recommended):** [**Add to Chrome →**](https://chromewebstore.google.com/detail/ahodmhekhpcglhflceahakgojleklenc), then pin it from the puzzle-piece menu.
- **Load unpacked (for development):**

  ```text
  1. Open  chrome://extensions
  2. Turn on  Developer mode  (top-right)
  3. Click  Load unpacked  →  select this folder (the one with manifest.json)
  4. Pin it  (puzzle-piece icon → pin “Draw on Web”)
  ```

> There's no build command — it loads directly as-is.

**2. Toggle draw mode**

- Click the **Draw on Web** toolbar icon, **or**
- Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> ( <kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>D</kbd> on Mac ). Rebind at `chrome://extensions/shortcuts`.

A slim, glassy toolbar appears. Drag it by the left grip, or collapse it to a puck with the chevron — it remembers where you left it. A **thickness slider sits right on the bar**; colour and opacity live in a compact popover behind the colour dot.

> [!NOTE]
> The bar is **responsive** — shrink the Chrome window and it auto-compacts (smaller buttons, then it tucks away the inline slider) so it stays a tidy single row, then restores your chosen size when the window grows again.

Works on `http(s)` pages, and on local `file://` pages once you enable *Allow access to file URLs* (`chrome://extensions` → Draw on Web → Details).

---

## 🧰 Tools

| Tool | Key | Notes |
|------|:---:|-------|
| **Select** | `S` | Marquee or click to select, drag to move, handles to resize; **double-click text to edit**; **Delete**/**Backspace** removes the selection |
| **Pen** | `P` | Freehand, quadratic-smoothed strokes |
| **Highlighter** | `H` | Semi-transparent, multiply-blended like a real marker |
| **Line** | `L` | Hold **Shift** to snap to 45° |
| **Rectangle** | `R` | Hold **Shift** for a square |
| **Ellipse** | `O` | Hold **Shift** for a circle |
| **Arrow** | `A` | Line with an arrowhead |
| **Text** | `T` | Click to place, type inline; **wraps to the window**, **Shift+Enter** for a new line, **Enter** to commit; re-edit by double-clicking with Select; font set in Settings |
| **Number stamp** | `N` | Drops auto-incrementing markers (1, 2, 3…) — great for step-by-step callouts |
| **Eraser** | `E` | Click/drag to delete whole strokes; the cursor shows the exact erase area |
| **Filled rectangle** | `F` | Off by default — enable in Settings → Tools |
| **Filled ellipse** | `G` | Off by default — enable in Settings → Tools |
| **Cursor mode** | `C` | Stop drawing and use the site normally; annotations stay anchored |

> Each tool remembers its own **thickness and opacity** (so the highlighter's translucency never leaks onto the pen); colour is shared across tools.

**Pen vs Cursor** — in **Pen mode** you draw and the page still scrolls with your marks; in **Cursor mode** the drawing layer ignores clicks so you can use the site normally while your annotations stay visible and anchored.

---

## ⌨ Shortcuts & gestures

**Keyboard** — labels adapt to your platform (⌘ / ⌥ / ⇧ on macOS, Ctrl / Alt / Shift elsewhere):

| Action | Shortcut |
|--------|----------|
| Toggle draw mode | <kbd>Ctrl/⌘</kbd> + <kbd>Shift</kbd> + <kbd>D</kbd> |
| Pick a tool | `P` `H` `L` `R` `O` `A` `T` `N` `E` `S` (see table above) |
| Cursor mode (use the site) | <kbd>C</kbd> |
| Undo / Redo | <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> / <kbd>Ctrl/⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (or <kbd>Ctrl</kbd>+<kbd>Y</kbd>) |
| Delete selection | <kbd>Delete</kbd> / <kbd>Backspace</kbd> |
| Square / circle / 45° | hold <kbd>Shift</kbd> while drawing |
| Change brush size | hold <kbd>Alt/⌥</kbd> and scroll the wheel |
| Cancel · deselect · exit | <kbd>Esc</kbd> |

**Gestures** — Draw on Web runs anywhere Chrome supports extensions (Windows, macOS, ChromeOS, Linux, and touch devices) and adapts to how you point. Change it anytime via the toolbar's input button or **Settings → Behaviour → Input device**:

| Device | Draw | Scroll | Zoom |
|--------|------|--------|------|
| 🖱️ **Mouse** | click + drag | mouse wheel | — |
| 💻 **Trackpad** | press + glide | two-finger swipe | pinch-to-zoom (passed through) |
| 👆 **Touchscreen** | one finger | two fingers | — |

> On trackpad and touch, selection handles and thin strokes get a more forgiving grab radius, and a resting hand is rejected while a stylus draws.

---

## ⚙ Settings

Open via the **gear** on the toolbar, or right-click the icon → **Options**.

| Section | What you can change |
|---------|---------------------|
| **Tools** | Show/hide individual tools and **drag to reorder** them on the bar |
| **Toolbar style** | Size (Compact / Regular / Large), corner shape (Sharp / Rounded / Pill), custom colour with automatic text-contrast, a live preview, and the on-bar thickness-slider toggle |
| **Defaults** | Starting tool, colour, thickness, opacity, toolbar position, and **text font** — Monospace by default (also Sans-serif, Serif, Rounded, Handwritten) |
| **Behaviour** | **Input device** (Auto / Mouse / Trackpad / Touchscreen), pen smoothing (Off / Low / Medium / High), export mode, and **auto-restore drawings** per URL (off by default) |
| **Appearance** | Theme (Auto / Light / Dark) and accent colour |
| **Also** | A keyboard-shortcuts reference, **Clear saved drawings**, and **Reset to defaults** |

> Settings sync via `chrome.storage.sync`, so they follow you across Chrome installs.

---

## 🖼️ Export

The **Export PNG** button has two modes (*Settings → Behaviour → Export PNG*):

- **🔲 Visible area** *(default)* — hides the toolbar and captures the current viewport (page + annotations) as a screenshot PNG.
- **📄 Full page** — renders **every stroke across the whole document** (ink on white) into a single PNG at any page length, so nothing drawn off-screen is lost. It's an exact vector-to-raster render (not screenshot stitching), so it stays reliable on long, scrollable pages.

---

## 🔍 Under the hood

<details>
<summary><b>How it works</b> — the two-layer, scroll-anchored canvas</summary>

<br>

**Two canvas layers** (the approach used by tools like Excalidraw):

- **Static layer** — a `position: absolute` canvas holding all committed strokes. Because it lives in the page's coordinate space, the browser scrolls it **natively** with the content — no JavaScript runs on scroll, which keeps scrolling smooth.
- **Live layer** — a `position: fixed`, viewport-sized canvas that only draws the single in-progress stroke, so drawing stays fast no matter how much is already on the page.

The static layer is **virtualized**: it only covers a band (~3 screens tall) around the viewport at full device resolution, repositioning and repainting occasionally as you approach an edge. That keeps strokes crisp on pages of any length while bounding memory — no giant canvas, no downscaling blur.

Strokes are stored in **document coordinates**, drawn with a low-latency (`desynchronized`) canvas and coalesced pointer events for a responsive pen. Freehand input runs through optional **exponential smoothing**; static-layer repaints are **coalesced to one per frame** so erasing and undo stay smooth. On SPA route changes the scene resets cleanly — flushing any pending autosave first, then reloading saved drawings if auto-restore is on.

</details>

<details>
<summary><b>Engineering highlights</b> — the problems that made this interesting to build</summary>

<br>

- **Smooth scrolling with unbounded pages.** A two-layer canvas separates *committed* ink from the *in-progress* stroke, and the committed layer is **virtualized** to a band around the viewport. The browser scrolls it natively — **zero JavaScript runs on a normal scroll** — while memory stays bounded no matter how long the page is.
- **Responsive drawing on dense annotations.** Hit-testing (the eraser's per-move hot path) uses **cached, weak-keyed bounding boxes** to reject far-away strokes in a few comparisons instead of scanning every point of every stroke.
- **Coexisting with the host page's keyboard.** Typing over a site like YouTube used to trigger the site's shortcuts (space = play/pause). Draw on Web shields key events at the **window capture phase** — the outermost point in the event path — so page handlers never fire, while the browser's native character insertion still works.
- **WYSIWYG multi-line text.** The inline editor and the committed canvas text share one font stack and wrap to the same width, so what you type is exactly what gets drawn — and each stroke stores its own font so a drawing keeps its look even if the setting later changes.
- **Crispness on HiDPI without blur.** Canvases render at device-pixel resolution with a capped backing store, so strokes stay sharp on retina displays without an ever-growing bitmap.
- **Serialisable, immutable strokes.** Every stroke is a plain JSON object; history is snapshot-based, and transforms operate on clones — which keeps undo/redo, persistence, and the bbox cache all correct for free.

</details>

<details>
<summary><b>Project structure</b></summary>

<br>

```text
.
├── manifest.json                          MV3 manifest
├── README.md
├── PRIVACY.md                             privacy policy
├── docs/                                  support website (plain HTML/CSS/JS · hosted on Vercel)
└── src/
    ├── background/service-worker.js        icon/keyboard toggle, screenshot capture, open options
    ├── content/
    │   ├── content.js                      controller: lifecycle, tools, keyboard, text, export, persistence
    │   ├── canvas-manager.js               two-layer (static + live) virtualized, scroll-anchored canvas
    │   ├── drawing-engine.js               strokes, all tools, cached-bbox hit-test, undo/redo, serialize
    │   ├── toolbar.js                       floating draggable/collapsible toolbar (inline Lucide icons)
    │   ├── storage.js                       chrome.storage wrapper (settings + per-URL drawings)
    │   └── content.css                      toolbar / canvas / cursor / themes
    ├── options/                            settings page (options.html / .css / .js)
    └── icons/                              extension icons
```

</details>

---

## ⚠️ Limitations & notes

- Works on `http(s)` and local `file://` pages (the latter needs *Allow access to file URLs*). Chrome system pages (`chrome://`, the Web Store) can't be injected into — a browser restriction.
- Top frame only (not inside iframes).
- **Visible area** export captures the current viewport; use **Full page** to export everything across the document.
- Installing/reloading the extension while a tab is already open: the first toggle injects the scripts (a page reload also works).

---

## 🔗 Links & contact

- **Chrome Web Store:** <https://chromewebstore.google.com/detail/ahodmhekhpcglhflceahakgojleklenc>
- **Website & support:** the [`docs/`](docs/) folder, a plain HTML/CSS/JS site hosted on Vercel (set the project's **Root Directory** to `docs`). Replace with your live URL, e.g. `https://draw-on-web.vercel.app`.
- **Privacy policy:** [`PRIVACY.md`](PRIVACY.md) — also served at `/privacy.html` on the website.
- **Email:** sangwanmayank462@gmail.com
- **Instagram:** <https://www.instagram.com/mayanksangwan_77/>

---

## 🗺️ Roadmap

Deliberately left as clean extension points, enabled by the serialisable-stroke model, tool registry, and storage wrapper:

**Whiteboard mode** · **cloud sync & sharing links** · **stylus pressure** · **multi-page PDF markup**

<div align="center"><sub>Built with vanilla JS · Manifest V3 · no build step</sub></div>
