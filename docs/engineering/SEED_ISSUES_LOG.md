# Seed Issues Log

**Date:** 2026-10-14  
**Command:** `bash scripts/seed-issues.sh --apply`  
**Repo:** EvanGUTK/contributor

## Output

```
CREATED: Improve GitHub discovery query diversity
CREATED: Build Repository Passport
CREATED: Validate MCP v2 with four current stable clients
CREATED: Add Hermes consent-based memory handoff
CREATED: Design GitHub App read-only login
CREATED: Implement evidence-based Review Coach
CREATED: Plan optional local CodeRabbit companion
CREATED: Document BYOK usage and spend limits
CREATED: Design accessible GitHub browser extension
CREATED: Certify static cost-free deployment
```

**Result:** 10 / 10 issues created successfully. Exit code: 0.

## Issues created

These correspond to the "Reviewable feature issues" section of `docs/product/ROADMAP.md`:

| # | Title | Roadmap item |
|---|-------|--------------|
| 1 | Improve GitHub discovery query diversity | `feat(search)` |
| 2 | Build Repository Passport | `feat(passport)` |
| 3 | Validate MCP v2 with four current stable clients | `test(mcp)` |
| 4 | Add Hermes consent-based memory handoff | `feat(memory)` |
| 5 | Design GitHub App read-only login | `feat(auth)` |
| 6 | Implement evidence-based Review Coach | `feat(review)` |
| 7 | Plan optional local CodeRabbit companion | `chore(review)` |
| 8 | Document BYOK usage and spend limits | `feat(cost)` |
| 9 | Design accessible GitHub browser extension | `feat(extension)` |
| 10 | Certify static cost-free deployment | `chore(ops)` |

## Script behavior notes

- The script checks for existing issues (`gh issue list --search "in:title"`) before creating.
  Re-running with `--apply` is safe — issues that already exist are logged as `EXISTS:` and skipped.
- Default mode (no argument) prints `PREVIEW:` lines only; `--apply` is required to write.
- `gh repo view` is checked first; the script aborts cleanly if the repo is inaccessible.
