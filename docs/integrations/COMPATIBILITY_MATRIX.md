# MCP interoperability test matrix

Status: the automated stdio harness passes; **no live client has been tested yet**. The harness proves the server speaks the MCP stdio protocol correctly. It does not prove that any particular client can connect to, list or call Contributor.

Tracking issue: [#5](https://github.com/EvanGUTK/Contributor/issues/5).

## Automated stdio smoke test

Run it locally with Node 22 or later:

```bash
npm install
npm run test:mcp
```

| Check | Result | Notes |
|:--|:--|:--|
| Server spawn over stdio (`node apps/mcp/server.mjs`) | PASS (automated) | Newline-delimited JSON-RPC; stdout carries only JSON lines. |
| `initialize` + `notifications/initialized` | PASS (automated) | Sent with protocol version `2025-06-18`. Newer protocol versions are not exercised. |
| `tools/list` returns all 10 expected tools | PASS (automated) | `discover_opportunities`, `find_review_requests`, `inspect_repository`, `analyze_issue`, `analyze_pull_request`, `prepare_contribution`, `get_contribution_status`, `get_repository_passport`, `request_memory_handoff`, `prepare_review_checklist`. |
| `tools/call` `discover_opportunities` | PASS (automated) | Asserts only a valid JSON response with a `content` array. Live GitHub results are **not** asserted, and an `isError` response (offline, rate-limited) also passes. |

Not covered by the harness: input validation of malformed owner/repo/URL fields, the other nine tool calls, 403/429 behavior, reconnect/restart, token handling, WSL/Windows path handling, and anything client-specific.

## Live client matrix

| Client | Tested version | Transport | Status | Notes |
|:--|:--|:--|:--|:--|
| Claude Code | not recorded | stdio | not yet tested in live environment — stdio harness passes | Setup commands are in [MCP_CLIENTS.md](MCP_CLIENTS.md) and are unverified. A successful `claude mcp list` would not prove a callable tool. |
| Codex CLI | not recorded | stdio | not yet tested in live environment — stdio harness passes | Setup commands are unverified; confirm tool discovery in a real session. |
| OpenCode | not recorded | stdio | not yet tested in live environment — stdio harness passes | The `mcp.contributor` local-command config shape is unverified against the installed version. |
| Hermes | not recorded | stdio | not yet tested in live environment — stdio harness passes | The `mcp_servers` YAML is unverified. Memory handoff behavior (`request_memory_handoff`) has not been exercised by a real Hermes session. |

## Qualifying a client

To mark a client as tested, record a redacted transcript or Inspector/CLI capture showing the exact client version and date, the tool list, a `discover_opportunities` call, 403/429 behavior, and no unexpected write actions. Retest each stable release before claiming support for that version.
