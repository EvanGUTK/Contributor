# Deploy on a $0 infrastructure budget

## Static web deployment — current recommended route

The production website is a static asset bundle in `dist/` and makes public GitHub API requests directly from each visitor's browser. No database, model API key, Node service, or hosted OAuth callback is required for this alpha mode.

```bash
npm run build          # writes dist/
npm run verify:deploy  # builds, then certifies dist/ is static and cost-free (see below)
```

Run `verify:deploy` before every deploy. Hosting-provider quotas and pricing change; the figures below were taken from the providers' public documentation and must be re-checked at the linked pages before the first deploy. The deploy commands themselves have **not yet been executed** against a real account — treat the first deploy as the validation step.

## What `npm run verify:deploy` checks

`scripts/verify-deploy.mjs` (Node 22, zero dependencies) runs `npm run build` and then prints `PASS`/`FAIL` for each check. It exits `0` only if every check passes and `1` otherwise.

| Check | Why it matters for cost |
| --- | --- |
| `npm run build` succeeds | There is a fresh `dist/` to certify. |
| `dist/` contains `index.html`, `app.mjs`, `styles.css`, `lib/matching.mjs`, `lib/github.mjs` | The bundle is complete and needs no server-side step. |
| Total `dist/` size is under 500 KB | Stays far inside every free-tier size limit (current build is roughly 48 KB). |
| No file in `dist/` matches the hardcoded-credential patterns | Mirrors the secret patterns in `packages/core/review-coach.mjs` (AWS, GitHub, Anthropic/OpenAI-style, Slack keys, private key blocks, credential assignments). Reports file and line, never the value. Placeholders such as `your-api-key` are ignored. |
| `index.html` has no `<script src>` pointing to an external origin | The page is self-contained: no third-party CDN dependency or tracking script. |

The checks are static pattern checks. They certify the *artifact*; they do not prove a provider's current pricing, and they do not replace a manual look at the deployed site.

## Verified free hosting options

### GitHub Pages (zero cost for public repositories)

GitHub Pages serves static files from a branch for free on public repositories, on a `github.io` address. `dist/` is git-ignored in development, so publish it to a dedicated `gh-pages` branch rather than committing generated files to `main`.

```bash
npm run verify:deploy
npx gh-pages -d dist
```

`gh-pages` is run through `npx` and is deliberately **not** added to `package.json`, so the project keeps its zero extra dependencies. It pushes only the `gh-pages` branch, never `main`. Then, once: repository **Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`**.

The site is served under `https://<owner>.github.io/<repo>/`. The web app uses relative asset paths, so the sub-path should work; confirm after the first deploy. Do not add a GitHub Actions publishing workflow without documenting its implications (this project does not rely on remote CI).

Reference: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages

### Cloudflare Pages (free tier)

Cloudflare Pages documents free, unlimited static-asset requests and bandwidth, and a free-plan limit of 500 builds per month. Direct upload of a prebuilt `dist/` is the lowest-risk path: it does not depend on Cloudflare building the project.

```bash
npm run verify:deploy
npx wrangler login                                          # one-time, opens a browser
npx wrangler pages deploy dist/ --project-name contributor  # first run offers to create the project
```

`wrangler` is likewise run through `npx` and is not added as a dependency. The deploy prints a `https://<project>.pages.dev` address; use it initially, no custom domain is needed.

If you instead connect the GitHub repository for Cloudflare-side builds, use build command `npm run build` and output directory `dist`. Each such build counts against the 500 builds/month limit.

Reference: https://developers.cloudflare.com/pages/platform/limits/ and https://developers.cloudflare.com/pages/functions/pricing/

## Hard limits: what would push cost above zero

- **GitHub Pages on a private repository.** Pages for private repos requires a paid GitHub plan. Keep the repository public, or use Cloudflare Pages.
- **More than 500 Cloudflare Pages builds per month.** Applies to Git-connected builds on the free plan. Prefer direct upload with `wrangler pages deploy`, and avoid auto-building every push to every branch.
- **Adding a Worker or Pages Function.** Functions/Workers count against the Workers plan quota (the free plan has a daily request cap; exceeding it fails requests or requires a paid plan). Do not add a `functions/` directory or Worker "just to serve static assets". `verify:deploy` does not detect this; review any change that adds server-side code.
- **Adding D1, KV, R2, or other metered Cloudflare/GitHub services.** Out of scope for the alpha.
- **Introducing a mandatory model/API key or hosted proxy.** Violates the BYOK-first, no-mandatory-hosted-AI rule and creates a per-request bill.
- **Outgrowing the free bundle limits.** Both providers cap site size and file counts; the 500 KB `verify:deploy` ceiling keeps the project orders of magnitude below them.
- **A custom domain.** Registration costs money (see below). Hosting a custom domain on either provider is free, but the domain itself is not.

## What still needs manual action

These cannot be done by the repository tooling and need the maintainer:

1. **Choose a provider** (GitHub Pages or Cloudflare Pages) and create the account/project.
2. **Run the first deploy** with the commands above and, for GitHub Pages, enable Pages in repository settings.
3. **Domain registration** — optional. Skip it and use the free `github.io` or `pages.dev` address until a domain is worth paying for; a registered domain is a recurring cost that needs explicit approval.
4. **Post-deploy verification in a browser**: GitHub Search works, rate-limit errors are readable, mobile and keyboard use, the privacy notice and all source links.

## No hosted MCP server in alpha

`npm run mcp` launches a **local process on the user's computer**, so contributor pays no shared API/server bill. Remote HTTP MCP, saved profiles and GitHub App authentication require another architecture/release gate before deployment.

## Observe cost

On any future Cloudflare project, view usage dashboards and configure any supported budget warnings/limits. If Cloudflare changes free plan quotas or an optional service becomes paid, pause that service before incurring a bill; do not silently pass the cost to users.
