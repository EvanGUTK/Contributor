# BYOK model integration and safety

BYOK = bring your own key / bring your own AI entitlement. Contributor's primary route is **MCP within an existing assistant**; Contributor does not receive model API keys. The user may already pay for their assistant, use free tiers or run local models. Contributor offers discovery and context for free.

## Mode 1 — Existing agent (current local design)

Claude/Codex/OpenCode/Hermes hosts Contributor MCP and makes its own model calls. The local MCP server uses only GitHub public endpoints, not model inference. AI model billing, availability and context window are outside Contributor's control.

### Which actions use AI

| Contributor action | AI call? | Notes |
|:--|:--|:--|
| Discovery, ranking, match reasons | None | Public GitHub data and deterministic local scoring |
| Copy AI prompt | None | Builds text locally and copies it to the clipboard |
| Contributor MCP tools | None | Read-only GitHub lookups on the user's machine |
| What the assistant does with the prompt or tool output | Yes, by the user's assistant | Billed by the user's provider, never by Contributor |

### How billing works

Contributor never proxies, resells or charges for AI. Your assistant talks to your provider with your credentials, and the provider bills you directly. Contributor has no access to your key, plan or usage.

### Soft cap and prompt-size estimate

The web app shows an estimated token count next to **Copy AI prompt** (`characters ÷ 4`, computed locally with no network request) so you can judge whether the prompt fits a budget you set yourself. This is an estimate for the generated prompt only; it excludes your assistant's system prompt, tool results, conversation history and the model's output.

**Contributor cannot enforce a billing cap on any external provider.** Configure hard limits and alerts in your provider's own console or assistant settings. The soft cap is a mental budget, not an enforced limit.

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
