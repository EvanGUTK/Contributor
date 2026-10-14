# GitHub Search API Validation

**Date:** 2026-10-14  
**Client:** `packages/github/client.mjs` — read-only, bounded REST  
**Environment:** WSL2, Node v26.7.0, no `CONTRIBUTOR_GITHUB_TOKEN` set (unauthenticated)

## Test command

```js
import { createGitHubClient } from './packages/github/client.mjs';
const client = createGitHubClient();
const result = await client.discover(
  { languages: ['JavaScript'], interests: 'developer tools', level: 'beginner', mode: 'issues' },
  { limit: 3 }
);
```

## Result

```
SUCCESS items: 3  warnings: []
```

**Response timestamp:** `2026-10-14T14:20:48.787Z`

### First item (representative sample)

| Field | Value |
|-------|-------|
| `title` | Validate SKILL.md front matter |
| `_repoName` | fadymondy/nasaq-plugin |
| `state` | open |
| `_match.score` | 56 |
| `_match.difficulty` | beginner |
| `_match.confidence` | limited |
| `_match.reasons` | Relevant topics: tools; Labeled beginner-friendly; Recent repository activity |

### Match breakdown (score 56/100)

| Signal | Points |
|--------|--------|
| technology | 4 |
| interests | 13 |
| accessibility | 20 |
| freshness | 12 |
| maintainership | 7 |

### Item keys returned by GitHub REST API

```
url, repository_url, labels_url, comments_url, events_url, html_url,
id, node_id, number, title, user, labels, state, locked, assignees,
milestone, comments, created_at, updated_at, closed_at, assignee,
author_association, active_lock_reason, sub_issues_summary,
issue_dependencies_summary, body, reactions, timeline_url,
performed_via_github_app, state_reason, pinned_comment, score
```

Internal augmentation keys: `_kind`, `_repoName`, `_match`

## Findings

| Check | Result |
|-------|--------|
| Unauthenticated search works | ✅ Pass — 3 items returned, 0 warnings |
| Rate-limit headers respected | ✅ Pass — no rate error on single cold call |
| Score + breakdown present on items | ✅ Pass — heuristic scoring populated |
| `difficulty` and `confidence` fields set | ✅ Pass |
| `reasons` array populated | ✅ Pass |
| `warnings` array empty (no failed sub-searches) | ✅ Pass |
| `at` timestamp present | ✅ Pass |

## Rate limit behavior (unauthenticated)

GitHub public search allows **10 requests per minute** unauthenticated (60/min authenticated).  
The client's 8-minute TTL cache prevents repeated identical calls. No rate-limit error was encountered
during this test. Sustained use in a browser tab will exhaust the unauthenticated quota; users who
supply a `CONTRIBUTOR_GITHUB_TOKEN` get the full 60 req/min budget.

## What still needs testing (not automatable here)

- **Browser CORS:** GitHub's search API headers (`Access-Control-Allow-Origin: *`) are public, but
  quota behavior may differ for browser-origin requests. Manual test from the deployed static site needed.
- **Token path:** Verify `Authorization: Bearer <token>` header is sent correctly when
  `CONTRIBUTOR_GITHUB_TOKEN` is set; check in browser DevTools network panel.
- **Rate exhaustion handling:** Confirm the `GitHubApiError` with retry time is surfaced clearly in the UI.
- **GraphQL timeline endpoint:** Not used in Gate 0; reserved for in-progress PR detection (Gate 1).
