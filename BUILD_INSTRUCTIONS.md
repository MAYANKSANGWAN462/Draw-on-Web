# Build Instructions — Chrome Web Store package

This explains how to produce the `.zip` you upload to the Chrome Web Store, and
how to make sure the support website (`docs/`) and other repo-only files are
**never** included in it.

## What belongs in the uploaded ZIP

Only the runnable extension:

```
manifest.json
src/            (background, content, options, icons)
```

**Everything else is repo-only** and must stay out of the ZIP:

- `docs/` — the support website (served by GitHub Pages)
- `.git/`, `.claude/`, `.gitignore`
- `README.md`, `PRIVACY.md`, `STORE_LISTING.md`, `BUILD_INSTRUCTIONS.md`
- `build-extension.*`
- any existing `*.zip`

## Build it (recommended: use the script)

**Windows / PowerShell:**

```powershell
./build-extension.ps1
```

**macOS / Linux / Git Bash:**

```bash
bash build-extension.sh
```

Both read the version from `manifest.json` and produce
`draw-on-web-v<version>.zip` in the project root, containing **only**
`manifest.json` and `src/`.

## Build it manually (one-liner)

If you'd rather not use the script, this is the exact command (matches how the
package has been made before):

**PowerShell:**

```powershell
Compress-Archive -Path manifest.json,src -DestinationPath draw-on-web-v0.12.0.zip -Force
```

Because you list `manifest.json,src` explicitly, nothing else (including
`docs/`) can sneak in.

## Verify the ZIP excludes `docs/`

**PowerShell:**

```powershell
Expand-Archive draw-on-web-v0.12.0.zip -DestinationPath _ziptest -Force
Get-ChildItem -Recurse _ziptest | Select-Object FullName
Remove-Item -Recurse -Force _ziptest
```

You should see only `manifest.json` and the `src/` tree — no `docs/`, no
`.git/`, no markdown files.

## .gitignore note

The repo's existing `.gitignore` already ignores `*.zip`, `dist/`, `build/`,
`.claude/`, and similar local noise, so build artifacts won't be committed.
The `docs/` folder is **intentionally committed** (GitHub Pages serves it) and
must **not** be added to `.gitignore`. No changes to `.gitignore` are required.

## Upload

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. Open your item → **Package** → **Upload new package**.
3. Select `draw-on-web-v<version>.zip`.
4. Fill in the Support / Privacy URLs (see the main chat instructions or
   `STORE_LISTING.md`) and submit for review.
