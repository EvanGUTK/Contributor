# Contributor browser extension (scaffold)

Manifest V3 extension for Chrome and Firefox. **Status: scaffold only.** Nothing here calls the GitHub API yet.

## Build and load unpacked

```bash
npm run build:extension   # copies extension/ to dist-extension/
```

**Chrome / Chromium:** open `chrome://extensions`, enable *Developer mode*, choose *Load unpacked*, select `dist-extension/`.

**Firefox (128+):** open `about:debugging#/runtime/this-firefox`, choose *Load Temporary Add-on…*, select `dist-extension/manifest.json`. Temporary add-ons are removed when Firefox restarts.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Reserved for the popup acting on the current tab on user click. No broad host permissions are requested. |
| Content script match `https://github.com/*/*/issues/*` | Lets the badge appear on GitHub issue pages. This is a content-script match, not a host permission, and grants no network access. |

The extension collects, stores and transmits no data.

## Shipped vs planned

Shipped (scaffold):
- Popup with a link to the project.
- On issue pages, a small badge next to the title: "◇ Contributor: open web app to find similar issues". It does nothing if the title element is missing.

Planned (not implemented):
- Match reasoning overlay on GitHub pages (WXT-based build).
- Live GitHub data and opt-in settings.
- Keyboard and high-contrast accessibility audit.
- Link to the hosted web app once deployed (currently points to the repository).
