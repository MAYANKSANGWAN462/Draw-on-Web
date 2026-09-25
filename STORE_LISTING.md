# Chrome Web Store — Listing & Submission Cheat Sheet

Everything to copy-paste when publishing **Draw on Web**. Keep this file out of the
uploaded ZIP (it's repo-only documentation).

---

## 1. Package to upload

Upload `draw-on-web-v0.8.0.zip` (contains only `manifest.json` + `src/`).
Re-zip with this command whenever you bump the version:

```powershell
Compress-Archive -Path manifest.json,src -DestinationPath draw-on-web-v0.8.0.zip -Force
```

---

## 2. Store listing tab

**Name:** Draw on Web

**Summary (max 132 chars):**
> Draw, highlight, and annotate on any web page. Your ink scrolls with the content, not the screen.

**Category:** Productivity

**Language:** English

**Detailed description:**
```
Draw on Web turns any web page into a canvas. Sketch, highlight, and annotate
directly on top of whatever you're viewing — articles, docs, dashboards, designs,
or local files.

WHAT MAKES IT DIFFERENT
Most pen extensions pin their marks to the screen, so the moment you scroll, the
ink slides off the thing you were pointing at. Draw on Web stores every stroke in
the page's own coordinate space — so an arrow drawn next to a paragraph stays next
to that paragraph, through scrolling, infinite scroll, and single-page-app
navigation. It even works inside inner scroll areas like chat threads and doc panels.

A FULL TOOLKIT
• Pen, highlighter, line, arrow, rectangle, ellipse (outline or filled)
• Text with five fonts, multi-line wrapping, and re-editing
• Auto-numbered step stamps for callouts
• Stroke-level eraser
• Select, move, and resize anything you've drawn

BUILT FOR HOW YOU WORK
• Works with mouse, trackpad, and touchscreen — gestures adapt to your device
• A customisable floating toolbar: size, shape, colour, position, and tool order
• Light / dark / auto themes and a custom colour palette
• Undo / redo, keyboard shortcuts, and pen smoothing
• Export your annotated page as a PNG (visible area or full page)
• Settings sync across your Chrome installs

PRIVATE BY DESIGN
No account, no sign-up, no tracking, no servers. Everything stays on your device.
Completely free.

HOW TO USE
Click the extension icon or press Ctrl+Shift+D (Cmd+Shift+D on Mac) to toggle
drawing mode. Pick a tool from the floating toolbar and start drawing. Switch to
Cursor mode to use the site normally while your annotations stay anchored.
```

---

## 3. Privacy tab answers

**Single purpose:**
> Allows the user to draw and annotate on top of web pages.

**Permission justifications:**
| Permission | Justification |
|---|---|
| `activeTab` | To inject the drawing canvas into the current tab when the user activates the tool. |
| `storage` | To save the user's annotations and settings locally so they persist across sessions. |
| `scripting` | To inject the drawing canvas and toolbar into the page. |
| Host permissions (`<all_urls>`, `file:///*`) | Required so the user can draw on whichever page they are currently viewing, including local files. |

**Remote code:** No, I am not using remote code.

**Data collected:** None — leave every checkbox unchecked. All data is stored
locally on-device and never transmitted.

**Certifications:** Check all three (no selling/transfer, no unrelated use, no
credit/lending use).

**Privacy policy URL:** Link to the hosted `PRIVACY.md`
(e.g. `https://github.com/<user>/<repo>/blob/main/PRIVACY.md`).

---

## 4. EEA trader declaration

Choose **Non-trader** for now (free, personal/exploration project).
Switch to **Trader** later — required — before offering any paid services.

---

## 5. Screenshots (1280×800, up to 5)

Capture via Chrome DevTools device mode: F12 → Ctrl+Shift+M → set 1280×800,
DPR 2–3 → ⋮ menu → Capture screenshot. Add a bold caption to each.

1. **"Draw on ANY web page — instantly."** — colourful strokes + highlight + arrow on a real article. (This is the thumbnail; make it vivid.)
2. **"Highlight key points & jot notes right where you need them."**
3. **"Your annotations stay anchored — they scroll with the page."** — the differentiator; before/after scroll.
4. **"Pen, highlighter, shapes, text, and more."** — close-up of the toolbar.
5. **"Perfect for studying, design feedback & research — free, no sign-up."**

Optional extras: 440×280 promo tile; a short GIF/video of drawing in action.

---

## 6. Submit

Set visibility to **Public** → Submit for review (first review can take a few
hours to a few days).
