# MCP client onboarding and compatibility

**Status:** local stdio MCP v2 source exists; this repo has **not yet verified live MCP handshakes** against four clients. These commands are intended setup starting points, not compatibility certification. Use stable versions available at time of installation.

## Build and smoke test locally

```bash
git clone https://github.com/EvanGUTK/contributor.git
cd contributor
npm install
npm run mcp
```

Running `npm run mcp` directly will print a startup line to **stderr** and then wait for a client on stdin. Do not type prompts into that process. For the MCP Inspector use:

```bash
npx @modelcontextprotocol/inspector node apps/mcp/server.mjs
```

Verify the server exposes seven tools and `discover_opportunities` returns actual GitHub results, or a clear rate-limit error. MCP v2 package is `@modelcontextprotocol/server` and supports the 2026-07-28 protocol line. For client setup, use an **absolute** path to `apps/mcp/server.mjs`.

## Claude Code

```bash
claude mcp add --transport stdio contributor -- node /absolute/path/to/contributor/apps/mcp/server.mjs
claude mcp list
```

If your version's `claude mcp add --help` syntax differs, follow that CLI's documented argument form. A successful `list` does not prove a callable tool; invoke discovery from a Claude session and inspect the result.

## OpenAI Codex

```bash
codex mcp add contributor -- node /absolute/path/to/contributor/apps/mcp/server.mjs
codex mcp list
```

For configs managed in TOML, use Codex's built-in MCP management; confirm tool discovery in an actual session. Do not overwrite an existing `~/.codex/config.toml` blindly.

## OpenCode

Example config for versions using the documented local command form (validate the installed version):

```json
{
  "mcp": {
    "contributor": {
      "type": "local",
      "command": ["node", "/absolute/path/to/contributor/apps/mcp/server.mjs"],
      "enabled": true
    }
  }
}
```

Use `opencode mcp` / provider help according to the current CLI; preserve existing MCP servers and permissions.

## Hermes Agent

Hermes supports local stdio tools and remote HTTP MCP clients. In `~/.hermes/config.yaml`, add to an existing `mcp_servers:` block:

```yaml
mcp_servers:
  contributor:
    command: node
    args:
      - /absolute/path/to/contributor/apps/mcp/server.mjs
```

Restart Hermes and ask:

> Find GitHub repositories and code-review opportunities that match what you already know about my interests. Share only the language/topic preferences necessary for discovery, and ask if unsure whether I want that context used.

Hermes memory lives in Hermes; Contributor does not copy `~/.hermes/memories/USER.md`, `MEMORY.md`, other memory providers or conversations. It receives concise MCP arguments selected by the assistant with user permission. Follow [Hermes memory](HERMES_MEMORY.md).

## Testing release compatibility

For **every supported latest stable client version**, the QA matrix must record:

| Test | Required evidence |
|:--|:--|
| Stdio startup | Real spawn, JSON-RPC init, tool discovery |
| Tool call | Actual public GitHub result or rate limit error |
| Input validation | Reject malformed owner/repo/URL fields |
| Restart | Reconnect works without leaking tokens |
| User preference privacy | No raw memory files supplied to Contributor |
| User permissions | No public write action or hidden AI inference |
| Windows/WSL2 | Absolute path, executable `node`, environment and quote behavior |

Explicitly log exact versions/dates and whether a test is passed, blocked or unrun. Compatibility isn't confirmed merely because both sides claim MCP support.

## Optional GitHub token

In the **local server environment**, `CONTRIBUTOR_GITHUB_TOKEN` can be provided for higher public GitHub API limits. No GitHub token is necessary for anonymous use. Never store secrets in tracked configuration or inline documentation examples. Prefer a minimal scoped read-only credential if you choose authenticated operation.
