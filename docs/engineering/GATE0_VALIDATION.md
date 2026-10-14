# Gate 0 Validation Report

**Date:** 2026-10-14
**Issue:** #2
**Branch:** `chore/gate0-validation`
**Environment:** WSL2, Node v26.7.0, unauthenticated GitHub access (no `CONTRIBUTOR_GITHUB_TOKEN`)

## Verified

| Area | Result | Evidence |
|------|--------|----------|
| MCP stdio handshake | Yes | `initialize` returned protocol `2024-11-05`, `tools.listChanged: true`; `tools/list` returned 7 tools; process exited 0. See `MCP_SMOKE_TEST.md`. Re-run during this report with the same result. |
| Live GitHub search (Node, unauthenticated) | Yes | `client.discover(...)` returned 3 items, 0 warnings, with score, difficulty, confidence and reasons populated. See `GITHUB_API_VALIDATION.md`. |
| Seed issues | 10 of 10 created | GitHub issues #3-#12. See `SEED_ISSUES_LOG.md`. |
| Unit tests | 8/8 pass | `npm run test` |
| Static build | Pass | `npm run build` produced `dist/` |

### Caveats on what was verified

- The MCP check was a hand-piped JSON-RPC handshake over stdio, not the MCP Inspector or a real client.
- `notifications/initialized` was sent with an `id` (as a request), so the server answered "Method not found". A real client sends it without an `id`; that form was not exercised.
- Only `initialize` and `tools/list` were exercised. No tool was called.
- GitHub search was a single cold call from Node. It says nothing about browser CORS, token auth, sustained quota, or rate-limit UX.

## Still needs manual testing

- Live MCP client registration and tool discovery with Claude Code, Codex, OpenCode and Hermes (issue #5).
- Browser CORS behavior and quota behavior of GitHub search from the deployed static site.
- Token path: `Authorization` header sent when `CONTRIBUTOR_GITHUB_TOKEN` is set.
- Rate-limit error surfaced clearly in the UI.
- Calling each of the seven MCP tools end to end.
- Human UX trial with five real users, recording unmatched queries and accessibility issues.

## Process notes

- The seed issues log originally listed issue numbers 1-10; GitHub numbers them 3-12. Corrected in a separate commit.
