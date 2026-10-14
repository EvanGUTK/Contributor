# Optional CodeRabbit integration

## Role in Contributor

A code-review assistant must help users **understand and verify** changes, not mass-generate low-quality GitHub comments. The default Review Coach uses fetched PR metadata, diff excerpts and the user's own assistant. An optional local companion could check out a PR, run tests and call CodeRabbit CLI when the user already has a compatible entitlement.

## Constraints

- CodeRabbit free reviews for eligible public repositories where its GitHub/GitLab app is installed do **not** necessarily permit arbitrary PR review on any third-party repository via Contributor.
- There are paid CodeRabbit tiers; Contributor will not resell, force subscriptions or silently invoke charged review services.
- The local CodeRabbit invocation requires the user to install/authenticate and accept any vendor costs/terms. In a future local companion, show exact review scope/estimated cost before execution.
- A CodeRabbit warning is a **finding to investigate**, not proven exploitable code. PR draft comments need concrete line evidence and confirmation. Never auto-post.
- No CodeRabbit CLI review has been run by the current Contributor MVP or MCP server.

## Proposed review workflow

1. User selects a PR to inspect (Contributor discovers it first).
2. Verify maintainer contribution and AI review policies. Check existing review discussion.
3. Use a bounded checkout/worktree for the exact PR head/base revisions and ensure no arbitrary build scripts are run without user consent.
4. Run focused tests and optionally `coderabbit review --agent` in a supported authenticated local installation (confirm flags with current help).
5. Compare results with independent assistant/human analysis, reproduce actionable concerns and draft precise comments.
6. User explicitly reviews and authorizes any GitHub review submission. No unsolicited bot spam.

Vendor terms: https://www.coderabbit.ai/pricing and https://www.coderabbit.ai/FAQ
