# ADR-001: Static/free discovery first, hosted services later

**Status:** Accepted for alpha · **Date:** 2026-10-14

## Context

The stakeholder requires a free, public open-source product with a founder infrastructure goal of $0/month and no mandatory user subscriptions. GitHub public search already supplies the essential opportunity data.

## Decision

Ship a static discovery app with client-side public GitHub REST calls and a local stdio MCP server. Use deterministic matching with no model inference. Include clearly labeled planned server/auth/AI features, but don't host them until user demand and cost limits justify it. Keep a $0 static hosting deploy path. Provide BYOK via the user's existing MCP assistant; CodeRabbit optional.

## Alternatives rejected for alpha

- Mandatory hosted LLM: recurring inference expense, privacy/legal burden and BYOK conflicts.
- Always-on Postgres/Kubernetes: unnecessary cost and operations.
- User PAT in browser localStorage: credential security hazard.
- Scrape entire GitHub: API quotas, maintenance and abuse risk.
- Browser extension first: onboarding complexity without proving discovery.

## Consequences

Anonymous search rate limits; limited persistence; some features deferred. A static site cannot securely implement broad GitHub App OAuth alone. Reconsider after verified user interest and privacy design.
