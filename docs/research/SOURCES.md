# Primary sources and verification register

Research reviewed October 14, 2026. Documentation can change; check again before shipping a named client version or a billing claim.

| Subject | Source | Used for |
|:--|:--|:--|
| GitHub App security | https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app | Fine-grained user permissions, scopes, secret handling and webhook recommendations |
| GitHub OAuth App guidance | https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app | GitHub App preference and short-lived tokens |
| GitHub search syntax | https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests | Issue / PR queries and review filters |
| GitHub REST search API | https://docs.github.com/en/rest/search/search | Endpoint, search limitations and rate limits |
| MCP current SDK v2 | https://ts.sdk.modelcontextprotocol.io/v2/ | Official v2 transport/tool specification and 2026-07-28 support |
| MCP v2 first server | https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server | `McpServer`, `registerTool`, `serveStdio`, Inspector |
| Hermes MCP support | https://github.com/hermes-agent-org/hermes/blob/main/website/docs/user-guide/features/mcp.md | Local stdio and remote HTTP config, client integration |
| Hermes persistent memory | https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/ | USER.md, MEMORY.md and bounded memory behavior |
| CodeRabbit pricing | https://www.coderabbit.ai/pricing | Public repository plan and paid tier distinction |
| Cloudflare Pages pricing | https://developers.cloudflare.com/pages/functions/pricing/ | Free static assets, Workers quota for functions |
| Cloudflare Workers plans | https://www.cloudflare.com/plans/developer-platform/ | Free plan quotas and paid threshold |
| OpenCode MCP | https://opencode.ai/docs/mcp-servers/ | Provider onboarding and local MCP configuration |
| Claude MCP | https://code.claude.com/docs/en/mcp | Claude Code MCP commands |
| Codex MCP | https://developers.openai.com/codex/mcp/ | Codex CLI MCP configuration |
| goodfirstissue.org | https://goodfirstissue.org/ | Existing discovery services |
| Up For Grabs | https://up-for-grabs.net/ | Existing curated starter issues |
| CodeTriage | https://www.codetriage.com/ | Existing GitHub issue digest |

### Limits of research

Vendor docs show intended capabilities, **not verified live interoperability of this repository**. No external GitHub PR was submitted or reviewed by this code. No real cloud bill or AI token bill was measured. CodeRabbit's free open-source reviews are tied to its eligible installed repositories, not an unrestricted right to redistribute CodeRabbit review service for arbitrary third-party projects.
