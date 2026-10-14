# Deploy on a $0 infrastructure budget

## Static web deployment — current recommended route

The production website is a static asset bundle in `dist/` and makes public GitHub API requests directly from each visitor's browser. No database, model API key, Node service, or hosted OAuth callback is required for this alpha mode.

```bash
npm run build
```

### Cloudflare Pages (recommended when available)

1. Create a free Cloudflare account and a Pages project.
2. Connect the public GitHub repository, or upload the generated `dist/` assets directly.
3. Build command: `npm run build`; output directory: `dist`.
4. Use the provided `.pages.dev` address initially; no custom domain is necessary.
5. Keep Workers/D1/paid usage **disabled** until measured need and explicit budget approval.
6. Verify browser GitHub Search, rate-limit errors, mobile/keyboard, privacy notice and all source links after deploy.

Cloudflare currently documents free unlimited static-asset requests, while Pages Functions/Workers count against the Workers plan quota. Do not deploy a Function by accident just to display static assets. https://developers.cloudflare.com/pages/functions/pricing/

### GitHub Pages

GitHub Pages can serve static output from a published branch/folder. Since `dist/` is ignored in development, use a **separate explicit deployment step** to publish a checked build rather than committing generated files to `main`. Never add an unattended publishing workflow without documenting implications. GitHub Pages may provide a free `github.io` subdomain.

## No hosted MCP server in alpha

`npm run mcp` launches a **local process on the user's computer**, so contributor pays no shared API/server bill. Remote HTTP MCP, saved profiles and GitHub App authentication require another architecture/release gate before deployment.

## Observe cost

On any future Cloudflare project, view usage dashboards and configure any supported budget warnings/limits. If Cloudflare changes free plan quotas or an optional service becomes paid, pause that service before incurring a bill; do not silently pass the cost to users.
