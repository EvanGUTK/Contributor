<div align="center">
  <img src="assets/contributor-banner.svg" alt="Contributor — Discover. Understand. Contribute." width="100%" />
  <h1>Contributor</h1>
  <p><strong>Find your place in open source.</strong></p>
  <p>Discover meaningful GitHub issues, repositories, and pull requests worth reviewing — with transparent matching and optional AI-agent assistance.</p>
  <p>
    <img src="https://img.shields.io/badge/STATUS-EARLY_ALPHA-153b30?style=for-the-badge&labelColor=081b19" alt="Early alpha" />
    <img src="https://img.shields.io/badge/CORE-FREE_FOREVER-2b7f5b?style=for-the-badge&labelColor=081b19" alt="Free core" />
    <img src="https://img.shields.io/badge/AI-BYOK%20%7C%20OPTIONAL-496c9b?style=for-the-badge&labelColor=081b19" alt="Optional BYOK AI" />
    <img src="https://img.shields.io/badge/MCP-V2_2026--07--28-6655a1?style=for-the-badge&labelColor=081b19" alt="MCP v2 target" />
    <img src="https://img.shields.io/badge/LICENSE-MIT-74ad83?style=for-the-badge&labelColor=081b19" alt="MIT license" />
  </p>
  <p>
    <a href="#-try-the-discovery-mvp">Try the MVP</a> ·
    <a href="#-how-it-works">How it works</a> ·
    <a href="#-mcp-and-your-ai-agent">MCP setup</a> ·
    <a href="#-zero-subscription-economics">Cost</a> ·
    <a href="docs/START_HERE.md">All docs</a>
  </p>
</div>

---

> [!IMPORTANT]
> **Current state:** Working static discovery prototype and tested ranking/GitHub request logic. A seven-tool local **MCP server source** is included, using the current TypeScript SDK v2 package, but dependencies and live MCP client compatibility have not been verified in this environment. Hosted login, CodeRabbit automation, persistent accounts, and the browser extension are *planned*, not shipped. No demo result cards are fabricated.

## ✦ The idea

Finding a good repository is harder than writing your first line of code. A search for `good first issue` still leaves you evaluating unfamiliar codebases, abandoned issues, contributor policies, and whether your skills fit.

**Contributor lifts that burden.** Tell it what you know, want to learn, or enjoy doing. It searches GitHub for actual opportunities and provides evidence-backed matches. You decide what to pursue. Your assistant can then help you understand the repository, draft a plan or conduct a careful review.

| Feature | Why it matters | Current status |
|:---|:---|:---|
| **Opportunity Discovery** | Find repositories, issues and review opportunities without a starting URL | **Prototype** |
| **Explainable Matching** | Relevance reasons and transparent heuristic scoring | **Prototype** |
| **AI Handoff Prompts** | Contextual prompt for your chosen GitHub opportunity | **Prototype** |
| **Contributor MCP** | Ask Claude, Codex, OpenCode or Hermes to discover for you | **Source; validation pending** |
| **Hermes Memory-Aware Search** | Assistant supplies approved relevant preferences, without copying memory files | **Supported by tool arguments; workflow testing pending** |
| **AI Review Coach** | Evidence-based diff/PR assistance, drafts only | **Planned** |
| **CodeRabbit Adapter** | Optional local review evidence for checked-out PRs | **Planned** |
| **Contribution Passport** | Maintainer responsiveness, guidelines, license and task readiness | **Planned** |
| **Browser Extension** | Get recommendations directly in GitHub pages | **Planned** |

## ◈ Try the discovery MVP

**Requirements:** Node.js 22+ for the local build and preview. No API key, database, or subscription needed for the web prototype.

```bash
git clone https://github.com/EvanGUTK/contributor.git
cd contributor
npm run build
npm run preview
```

Open **http://127.0.0.1:4173/**. Choose your interests, language, experience, time budget, and whether you prefer issues, repositories or code reviews. Results are fetched live from GitHub’s public API. Anonymous GitHub search is rate-limited, so this is a beta discovery experience—not an unrestricted crawler.

`npm run test` executes the dependency-free matching/API unit tests. `npm install` is **not required** to build or preview the static web app; it **is required** before running the MCP server.

## ⌁ How it works

```mermaid
flowchart TD
  YOU["User or AI assistant<br/>preferences + goals"] --> DISC["Contributor Discovery<br/>GitHub search + transparent ranking"]
  DISC --> PICKS["Real repositories / issues / PRs<br/>links + evidence + uncertainty"]
  PICKS --> CHOICE{"Choose a contribution"}
  CHOICE -->|"Issue / Repository"| PREP["Contribution Passport + scoped starting prompt"]
  CHOICE -->|"Pull request"| REVIEW["Review Coach + testable concerns"]
  PREP --> AGENT["Your AI agent via MCP / copy-paste<br/>Claude · Codex · OpenCode · Hermes"]
  REVIEW --> AGENT
  AGENT --> HUMAN["Human approves plans and public actions"]
  HUMAN --> GITHUB["GitHub issue / comment / PR / review"]
  classDef node fill:#123e2f,stroke:#77e0a8,color:#f3fff6
  classDef gate fill:#342d1a,stroke:#e1bd74,color:#fff
  class DISC,PICKS,PREP,REVIEW,AGENT node
  class CHOICE,HUMAN gate
```

**Discovery comes first.** The MCP entry point is `discover_opportunities`. Users do not need to select an issue or repository first. The tool also supports the user's existing assistant context: if Hermes knows they like computer vision or are learning C++, it can send just those **user-approved** preferences as arguments—not their complete personal memory.

### What a user can ask

> “Find five active open-source Python projects with good issues for an intermediate engineer who enjoys computer vision. I have about four hours this weekend.”

> “Show me unreviewed PRs in developer tools where a careful external review could help, and tell me what I should examine before commenting.”

> “Hermes, use what you know about my interests—with my permission—to find GitHub projects I'd actually enjoy. Don't post anything without asking.”

## ⌘ MCP and your AI agent

This repository includes a **local stdio MCP server** exposing seven read-focused tools:

`discover_opportunities` · `find_review_requests` · `inspect_repository` · `analyze_issue` · `analyze_pull_request` · `prepare_contribution` · `get_contribution_status`

```bash
npm install
npm run mcp
```

The command waits for MCP JSON-RPC messages on **stdio**; it is not an interactive terminal application. For provider-specific registration and Hermes memory handoff, read **[MCP client setup](docs/integrations/MCP_CLIENTS.md)**. The v2 server package is used instead of the retired v1 all-in-one SDK. Current/latest stable client support must be confirmed through a compatibility test matrix before release.

> [!NOTE]
> MCP uses the **AI model already connected to your assistant**. Contributor doesn't need your Claude/Codex/Hermes model API key. An optional GitHub token can raise public search limits for the local MCP server, but leave it unset if you want entirely anonymous discovery.

## ◇ Zero-subscription economics

| Item | What users pay | What the project pays at MVP |
|:--|:--|:--|
| Static web discovery | **$0** | **$0 goal** on free static hosting |
| GitHub public search | **$0** (rate-limited) | **$0** |
| Local MCP | **$0** Contributor fee | **$0** |
| AI assistant | **BYOK**, optional; existing provider may charge | **$0** model inference |
| CodeRabbit | Optional, dependent on user's own eligibility / plan | **$0** when not integrated |
| Domain | Free hosted subdomain | **$0** |

**Our cost policy:** no Contributor subscription; never proxy or mark up users' AI tokens. We target **$0 for hosting** during the first release and **no more than $10/month in voluntary AI spend** for cost-conscious users. The $10 is a *user budget goal*, not a guaranteed vendor billing cap—external providers control actual charges. We will show provider estimates, warn about expensive work, and require user confirmation where feasible. See [Costs & BYOK](docs/product/COSTS_AND_BYOK.md).

## ⟡ Technical foundation

| Layer | Current design |
|:---|:---|
| Web MVP | Static HTML/CSS/ES modules, zero dependency build and deploy |
| Core ranking | Deterministic JavaScript with scored factors and explanations |
| Discovery data | Read-only GitHub REST search; bounded requests; short-lived cache |
| MCP | Node.js + `@modelcontextprotocol/server` v2 + Zod |
| Authentication | Anonymous MVP; GitHub App fine-grained OAuth planned |
| Production UI | React + TypeScript planned after MVP validation |
| Optional companion | Local Git worktrees, CodeRabbit CLI, targeted tests (later) |
| Hosting | GitHub Pages / Cloudflare Pages static assets; Workers only if needed |
| Storage | No hosted account DB yet; scoped storage + consent-based preferences later |

## ⟡ Repository tree

```text
contributor/
├── README.md                  # Vision, status, quick start
├── LICENSE                    # MIT open-source license
├── web/                       # Working static discovery interface
│   ├── index.html             # Accessible filter UI
│   ├── app.mjs                 # Live search and prompt handoff
│   ├── styles.css             # Responsive dark-green design system
│   └── assets/                # Favicon
├── packages/
│   ├── core/matching.mjs      # Explainable ranking and prompt generation
│   └── github/client.mjs      # Read-only bounded GitHub API adapter
├── apps/mcp/server.mjs        # Seven tools, stdio MCP v2 source
├── tests/                     # Local deterministic unit tests
├── scripts/                   # Static build, preview and guarded publishing
├── assets/                    # GitHub README branding
├── docs/
│   ├── product/               # PRD, cost guardrails, feature phases
│   ├── architecture/          # Architecture, data contracts, discovery pipeline
│   ├── integrations/          # MCP, Hermes memory, CodeRabbit
│   ├── engineering/           # Security, accessibility, quality, contribution policy
│   ├── decisions/             # Architecture decision records
│   └── research/              # Primary-source research register
└── .github/ISSUE_TEMPLATE/     # Structured community issue templates
```

## ↗ Start contributing

The project welcomes **issues, focused changes, tests, accessibility fixes, provider-compatibility evidence and documentation**. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [ROADMAP.md](docs/product/ROADMAP.md) before taking on a larger issue. Please do **not** submit auto-generated PR comments or reviews without understanding and verifying them.

**Project status:** initial code + architecture scaffold published publicly. No live cloud service, GitHub OAuth, hosted MCP, local CodeRabbit execution, or cross-client integration test has been completed.

<div align="center">
  <strong>Find good work. Do good work. Help open source grow.</strong>
  <p><sub>MIT · Free core · BYOK-first · Built for humans and their AI assistants.</sub></p>
</div>