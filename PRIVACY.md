# Privacy Policy — Draw on Web

_Last updated: 25 September 2026_

**Draw on Web** ("the extension") is built to respect your privacy completely. This
policy explains what data the extension handles and, more importantly, what it does
**not** do.

## The short version

**Draw on Web does not collect, transmit, sell, or share any of your data.**
There are no servers, no analytics, no tracking, and no external network requests.
Everything the extension stores stays on your own device (or within your own
Google account, if you use Chrome Sync).

## What the extension stores

To function, the extension saves a small amount of data **locally on your device**
using the browser's built-in storage APIs:

- **Your settings** (tool defaults, colours, toolbar layout, theme, input-device
  preference, etc.) — stored via `chrome.storage.sync`. If you are signed into
  Chrome, these preferences travel with your own Google account across your
  Chrome installs. They are never sent to the developer or any third party.
- **Your drawings** (the annotations you create) and toolbar position — stored
  via `chrome.storage.local`, which never leaves your device. Drawings are keyed
  by page URL only so they can be re-attached to the correct page; auto-restore
  of drawings is **off by default**.

## What the extension does NOT do

- ❌ It does **not** collect personally identifiable information.
- ❌ It does **not** track your browsing history or send your visited URLs anywhere.
- ❌ It does **not** contain analytics, telemetry, or advertising code.
- ❌ It does **not** make network requests or load remote code — all code ships
  inside the extension package.
- ❌ It does **not** sell or transfer any data to third parties.

## Permissions

- **`activeTab` / host access** — used solely to draw the annotation canvas onto
  the page you are currently viewing. No page content is read, stored off-device,
  or transmitted.
- **`scripting`** — used to inject the drawing canvas and toolbar into the page.
- **`storage`** — used to save your settings and drawings locally, as described above.

## Removing your data

You can clear all saved drawings and reset all settings at any time from the
extension's **Options** page (**Clear saved drawings** and **Reset to defaults**).
Uninstalling the extension removes all locally stored data.

## Contact

Questions about this policy can be sent to: **mayanksangwan7070@gmail.com**

_This policy may be updated if the extension's functionality changes. Any material
change will be reflected in the "Last updated" date above._
