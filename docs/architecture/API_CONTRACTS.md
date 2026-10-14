# API and MCP contracts

## GitHub REST integration (current)

- `GET /search/repositories?q=...&sort=updated&order=desc&per_page=N`
- `GET /search/issues?q=is:issue+is:open+label:...&...`
- `GET /search/issues?q=is:pr+is:open+review:none&...`
- `GET /repos/{owner}/{repo}`
- `GET /repos/{owner}/{repo}/issues/{number}`
- `GET /repos/{owner}/{repo}/pulls/{number}`
- `GET /repos/{owner}/{repo}/pulls/{number}/files?per_page=30`

All calls are **GET** and bounded, with GitHub REST version `2022-11-28`. User-supplied `owner`, `repo`, and `number` are validated; arbitrary URL proxy requests are not exposed.

## MCP v2 server tools (source implemented, live interoperability unverified)

| Tool | Input | Output | Side effects |
|:--|:--|:--|:--|
| `discover_opportunities` | languages/interests/level/hours/mode/limit | Actual ranked repo/issue/PR links | None |
| `find_review_requests` | preferences + limit | PR candidates and warnings | None |
| `inspect_repository` | owner, repo | Public metadata and caveats | None |
| `analyze_issue` | owner, repo, number, preferences | Public issue excerpt and handoff prompt | None |
| `analyze_pull_request` | owner, repo, number | Public PR/file diff summaries, truncation notice | None |
| `prepare_contribution` | GitHub URL + preferences | Approval-first prompt for user's AI | None |
| `get_contribution_status` | owner, repo, number | Current public issue/PR state | None |

The names `analyze_issue` and `analyze_pull_request` currently perform **factual retrieval and preparation, not paid AI inference or full repository analysis**. A connected assistant may use the retrieved context to reason further. Responses are bounded excerpts (not copies of entire repositories) to reduce cost and exposure.

## Error semantics

MCP error results include `isError:true` and a human-readable message, avoiding API token exposure. API clients report rate limits and request status without infinite automatic retry. A status-check tool does not establish review contribution authorship or accepted project impact.

## Planned remote API

Introduce versioned JSON/HTTP handlers only after remote identity, OAuth token scoping, anti-CSRF, CORS, quotas and rate limits are verified. The local stdio server is the reference use-case. No GitHub write API is in the current toolset.
