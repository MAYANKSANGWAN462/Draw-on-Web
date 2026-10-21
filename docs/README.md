# Draw on Web — Support Website

This `docs/` folder is the **support website** for the Draw on Web Chrome
extension. It is deployed as a static site (Vercel — set the project's **Root
Directory** to `docs`) and used for the extension's Support / Homepage /
Privacy Policy URLs on the Chrome Web Store.

> It is completely separate from the extension's code (`manifest.json` + `src/`)
> and is **not** part of the uploaded `.zip`.

## Stack

Plain **HTML + hand-written CSS + vanilla JavaScript**. No framework, no build
step, no `npm install`. The only external resource is Google Fonts (loaded via
CDN, with a system-font fallback). This keeps the site tiny, fast, offline-
friendly after first load, and trivially deployable — and it mirrors the
extension's own zero-dependency philosophy.

## Files

| File | What it is |
|------|------------|
| `index.html` | Landing page — hero, features, how-it-works, shortcuts, CTA. |
| `support.html` | Install guide, how-to, shortcuts table, troubleshooting, FAQ, contact. |
| `privacy.html` | Privacy Policy (mirrors the repo's `PRIVACY.md`). |
| `styles.css` | All styling and the light/dark design tokens. |
| `script.js` | Theme toggle, mobile menu, FAQ accordion, scroll-reveal, link config. |
| `assets/` | Favicons / icons copied from the extension (`icon-16/32/48/128.png`). |

## ⚙️ Configure your links (do this once)

All "Add to Chrome", GitHub, and email links read from one config block at the
top of **`script.js`**:

```js
window.DOW_CONFIG = {
  storeUrl: "https://chromewebstore.google.com/detail/ahodmhekhpcglhflceahakgojleklenc",
  repoUrl:  "https://github.com/MAYANKSANGWAN462/Draw-on-Web",
  email:    "sangwanmayank462@gmail.com",
  instagram:"https://www.instagram.com/mayanksangwan_77/",
};
```

- **`storeUrl`** — the live Chrome Web Store listing (the "Add to Chrome" target).
- **`repoUrl`** — the public GitHub repository (used for "Report a bug" →
  `/issues`).
- **`email`** — the support/privacy contact address.

Change these three values and every button across all pages updates
automatically.

## 🖼️ Screenshots (optional, added later)

There are **no screenshots** right now. The hero uses a self-contained SVG
illustration (`.hero-art` in `index.html` / `styles.css`), so the page looks
complete without any images.

If you want to add a real screenshot later, drop a PNG into `assets/` and place
an `<img>` where you want it, e.g. inside the hero's `.mock`:

```html
<img src="assets/screenshot-hero.png" alt="Draw on Web annotating a web page" />
```

## 👀 Preview locally

No server is strictly required — you can double-click `index.html` to open it in
a browser. For clean relative links, a tiny local server is nicer:

```bash
# from the docs/ folder
python -m http.server 8000
# then open http://localhost:8000
```

## ✏️ Updating content later

| To change… | Edit… |
|------------|-------|
| Headline / features / steps | `index.html` |
| Install steps, how-to, FAQ, troubleshooting | `support.html` |
| Privacy policy wording / "Last updated" date | `privacy.html` |
| Colours, spacing, dark theme | `styles.css` (the `:root` / `[data-theme="dark"]` tokens) |
| Store / repo / email links | `window.DOW_CONFIG` in `script.js` |

Keep the Privacy Policy in sync with the repo's top-level `PRIVACY.md`.
