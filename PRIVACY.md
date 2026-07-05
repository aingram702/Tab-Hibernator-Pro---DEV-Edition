# Privacy Policy — Tab Hibernator Pro — DEV Edition

**Last updated:** July 5, 2026
**Applies to:** Tab Hibernator Pro — DEV Edition (the "Extension"), version 1.0.0 and later.

## Summary

**Tab Hibernator Pro — DEV Edition does not collect, transmit, sell, or share any
personal data.** The Extension has no backend server, makes no network requests,
and contains no analytics, tracking, or advertising code. Everything it does
happens locally inside your own browser.

## What the Extension accesses, and why

To manage tabs the Extension needs to read and act on browser tab information.
All of this is used **only** on your device, in the moment, to provide the
Extension's features — it is never sent anywhere.

| Data | Why it is accessed | Where it goes |
| --- | --- | --- |
| Tab URLs, titles, and favicons | To decide which tabs are idle/protected, to build the "frozen tab" screen so a hibernated tab stays recognizable and can be restored, and to group tabs by site | Stays in your browser; never transmitted |
| Whether a page has unsaved form input | So the Extension never hibernates a tab where you are mid‑edit | Read on demand, in memory only; never stored or transmitted |
| Page scroll position | To return you to where you left off when a hibernated tab is restored | Held in temporary in‑memory (session) storage, discarded when the browser closes |
| Tab audible / pinned / active state | To apply your protection rules (never freeze audio, pinned, or the active tab) | Stays in your browser; never transmitted |

The Extension does **not** read the content of the pages you visit beyond
detecting the presence of unsaved input in form fields, and does not access
passwords, cookies, browsing history, or any personal files.

## What the Extension stores

The Extension stores only your own configuration and simple counters, using the
browser's built‑in extension storage:

- **Settings** (idle timer, protection rules, whitelist/dev‑site lists, theme,
  behavior toggles) are saved with `chrome.storage.sync`. If you have Chrome
  Sync enabled, your browser may sync these settings across your own signed‑in
  devices through your Google account, governed by
  [Google's Privacy Policy](https://policies.google.com/privacy). The Extension
  itself never receives or transmits this data.
- **Usage counters** (e.g. total tabs hibernated, an estimate of RAM reclaimed)
  are saved locally with `chrome.storage.local` and never leave your device.

You can view, change, export, import, or reset all of this data at any time from
the Extension's Settings page. Removing the Extension deletes its local data.

## What the Extension does NOT do

- It does **not** send any data to the developer or any third party.
- It does **not** use analytics, telemetry, crash reporting, or advertising.
- It does **not** track your browsing across sites.
- It does **not** sell or share your information with anyone.
- It does **not** load or execute any remote code — all code ships inside the
  Extension package (Manifest V3, strict content security policy).

## Permissions and how they are used

- **`tabs`** — read tab URL/title/favicon and move/reload/hibernate tabs.
- **`tabGroups`** — create and name native tab groups for the "group by site" feature.
- **Host access (`http://*/*`, `https://*/*`)** — run a small content script on
  web pages to detect unsaved form input and restore scroll position.
- **`storage`** — save your settings and usage counters (as described above).
- **`alarms`** — run the periodic idle‑tab check.
- **`contextMenus`** — provide the right‑click menu actions.

The Extension does not request the `scripting` permission and injects no code at
runtime beyond its declared content script.

## Children's privacy

The Extension is a general‑purpose developer tool, does not target children, and
collects no personal information from anyone.

## Changes to this policy

If this policy changes, the "Last updated" date above will be revised and the new
version will be published in the Extension's repository. Material changes will be
reflected before or when a corresponding Extension update is released.

## Contact

Questions about this policy or the Extension's privacy practices can be sent to:

**aingram702@outlook.com**

*(Project maintainer — update this address if you fork or re‑publish the Extension.)*
