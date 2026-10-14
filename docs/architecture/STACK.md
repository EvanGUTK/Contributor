# Technology stack and evolution plan

## Present early-alpha stack (built)

| Layer | Implementation | Reason |
|:--|:--|:--|
| Web | HTML5, CSS, JavaScript ES modules | No paid platform or dependency build required; rapidly validate discovery |
| Source layout | Node.js ESM monorepo | Shared matcher and GitHub adapter across web/MCP |
| Hosting | Static `dist/` | GitHub Pages or Cloudflare Pages free subdomain; no mandatory servers |
| GitHub API | REST `2022-11-28`, native `fetch` | Read-only public search and repository/PR inspection |
| Match engine | Deterministic weighted heuristic | Explainable ranking; no mandatory model inference |
| Local MCP | Official v2 `@modelcontextprotocol/server`, Zod | Standard stdio tool access from existing AI clients |
| Tests | Node built-in `node:test` | Zero external test dependencies for core and GitHub request checks |
| License | MIT | Permission for other developers to learn, adapt and self-host |

The current static UI is intentionally not React: a framework/build system adds development overhead before the core matching problem is validated. This is not a claim that React is bad or that this static design is the final UI architecture.

## Production candidate stack (planned, needs ADR/approval)

| Layer | Candidate | Gate to adopt |
|:--|:--|:--|
| UI | React + TypeScript and accessible component primitives | Current workflow tested with users; measurable UI complexity justifies it |
| API | Cloudflare Worker + Hono or equivalent | Need GitHub App OAuth, shared saved opportunities or remote MCP |
| Storage | Cloudflare D1 | Explicit persistence requirements and deletion policy; free quota budget |
| Auth | GitHub App OAuth user access tokens | Production callback, PKCE/state, scopes, rotation and revoke verified |
| MCP remote | SDK v2 Streamable HTTP | Tested auth, version negotiation, per-tool limits and memory privacy |
| Optional local companion | Node.js CLI | Validated trusted checkout, secure command execution and CodeRabbit CLI |
| Browser extension | WXT + TypeScript | Working web/MCP recommendation engine; users request embedded overlays |
| AI | Host assistant + opt-in BYOK model | No Contributor-hosted inference spend; consent and model cost meter |

## Nonfunctional design constraints

- Never require paid hosted AI to search GitHub.
- Founder cloud operating cost targets $0; no surprise paid plan migration.
- Public GitHub requests bounded and cached; honor 403/429.
- Correctly distinguish an issue in progress, archived project and PR with external-review policies.
- User privacy: the web must never receive an existing assistant's full memory history.
- No autopublished PR reviews, comments or spam.
- All newer provider adapters need live compatibility tests on actual stable versions at release.

## Repository contract

`packages/core` never imports `web` or `apps/mcp`.
`packages/github` may import core normalization but contains no model inference or publish API.
`apps/mcp` composes core and GitHub read operations and never uses GitHub write scopes.
`web` displays model-independent results, no tokens.
Future API and extension must reuse the same core scorer and provenance model, rather than duplicating ranking rules.
