# Cost and BYOK policy

## Product promise

**Contributor costs $0 to use.** Discovery, public GitHub ranking, read-only MCP and local scripts do not require our paid plan. An AI account/model selected by a user is **separate** from Contributor; the user pays that provider only if their account/API usage incurs charges. We aim for **$0–$10/month user-selected AI spend**, but cannot override billing limits imposed by another company.

## Operating-cost strategy

- Host static assets on Cloudflare Pages or GitHub Pages free subdomain. Static Page asset requests are currently free/unlimited within Cloudflare's applicable terms.
- Run read-only public GitHub search in the browser directly at first, and local stdio MCP in each user's machine. **This has no app-owned backend inference load.**
- Rate limit/caching done in client; no costly full GitHub crawl or cross-user crawling database. Let GitHub surface its API limits.
- Defer GitHub App server callback, hosted HTTP MCP, D1 and background queue until needed. If introduced, use Workers Free with hard spending alert/limits and kill switches.
- **Never silently upgrade** to a paid Cloudflare plan or route unlimited AI calls to an owner-funded key.
- CodeRabbit remains an opt-in local companion/partner; free public-repo review terms do not mean arbitrary third-party review access.
- The project domain can be a free `.pages.dev` subdomain initially; custom domain is optional, separately budgeted.

## Illustrative budgets — NOT financial guarantees

| Mode | Contributor subscription | Owner-hosted compute | External AI cost |
|:--|:--|:--|:--|
| Static discovery website | $0 | $0 target | $0 |
| Local stdio MCP + user's assistant | $0 | $0 | Existing model entitlement / BYOK provider charges |
| Local CodeRabbit companion | $0 Contributor fee | $0 | User's own CodeRabbit entitlement may cost more |
| Optional hosted MCP (future) | $0 planned | $0 free-tier target | User's model |

Cloudflare Pages static requests are listed as free, while Worker functions consume shared free-tier quota, currently 100k/day. Limits and prices change; reevaluate during deployment. If demand forces paid backend hosting, reduce or pause features before automatically incurring charges. Links: https://developers.cloudflare.com/pages/functions/pricing/ and https://www.cloudflare.com/plans/developer-platform/.

## BYOK modes

1. **No AI:** discovery + ranking + public GitHub links work anonymously.
2. **Connected assistant (preferred):** Claude, Codex, OpenCode or Hermes invoke Contributor MCP; that host owns the model credentials and charges. We see only typed requests, not raw keys.
3. **Local self-managed inference:** users may choose a local Ollama or equivalent model through their agent runtime (future native adapter); avoid claiming compatibility until tested.
4. **Hosted built-in AI (later):** require an explicit user-managed provider key or their authorized OAuth/compute connection, with no key in browser localStorage, short-lived secure execution context and per-operation estimate. Design subject to provider terms.

## Prevent runaway spend

- Default to no AI calls in repository search and ranking. Only user-requested deep analysis can consume tokens.
- Present an estimated token/cost range and provider/selected model before expensive analysis.
- Provide request-based soft caps: per prompt, per day, per month; stop additional actions on ceiling, when supported by host. Do not falsely claim an external hard billing cap.
- Disable background inference; restrict PR analysis to diff page budgets, not entire trees by default.
- Surface actual provider usage when available, otherwise mark estimates as estimates.
- For CodeRabbit paid plans, disclose current pricing and use the user's subscription without marking up charges.

## First release budget gate

**Founder out-of-pocket infrastructure: target $0.** No paid API keys, workers, domain or required premium licenses. If deployment cannot remain on the free tier, ship self-hostable open-source binaries and static app while investigating funding. User cost from external providers remains their own voluntary choice.
