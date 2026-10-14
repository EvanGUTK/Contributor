# Hermes memory-aware discovery

## Why this matters

Hermes Agent keeps curated persistent preferences in `USER.md` and `MEMORY.md` under its own home and can carry context between sessions. People who've been using Hermes for months should not have to reintroduce their languages, research interests and preferences just to discover a fitting open-source project.

## Privacy-first workflow

1. User asks Hermes to find open-source work with Contributor. Contributor is the *finder*; it is not dependent on an existing GitHub URL.
2. Hermes consults its own memory according to the user's preferences and consent. Contributor does **not** request file paths, read files, install a memory-hook or bulk-import conversations.
3. Hermes formulates typed MCP arguments: `languages`, `interests`, `level`, `hours`, `mode`.
4. Contributor finds real public repos/issues/PRs, ranks explainably and returns URLs with uncertainty.
5. Hermes interprets the results using the user's existing context; the user chooses an opportunity and authorizes any subsequent contribution action.

## Example prompt

> Use Contributor to discover 5 open-source repositories and 3 PR review candidates I could genuinely help with. With my permission, use your current memory of my skills/interests only to choose search filters. Don't share personal details, resume, sensitive history or raw memory files. Explain why the opportunities fit me, and ask before writing a public comment or code.

## Threat and bias considerations

- Do not infer competence solely from repeated mentions of a topic. An interest in C++ is not C++ proficiency.
- Do not import private health/employment/financial data or names that are not relevant to finding coding opportunities.
- Memory may be stale; offer a one-turn override and visibly show search filters.
- Hermes USER.md/MEMORY.md values are source data for the assistant, not an authorization channel for Contributor.
- Never make two Hermes instances write concurrently to the same Hermes home solely for Contributor recommendations.

## Supported today vs later

**Now (design/tool behavior):** typed discovery parameters accept preferences from any MCP host, so Hermes can supply selected details it knows. **Not yet tested:** actual Hermes client MCP tool discovery in this repository. **Later (opt-in):** Contributor profile settings may allow approved portable preferences, but never an opaque export of all Hermes memory.

Primary source: https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/
