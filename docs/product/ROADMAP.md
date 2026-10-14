# Roadmap and issue seed backlog

Prioritize verified usefulness over polishing an empty AI dashboard. Tasks are dependency-ordered; a plan does not establish completed functionality.

## Gate 0 — Research, UX and proof (current)

- [x] Decide free/open-source/byok-first funding model and policy.
- [x] Write discover-first PRD and competitive landscape.
- [x] Build responsive static UI using public GitHub search.
- [x] Implement explainable deterministic ranking and bounded read-only REST client.
- [x] Generate approval-first handoff prompts.
- [x] Write ten-tool MCP v2 server source.
- [x] Build local matching/GitHub API unit tests.
- [x] Install current MCP dependencies and perform stdio protocol smoke test (initialize + tools/list; Inspector and real clients not yet used).
- [x] Validate actual public GitHub search responses from Node (verified 2026-10-14; see `docs/engineering/GITHUB_API_VALIDATION.md`).
- [ ] Human verification of browser CORS/quota behavior of GitHub search from the deployed site.
- [x] Create the ten seed issues (`docs/engineering/SEED_ISSUES_LOG.md`).
- [ ] Verify real Claude/Codex/OpenCode/Hermes current-stable MCP registration and discovery.
- [ ] Human UX trial with five users; document unmatched queries and accessibility issues.

## Gate 1 — Discovery quality

- [x] Search strategies for issue labels (good first issue/help wanted), activity windows, topic and languages with bounded calls.
- [x] Correct issue-linked PR detection using GitHub timeline/GraphQL and mark in-progress (shipped via open-PR body search; timeline/GraphQL not used).
- [x] Maintainer responsiveness features with uncertainty and fair exposure for small projects.
- [x] Confidence calibration; distinguish beginner interest vs demonstrated expertise.
- [x] Repository passports: contribution docs, AI assistance policies, CLA/license, setup difficulty.
- [x] Opt-in saving/sync of opportunities without collecting AI tokens (shipped as browser-local saving; no cross-device sync).
- [x] Rate budget and caching instrumentation; ETag support, backoff, status messages.

## Gate 2 — GitHub App and account layer

- [x] GitHub App registration and OAuth user-to-server callback with state param (PKCE not implemented — server-side flow; Worker deployed, login functional).
- [ ] Narrow read-only permissions; no write by default, short-lived tokens and user-revoke behavior.
- [ ] Signed cookie/session and durable user identity by GitHub numeric ID.
- [ ] Delete/export profile, privacy notice, data retention limits.
- [ ] Optional D1 for saved opportunities and preferences, only when free-tier economics confirmed.
- [ ] Protect API from quota abuse and cross-user leaking.

## Gate 3 — AI and MCP ecosystem

- [x] MCP v2 stdio smoke test suite (`npm run test:mcp`).
- [ ] Evaluate remote Streamable HTTP with OAuth.
- [ ] Latest stable Claude Code, Codex, OpenCode, Hermes integration tests across WSL2/Windows/Linux/macOS where supported.
- [x] Controlled Hermes memory-aware queries; source/consent, no bulk memory imports.
- [ ] Optional CodeRabbit local companion workflow; vendor pricing and terms.
- [x] Context-grounded Review Coach with file/line reference, reproducibility and editable drafts.
- [x] BYOK documentation and prompt token estimate (`docs/integrations/BYOK.md`).
- [ ] Host/provider BYOK policy UI and user cost guards.

## Gate 4 — Extension and contribution lifecycle

- [x] Manifest V3 browser extension scaffold with an issue-page badge (current capabilities: see `extension/README.md`).
- [ ] WXT browser extension displays match reasoning on GitHub pages.
- [x] Static cost-free deployment certification (`npm run verify:deploy`).
- [ ] Watchlist, stale issue detection, notifications, follow-up tracking.
- [ ] User-approved review/comment/PR APIs with fresh GitHub write permission grant.
- [ ] Track outcomes, improve ranking with explicit feedback and avoid popularity bias.
- [ ] Public beta security, privacy, scale and accessibility evaluations.

## Reviewable feature issues to create after publishing

1. `feat(search): improve issue search recall and repo enrichment`
2. `feat(passport): inspect CONTRIBUTING, license and AI policies`
3. `test(mcp): verify protocol compatibility across four clients`
4. `feat(auth): implement read-only GitHub App sign-in with deletion`
5. `feat(review): add diff-only Review Coach with human approval`
6. `feat(memory): Hermes consent and scoped preference injection`
7. `feat(cost): show AI usage estimates and external billing warnings`
8. `feat(extension): on-page opportunities with user opt-in`
9. `fix(a11y): audit keyboard, high contrast and reduced motion`
10. `chore(ops): stay within zero-paid hosting, document hard limits`

Suggested engineering sequence: API quality → passport → MCP client validation → auth → local review assistant → extension. No hosted inference before a measured cost ceiling.

After creating the public repository, preview the proposed issue titles with `bash scripts/seed-issues.sh`; use `bash scripts/seed-issues.sh --apply` to create them. The script does **not** create issues by default.
