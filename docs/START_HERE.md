# Contributor — documentation map

**Read in order:** [Product specification](product/PRD.md) → [Decisions](decisions/ADR-001-FREE-FIRST.md) → [Architecture](architecture/SYSTEM.md) → [Roadmap](product/ROADMAP.md).

## Product

- [Product requirements / PRD](product/PRD.md): personas, journeys, requirements, acceptance criteria, exclusions
- [Feature backlog](product/ROADMAP.md): milestones, dependencies, release gates, issue seeds
- [Cost and BYOK](product/COSTS_AND_BYOK.md): $0-hosting and no-subscription constraints, provider spend limits
- [Matching design](architecture/MATCHING.md): GitHub discovery, transparent scoring, calibration and API quota

## Engineering

- [System design](architecture/SYSTEM.md): boundary and data-flow architecture
- [API & contracts](architecture/API_CONTRACTS.md): external queries, MCP tool contracts, state, error conditions
- [Security](engineering/SECURITY.md): permission scope, cross-origin auth, prompt injection, privacy, abuse
- [Quality](engineering/TESTING.md): unit, integration, contract, client and accessibility gates
- [Accessibility](engineering/ACCESSIBILITY.md): keyboard, contrast, mobile and assistive design

## Integrations

- [MCP Clients](integrations/MCP_CLIENTS.md): Claude, Codex, OpenCode and Hermes setup + verification requirements
- [Hermes memory](integrations/HERMES_MEMORY.md): personalization without copying complete memory stores
- [CodeRabbit](integrations/CODERABBIT.md): opt-in local review, pricing concerns and limitations
- [BYOK providers](integrations/BYOK.md): in-agent BYOK, key isolation, budget UX

## Research

- [Competitors](research/COMPETITIVE_LANDSCAPE.md): who solves what already
- [Primary source register](research/SOURCES.md): versioned documentation and dated cost claims
- [Architecture decisions](decisions/): why we picked a zero-cost static first release

> Documentation reflects an **early alpha**; decisions are subject to field tests. Unsupported functionality is described as planned rather than current.
