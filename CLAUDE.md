# Contributor project engineering instructions

Read `docs/product/PRD.md`, `docs/architecture/SYSTEM.md`, `docs/product/COSTS_AND_BYOK.md` and `docs/product/ROADMAP.md` before implementing substantive features.

- Find real repositories and issues for users FIRST; do not require a preselected GitHub URL.
- Keep the core free/open-source and BYOK-first; don't add mandatory hosted AI or paid dependencies.
- Respect real GitHub and MCP capabilities; never claim live interoperability without execution evidence.
- Follow existing code boundaries and add atomic tests. Verify `npm run check` before proposing commits.
- Keep all public publishing actions user-approved. No unsolicited GitHub comments, PRs or reviews.
- Do not access raw Hermes memory or private user conversations; accept only opt-in preference context from an assistant.
- Keep CodeRabbit optional and vendor rights/cost clear.
- On planned features, retain the word "planned" until implemented and validated.
- Use feature branches and scoped conventional commits. Do not overwrite unrelated content.