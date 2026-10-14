# Contributing to Contributor

We welcome meaningful contributions from newcomers and experienced engineers. Contributor is especially interested in accessible discovery, transparent ranking, low-cost deployments, MCP interoperability and accurate community feedback.

## Before changing code

1. Search existing issues or open a concise bug/feature issue describing the behavior and acceptance criteria.
2. Read [product requirements](docs/product/PRD.md), [architecture](docs/architecture/SYSTEM.md), and [security](docs/engineering/SECURITY.md).
3. Create a feature branch; keep the change small. Run `npm run check` and relevant local tests.
4. Open a PR with linked issue, before/after summary, test evidence and any compatibility caveats.
5. Maintainers review before merge; no automated AI-written unsolicited PRs/reviews.

AI assistance is welcome if disclosed as needed by the repository's guidelines; responsibility for accuracy, licenses, tests and security remains with the human submitter. No executable setup scripts should download and execute unreviewed remote code.

## Local commands

```bash
node --version                 # Node 22+
npm run check                  # Node built-in unit tests + static web build
npm run preview                # localhost:4173
npm install                    # Only required for MCP dependencies
npm run mcp                    # MCP over stdio; expects a client, not interactive input
```

## Guardrails

- Never commit API keys or user AI provider credentials; `.env` is gitignored.
- Do not request additional GitHub permissions without a design/security review.
- Do not add unsolicited bot comments or auto-submit reviews.
- Match ranking assertions to actual evidence; no invented acceptance probabilities.
- Accessibility fixes require keyboard + responsive validation.
- Provider version support requires test logs, not assumptions.