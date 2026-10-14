# Security engineering plan

## Threat surface

Public GitHub content (issue text, PR descriptions, README, diffs) is **untrusted input** even when hosted on github.com. An agent may encounter prompt injection, hostile build scripts, malicious links, license violations and social engineering. A maintainer may accept human assistance but prohibit AI-generated code or reviews.

## MVP guardrails

- Browser and MCP make only GitHub REST **GET** requests; no write tool is exported.
- Fixed GitHub API host and relative paths. Validate owner/repo/PR input and link protocol/domain.
- Escape title/body text before injecting into HTML. Do not render arbitrary issue Markdown as executable HTML.
- Limit search requests, result length, timeout, and downloaded PR diff excerpts.
- Store no AI keys or GitHub credentials in browser localStorage; AI provider keys are stored encrypted server-side in Cloudflare KV (AES-GCM, per-user, requires GitHub login) and proxied through the Worker — they never touch the browser after initial entry.
- Use minimal permissions for any future GitHub App; support revocation/deletion, source provenance, short-lived tokens, audience checks and signed callback state.
- No automatic public comments, issue creation or PR review publishing.

## Future GitHub OAuth security gate

- Prefer GitHub Apps over OAuth Apps for fine-grained permissions; default read-only.
- Never embed a confidential client secret or app private key in JavaScript distributed to browsers.
- Use an auth server with PKCE, state, CSRF defense, secure HttpOnly cookies and installation permission review.
- Scope user data to immutable GitHub numeric IDs, record installation access, and check membership/access regularly.
- Keep protected writes separately authorized and tie them to the exact visible comment or diff.

## Remote MCP security gate

Before exposing remote HTTP MCP, add OAuth resource server metadata, bearer token validation, per-tool scope, rate limiting, HTTPS, replay/csrf controls, and tenant isolation. A public unauthenticated remote MCP must **not** proxy private GitHub or model keys, provide arbitrary URL fetch, or let users exhaust someone else's API quota.

## Review and local companion risks

A checked-out third-party PR can execute malicious tests or package scripts. Do not auto-run arbitrary code on the user's host without a disclosed sandbox, resource limits and consent. Neither Git worktrees nor language runtimes are security sandboxes.

## User memory

Do not copy Hermes's entire USER.md/MEMORY.md or private conversations. Use typed preferences supplied with user permission; avoid recording sensitive data, and allow correction/deletion in later hosted profile.

## Security release checklist

Hostile issue injection test; XSS test; GitHub rate budget; SSRF negative test for repo owner/name; OAuth token lifecycle; rate limiting; AI spend warning; MCP authority boundaries; privacy/data deletion; accessibility and incident-report instructions.
