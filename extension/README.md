# Contributor browser extension

Manifest V3 extension for Chrome and Firefox. **Status: early.** On GitHub issue pages it fetches the issue from the public GitHub API and shows a live Contributor score badge.

## Build and load unpacked

```bash
npm run build:extension   # copies extension/ to dist-extension/
```

**Chrome / Chromium:** open `chrome://extensions`, enable *Developer mode*, choose *Load unpacked*, select `dist-extension/`.

**Firefox (128+):** open `about:debugging#/runtime/this-firefox`, choose *Load Temporary Add-on…*, select `dist-extension/manifest.json`. Temporary add-ons are removed when Firefox restarts.

## Live score badge

On `https://github.com/{owner}/{repo}/issues/{number}` the content script requests `https://api.github.com/repos/{owner}/{repo}/issues/{number}` anonymously (no API key, no login) and scores the issue client-side. The badge is added to the issue sidebar (falling back to a small floating card if the sidebar is not found) and shows:

- A `◇ Contributor` header.
- A score bar and `score/60` value.
- The reasons behind the score, for example `Good first issue · Recently active`.
- A `Find similar issues ↗` link that opens the Contributor web app (`https://contributor-7cw.pages.dev/#discover`) in a new tab.

Scoring is a minimal inline copy of the web app's relevance logic, capped at 60:

| Signal | Points |
| --- | --- |
| Label contains `good first issue` or `beginner` | +30 |
| Label contains `help wanted` | +15 |
| Updated within 30 days | +15 |
| Updated within 90 days (and not within 30) | +8 |

If the API call fails (offline, rate-limited, private or missing issue) or the score is 0, no badge is shown and any existing badge is removed. Anonymous GitHub API requests are rate-limited per IP (60 per hour at the time of writing), so heavy browsing can temporarily hide the badge.

## Permissions

| Permission | Why |
| --- | --- |
| `activeTab` | Reserved for the popup acting on the current tab on user click. |
| Host permission `https://api.github.com/*` | Lets the content script read public issue data. No other hosts are requested. |
| Content script match `https://github.com/*/*/issues/*` | Lets the badge appear on GitHub issue pages. |

The extension stores nothing and sends no data to Contributor or any third party. The only network request is the anonymous read of the issue you are viewing from `api.github.com`; the web app link is opened only when you click it.

## Shipped vs planned

Shipped:
- Popup with a link to the project.
- Live score badge on GitHub issue pages, as described above.

Planned (not implemented):
- Pre-selecting the current issue in the web app (the link currently opens `#discover` without passing the issue).
- Match reasoning overlay on GitHub pages (WXT-based build).
- Opt-in settings and optional authenticated GitHub requests for higher rate limits.
- Keyboard and high-contrast accessibility audit.
