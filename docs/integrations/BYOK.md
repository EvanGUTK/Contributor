# BYOK model integration and safety

BYOK = bring your own key / bring your own AI entitlement. Contributor's primary route is **MCP within an existing assistant**; Contributor does not receive model API keys. The user may already pay for their assistant, use free tiers or run local models. Contributor offers discovery and context for free.

## Mode 1 — Existing agent (current local design)

Claude/Codex/OpenCode/Hermes hosts Contributor MCP and makes its own model calls. The local MCP server uses only GitHub public endpoints, not model inference. AI model billing, availability and context window are outside Contributor's control.

## Mode 2 — Web AI Coach (planned)

Don't send private model keys to a shared server or browser localStorage without a reviewed secret handling model. Possible methods: local companion process with OS credential store, user-hosted adapter, provider OAuth where supported, or short-lived scoped BYOK sessions after explicit opt-in. Each option requires a security and licensing review.

## Budget UX requirements

- Model/provider shown before call, plus input/output token assumptions, cost estimate, and meaningful uncertainty.
- AI OFF by default, no background expensive calls.
- User-set per-day/per-month soft thresholds, and visible pause/cancel; tell users that external provider billing limits are separate and may still incur charges.
- Pay attention to local CodeRabbit or provider agent tools that may create additional billable requests.
- No mandatory subscription or Creator-funded model account.

## Provider independence

MCP uses a standardized tool interface; avoid custom client-specific APIs where a compatible protocol exists. Maintain a tested client/version matrix rather than a blanket promise that “every MCP host works”. Support local stdio first because it has no hosted API costs. Add remote Streamable HTTP only with authentication, audience validation, tools scopes, quotas and cost safeguards.
