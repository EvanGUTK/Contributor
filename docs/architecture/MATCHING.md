# Matching and opportunity discovery

## Goal

Rank *actual* public GitHub results for usefulness, interests and task suitability without fabricating “AI confidence” or maintainer acceptance probabilities. A ranking score is a heuristic relevance number, not a ground-truth likelihood.

## Inputs

- Language preferences (up to eight, optional).
- Interests/topics (120 characters, optional).
- Experience: beginner, intermediate or advanced.
- Time budget: 1–40 hours.
- Mode: all, repositories, issues or reviews.
- Future: saved/dismissed opportunities, demonstrated skills and direct preferences, scoped by consent.

## Pipeline

1. Sanitize user controls into allowed qualifiers; do not interpolate arbitrary GitHub search operators.
2. Run at most three parallel bounded GitHub search requests when mode is all; one request for a specific mode.
3. Normalize result types and link to repository metadata when available.
4. Score weighted factors: technology overlap (up to 35), interests (25), difficulty accessibility (20), freshness (12), basic maintainer state (7): maximum 99 (the code bounds to 100).
5. Generate reasons for match. Flag when repo metadata unavailable, and avoid “responsive maintainers” claims without measured signals.
6. Sort by relevance; show live URL and timestamp; ask user to inspect real repository policies before taking action.

## Current limitations

The first release deliberately uses a small number of GitHub queries. This may exclude helpful repositories that do not label issues “good first issue.” PR searches with `review:none` are *candidates*, not necessarily welcomed outside reviews. Search results can be incomplete or stale. The first language drives an API qualifier; other languages affect relevance but are not comprehensively searched. Topic word segmentation is naive; direct term matching can favor English text. No cross-lingual embeddings or calibrated learning is implemented.

## Improving responsibly

Add diverse query strategies with a per-user token budget; use repo health signals (last push, issue closure over windows, contributors guide) with uncertainty; track opportunity saves and voluntary dismissals; evaluate retrieval using labeled examples and recall@k, calibration and diversity metrics; do not rank solely by star count. Keep search costs bounded and show explanations.

## Acceptance tests

- Relevance score is deterministic with fixture timestamps/time control.
- Inferred preferences do not masquerade as ability estimates.
- User inputs cannot inject raw search qualifiers.
- Rate-limit and HTTP errors never create fake matches.
- Invalid GitHub URL is rejected for prompt handoff.
- Dead/archived or already assigned issues clearly show warnings before preparation.
