# ADR-002: Local MCP v2 before hosted remote MCP

**Status:** Accepted for alpha · **Date:** 2026-10-14

## Context

Users want Contributor discoverable from Claude Code, Codex, OpenCode, Hermes and future MCP clients. Cross-client support is a product requirement. Hosting remote MCP adds OAuth, quotas, identity and costs.

## Decision

Implement a Node.js stdio server with `@modelcontextprotocol/server` v2 and Zod. Expose read-only tools centered on `discover_opportunities`. The client owns its AI model and, for Hermes, any personal memory. Contributor only receives narrow search preferences. Provider adapters and a versioned QA matrix document actual tested support.

## Consequences

Local setup requires Node and npm packages. Remote Streamable HTTP is a separate release gate with authentication and tools scopes. Exact vendor versions are tested as part of release certification; never claim success solely from this source existing.
