# Release-readiness checklist

## Pre-publication

- [x] MIT LICENSE included and public repository intended.
- [x] No real API credentials or auth files in source.
- [x] Zero-dependency static discovery app and bounded read-only GitHub client.
- [x] Local deterministic core tests.
- [x] Alpha limitations and cost policy documented.
- [ ] Publish public GitHub remote via guarded `scripts/publish-github.sh`.

## Before calling MCP stable

- [ ] `npm install` on clean Linux, macOS and Windows/WSL environments.
- [ ] Inspector handshake, tool discovery and actual tool calls.
- [ ] Claude Code latest stable tool registration/functionality.
- [ ] Codex latest stable tool registration/functionality.
- [ ] OpenCode latest stable tool registration/functionality.
- [ ] Hermes Agent latest stable tool registration/functionality and memory consent test.
- [ ] Document version/date and platform in a compatibility matrix.

## Before hosted public beta

- [ ] Live GitHub REST/CORS search validation with quotas and fallback handling.
- [ ] Browser keyboard, high-contrast, screen reader and mobile checks.
- [ ] Manual link and image checks for GitHub README rendering.
- [ ] Cloudflare or GitHub Pages deployment under no-cost tier; no billable Worker by default.
- [ ] Versioned privacy policy and explicit local preferences deletion UI.
- [ ] Community testing and incident reporting.
- [ ] Maintain a clear planned/implemented boundary for CodeRabbit, OAuth, remote MCP and AI Review Coach.
