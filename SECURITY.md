# Security and privacy policy

Contributor is a pre-release open-source prototype. To report a security issue, use GitHub private vulnerability reporting if enabled; otherwise contact the maintainer privately and avoid public exploit details until coordinated disclosure.

## Safety defaults

- GitHub discovery is **read-only**; no issue comments, PR creation or reviews posted by the MVP or MCP server.
- Anonymous web MVP neither requests nor stores tokens or AI keys.
- The MCP server reads `CONTRIBUTOR_GITHUB_TOKEN` only from its local process environment when provided; never put tokens in config files, screenshots or prompts.
- This app does not read Hermes `USER.md`, `MEMORY.md` or session logs. Hermes itself may supply a narrow set of preferences via MCP after user consent.
- Handoff prompts require plan approval and ask assistants to inspect CONTRIBUTING policies before code/public activity.
- GitHub App authentication, private-repo support, user account data and cloud-hosted MCP are not implemented. They require threat modeling, OAuth state/PKCE, least privilege, refresh/expiry and deletion pathways.
- No runtime Google/GitHub/provider sign-in secrets are included in the public repository.

## Threats to address before GA

Prompt injection from README/issues/PR diffs; GitHub API secondary rate limits; poisoned links and markdown; unauthorized actions through MCP; cross-user data disclosure; local browser token storage; unreliable AI reviews; expensive BYOK API usage; data retention and deletion; supply-chain and server SSRF.

Read [engineering security requirements](docs/engineering/SECURITY.md).