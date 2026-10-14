# Quality and verification plan

## Available tests

Run `npm run test` (Node built-in test runner). Fixtures check normalization, explainable matching, issue URL provenance, prompt approval gates, safe search query construction, bounded read-only GitHub requests and rate-limit errors. `npm run build` assembles static assets and code modules with zero third-party install dependencies.

**Not currently verified:** browser integration with live GitHub search, MCP v2 handshake, Cloudflare deployment, CodeRabbit, OAuth, Hermes memory interaction and latest clients. Recording plans in this file is not test execution.

## Next local gates

1. **Node runtime:** install npm dependencies, run `node --check` on MCP and use MCP Inspector to invoke all ten tools.
2. **Web browser:** validate load, form, keyboard-only navigation, screen reader labels, error handling, fake network responses, responsive layout and clipboard API over HTTPS/localhost.
3. **Live API:** probe search queries and quotas with real GitHub data; verify actual Repo/Issue/PR grouping, CORS, PR review filters and rate-limit displays.
4. **MCP clients:** exercise latest stable Claude Code, Codex, OpenCode and Hermes; capture exact versions/OS and protocol negotiation logs without credentials.
5. **Matching:** create labeled examples to calibrate ranking; report metrics and bias not just scores.
6. **CodeRabbit/local PR:** only when optional local companion is implemented; never execute untrusted code without sandboxing.
7. **Performance/cost:** static website size/requests, API requests/user session, 95th percentile latency; zero billed Owner-hosted services.

## Required evidence for an issue/PR

Problem, reproduction or acceptance criteria, exact commit SHA, tests run with exit codes, manual checks, screenshots from actual builds (labeled), unresolved limitations and protected-action approvals where relevant. Do not mistake a mock success for a live provider integration success.
