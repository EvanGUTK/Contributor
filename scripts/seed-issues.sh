#!/usr/bin/env bash
# Preview suggested GitHub issues by default. --apply intentionally writes.
set -euo pipefail
REPO="${CONTRIBUTOR_GITHUB_OWNER:-EvanGUTK}/${CONTRIBUTOR_GITHUB_REPO:-contributor}"
MODE="${1:-preview}"
if [[ "$MODE" != "preview" && "$MODE" != "--apply" ]]; then echo 'Usage: bash scripts/seed-issues.sh [--apply]' >&2; exit 2; fi
command -v gh >/dev/null || { echo 'GitHub CLI is required'; exit 1; }
gh repo view "$REPO" >/dev/null || { echo "Cannot access $REPO" >&2; exit 1; }
while IFS='|' read -r title body; do
  [[ -z "$title" ]] && continue
  if [[ "$MODE" != "--apply" ]]; then echo "PREVIEW: $title"; continue; fi
  if [[ -n "$(gh issue list --repo "$REPO" --state all --search "in:title \"$title\"" --json title --jq '.[].title' | grep -Fx "$title" || true)" ]]; then
    echo "EXISTS: $title"; continue
  fi
  gh issue create --repo "$REPO" --title "$title" --body "$body" >/dev/null
  echo "CREATED: $title"
done <<'ISSUES'
Improve GitHub discovery query diversity|Expand beyond good first issue labels, limit API calls, calibrate search recall with reproducible fixtures.
Build Repository Passport|Show contribution instructions, license, maintainer activity, issue staleness, AI policies and truthful uncertainty.
Validate MCP v2 with four current stable clients|Capture live handshake and discovery calls for Claude Code, Codex, OpenCode and Hermes including WSL path diagnostics.
Add Hermes consent-based memory handoff|Let Hermes supply narrow relevant preferences without raw memory file imports; support override and privacy tests.
Design GitHub App read-only login|Implement PKCE/state, short-lived scoped user tokens, saved opportunities and account deletion without browser PAT persistence.
Implement evidence-based Review Coach|Use PR diff context and user’s AI; draft verifiable comments but never auto-post to maintainers.
Plan optional local CodeRabbit companion|Check licensing, user entitlement, safe worktree checkout and explicit cost approvals before invoking CLI.
Document BYOK usage and spend limits|Show model choice, estimated calls, external billing disclaimer and user-configured soft caps for deep analysis.
Design accessible GitHub browser extension|Explore WXT page overlays and safe permission scopes only after web discovery proves useful.
Certify static cost-free deployment|Validate free hosting, quotas, rate-limit behavior and no mandatory owner-funded inference.
ISSUES
