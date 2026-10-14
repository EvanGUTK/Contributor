# Optional CodeRabbit integration

## Role in Contributor

A code-review assistant must help users **understand and verify** changes, not mass-generate low-quality GitHub comments. The default Review Coach uses fetched PR metadata, diff excerpts and the user's own assistant. An optional local companion could check out a PR, run tests and call CodeRabbit CLI when the user already has a compatible entitlement.

> **Status: PLANNED, NOT BUILT.** This document is a planning record for [issue #9](https://github.com/EvanGUTK/Contributor/issues/9). Nothing described under "Proposed integration design" exists in the codebase. There is no `contributor review` command, and no CodeRabbit CLI review has been executed by Contributor.

## What the CodeRabbit CLI does

Based on the vendor's public CLI documentation (https://docs.coderabbit.ai/cli, reviewed 2026-10-14; re-verify before building):

- The CLI (`coderabbit`, short alias `cr`) reviews Git changes in a **local repository** with CodeRabbit's review engine and prints findings (for example race conditions, memory leaks, security issues) with fix guidance. The user reads the findings and decides what, if anything, to act on or post.
- Scope flags select what is reviewed (`--committed`, `--uncommitted`, `--include-untracked`) and `--base <branch>` sets the comparison base.
- `--agent` emits NDJSON intended for coding-agent integrations. Plain text is the default output.
- It requires a **CodeRabbit account**: browser login with `cr auth login` (US by default, `--region eu` available) or an Agentic API key via `--api-key`. `cr doctor` checks the local setup.
- It needs network access to CodeRabbit's backend. The docs do not fully enumerate what local review data is transmitted; reviewing committed changes reads file content from the Git snapshot, so assume diff and file content leave the machine and are processed by the vendor. This must be disclosed to the user before any run.
- The CLI also has a `--remote owner/repo` mode that reviews a GitHub repository server-side without a local checkout. **Contributor will not use it** (see design rules below).
- Flag names and versions change between releases (for example `--remote` and `--deep` are documented only for recent CLI versions). Always confirm against the installed `coderabbit --help`.

## Cost and entitlement

Figures below are from the vendor's pricing page and CLI docs as read on 2026-10-14. Third-party aggregator sites disagree on plan names, prices and limits, so treat the vendor pages as the only authority and re-check them before shipping anything.

- **Account is mandatory.** Even the free tier requires signing in. The user owns the account; Contributor never provides, shares or pools an account, API key or credits.
- **Free tier:** the CLI docs describe a free tier with basic analysis and "limited daily usage". Exact numbers are not in the docs; the vendor points to its plans page. Free users may be shown a paid-trial prompt at the limit.
- **Public repositories:** the vendor FAQ says reviews on public repositories are free once CodeRabbit is installed on the repository. That is the *repository-installed PR bot* entitlement. The pricing page does not state that it extends to CLI reviews of arbitrary third-party PRs, so Contributor must not assume it does.
- **Private repositories:** no free tier is listed; they fall under paid plans. At the time of review the pricing page listed per-developer paid plans (roughly $24 to $72 per developer per month on annual billing, plus custom Enterprise) with hourly review allowances, and a usage-based option of about $0.25 per reviewed file beyond the allowance, subject to an admin-set cap.
- **Over-limit charges:** the CLI can continue over-limit reviews for billed usage (`--use-credits` confirms a paid review). Contributor must never pass this flag on the user's behalf.
- **Contributor's own cost:** $0, consistent with [COSTS_AND_BYOK.md](../product/COSTS_AND_BYOK.md). Contributor does not resell, mark up or force a subscription.

## Required permissions

- A **local Git checkout** of the PR head and base revisions that the user has made or explicitly approved. Local reviews require a Git repository.
- **Read access to the checked-out files** on the local filesystem.
- A **CodeRabbit login** (or API key) for the user's own account.
- Outbound network access to CodeRabbit.
- **No GitHub write permission** is needed to run a review. Contributor's GitHub access for this flow is read-only (fetching PR metadata and refs); posting any comment is a separate, user-approved action that the CodeRabbit step never performs.
- No build scripts, tests or package installs from the PR are executed as part of the CodeRabbit step.

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

## Proposed integration design (PLANNED, NOT BUILT)

Everything in this section is a design proposal. None of it is implemented or validated.

1. The user runs `contributor review --pr <url>` (command name is a proposal; it does not exist today).
2. Contributor checks that CodeRabbit is opt-in enabled and that the user is already authenticated (`cr doctor` / auth status). It never logs in on the user's behalf.
3. Contributor shows a **consent screen** before anything leaves the machine: the PR, the exact scope (base and head revisions, file count), that diff and file content will be sent to CodeRabbit, which account will be used, and the free-tier or billing implications. The user must confirm.
4. Contributor checks out the PR head into a **temporary worktree** (read-only fetch of the PR ref; no scripts executed) and keeps the user's working tree untouched.
5. Contributor runs the CLI against that worktree, for example `coderabbit review --agent --base <base>` (flags to be confirmed against current help), without `--remote` and without `--use-credits`.
6. Contributor captures the output, parses it, and returns the findings to the user as **unverified leads** with file and line references. Nothing is posted.
7. Contributor removes the temporary worktree. Raw output is stored locally only if the user opts in.
8. If the user wants to comment on the PR, Contributor drafts comments that need concrete line evidence, and the user explicitly approves each one before any GitHub write happens. This step is shared with the default Review Coach and is independent of CodeRabbit.

Design rules:

- Contributor never runs CodeRabbit on a repository the user has not checked out themselves or explicitly approved checking out in step 3.
- Contributor never uses CodeRabbit's remote-review mode, never shares an account and never spends the user's credits without their confirmation.
- A non-zero exit, a rate-limit message or a missing login is reported as-is; Contributor does not retry in loops or fall back silently to another paid service.
- Output is treated as untrusted text and is not executed or auto-applied.

## What must happen before this can be built

- [ ] **CLI interface stability:** confirm the flag set and `--agent` NDJSON schema are documented and versioned, and decide a minimum supported CLI version. Today the docs show flags being added across point releases.
- [ ] **Pricing and terms review:** read the current vendor terms and privacy policy, confirm that using the CLI on third-party public PRs is permitted on each plan, and confirm what data is transmitted and retained. Re-verify the free-tier limits, which the docs do not state numerically.
- [ ] **Consent flow design:** specify the exact consent text, per-run versus remembered consent, how cost and data disclosure are shown in the CLI, MCP and extension surfaces, and how an unattended assistant call is prevented from bypassing consent.
- [ ] **Safe checkout design:** define the temporary-worktree lifecycle, cleanup on failure, and handling of submodules, hooks and untrusted repository config.
- [ ] **Execution evidence:** run the integration end to end with a real user account before any documentation claims it works. Until then it stays "planned".

Vendor terms: https://www.coderabbit.ai/pricing and https://www.coderabbit.ai/FAQ. CLI docs: https://docs.coderabbit.ai/cli
