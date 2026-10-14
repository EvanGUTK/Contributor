# MCP interoperability test matrix

Status: **not yet executed**. This matrix is deliberately blank instead of misrepresenting documentation compatibility as tested runtime support.

| Provider/client | Exact tested version | OS | Discovery tool call | Hermes/private memory handling | Result |
|:--|:--|:--|:--|:--|:--|
| Claude Code latest stable | pending | pending | pending | N/A | untested |
| OpenAI Codex latest stable | pending | pending | pending | N/A | untested |
| OpenCode latest stable | pending | pending | pending | N/A | untested |
| Hermes Agent latest stable | pending | pending | pending | pending | untested |

To qualify a client, provide a real MCP handshake/Inspector or CLI transcript (redacted), tool list, `discover_opportunities` call, 403/429 behavior, and no unexpected write actions. Retest each stable release before claiming support for that version.
