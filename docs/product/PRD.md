# Contributor — product requirements (PRD)

**Version:** 0.1 draft · **Owner:** Product Stakeholder · **Build lead:** Chief / engineering

## Mission

Make it easier to discover, understand and meaningfully contribute to open-source projects. GitHub search is powerful but requires users to know what to search for and how to judge whether a task is suitable. Contributor should do that legwork without replacing human judgment or spamming maintainers.

## Nonnegotiable product principles

1. **Discovery-first:** a user need not supply a GitHub URL. Ask about interests, actual skills, learning goals, time and desired activity; find real options.
2. **Zero subscription to use:** the core must remain free and open source. Never charge for finding public issues/repositories or MCP access to the user's model.
3. **BYOK-first:** AI explanations run through a client's existing model or user-authorized API key, not an opaque provider subscription. No hidden AI charges.
4. **Memory-aware with permission:** an assistant such as Hermes can use relevant memories already in its own environment. Contributor requests narrow authorized preferences; it doesn't harvest private memory files.
5. **Useful code reviews:** evaluate PRs through evidence, reproduction and existing maintainer rules. Prefer thoughtful comments, not automated review spam.
6. **Human owns public actions:** publishing reviews, PRs, issue comments or code changes requires explicit user approval.
7. **Honest ranking:** transparent heuristic signals, uncertainty and links to evidence; don't claim calibrated success probabilities without real outcome data.

## User personas

**Explorer:** interested in open source but doesn't know how to choose a project. Wants small tasks within a two-hour budget.

**Domain specialist:** knows Python/AI/robotics but is relatively new to maintainers' workflows. Wants projects matching topics and real contribution policies.

**Reviewer:** wants to develop code-review skills. Needs PRs appropriate for outside feedback, context and tests to investigate.

**AI power user:** already uses Hermes, Codex, Claude, or OpenCode. Wants Contributor as discoverable MCP tools and natural language recommendations without re-entering background.

**Maintainer:** does not want low-effort automated PRs, duplicate issue attempts or unsubstantiated AI review comments.

## Primary journeys

### Discover without a URL

1. Enter languages, topic interests, level, hours and mode in web or via MCP.
2. Search live repositories, issues and review opportunities with bounded GitHub API calls and caching.
3. Display ranked results with type, repo, last activity, explanation, uncertainty, and links.
4. Inspect a promising repository's contribution guidelines, issue status and linked PRs (passport milestone).
5. Save opportunity or continue with agent handoff; no public write occurs.

### AI-agent handoff

1. User chooses an opportunity (or asks assistant to pick several candidates).
2. Contributor produces issue/repo context and approval-first starting prompt.
3. Assistant independently reads repo policies and proposes a plan or review checklist.
4. User accepts/edit plan before agent modifies code or publishes.
5. Future: local companion runs targeted tests and CodeRabbit optionally.

### Memory-aware discovery

1. Hermes or another MCP host holds a previously approved preference context.
2. Host asks user if relevant preferences can be used for this Contributor search.
3. Host sends only language/topic/level/time preferences through typed MCP tool arguments.
4. Contributor ranks public GitHub results; it doesn't read or copy MEMORY.md/USER.md.
5. User can override any inferred preference; ability != interest.

## Functional requirements

| ID | Requirement | MVP / later | Acceptance |
|:--|:--|:--|:--|
| F-01 | Search repos without prior URL | MVP | Repo search returns real GitHub links or clear error |
| F-02 | Search open beginner-friendly issues | MVP | Read-only GitHub issue search |
| F-03 | Find PR candidates for review | MVP | GitHub PR results and warnings about external feedback |
| F-04 | Explain scoring | MVP | Match reasons and scoring breakdown in core; visible reasons in UI |
| F-05 | Copy contextual prompt | MVP | Prompt includes selected verified URL and approval gate |
| F-06 | MCP stdio tools | Alpha | Ten read-focused tools; live interoperability before release |
| F-07 | Repository passport | Phase 2 | License, CONTRIBUTING, AI rules, maintainer responsiveness signals |
| F-08 | Profile/memory opt-in | Phase 2 | Explicit scope and deletion; Hermes can send selected prefs today |
| F-09 | AI Review Coach | Phase 3 | PR diffs, anchored findings, negative-case tests; drafts only |
| F-10 | CodeRabbit adapter | Phase 3 | User-authorized local checkout/review; report provenance; optional |
| F-11 | GitHub App auth | Phase 2 | Fine-grained permissions, short-lived tokens, account deletion |
| F-12 | Browser extension | Phase 4 | GitHub issue/PR overlay, permission minimization |
| F-13 | Contribution tracking | Phase 4 | Verified issue/PR progression, saved opportunities, personal history |
| F-14 | Budget controls | Every phase | No platform subscriptions; token estimates before paid action |

## Out of scope for MVP

Autonomously creating issues/PRs or publishing review comments; private repository indexing; scraping session histories; mandatory hosted LLM inference; a paid subscription; blanket CodeRabbit access to third-party GitHub repositories; automated 24-hour crawling; guaranteed acceptance predictions.

## Nonfunctional requirements

- Fast static first load; helpful on mobile and keyboard.
- At least a clear distinction between unavailable, rate-limited and empty results.
- No login required to try discovery; privacy-focused data handling.
- GitHub API budgets, cached reads, no infinite pagination.
- Every MCP tool validates arguments and returns bounded data; no token leak in errors.
- Transparency about estimates and model/AI access.
- Tested latest stable MCP clients **at release time**; source inclusion alone is not compatibility proof.

## Release acceptance

A user can discover five plausible real opportunities without selecting a repo; understand why each matched; use a chosen opportunity to formulate a useful prompt for a connected assistant; and run the core web/MCP locally with no Contributor subscription. Security tests and published compatibility matrix are required before hosting remote auth.
