/** Contributor MCP v2, local stdio. No AI key or GitHub write privileges required. */
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { createGitHubClient } from '../../packages/github/client.mjs';
import { normalizePreferences, buildHandoffPrompt, scoreOpportunity } from '../../packages/core/matching.mjs';
import { getPassportSummary } from '../../packages/core/passport.mjs';
import { validateConsentPreferences, buildConsentSummary } from '../../packages/core/memory-consent.mjs';

const client = createGitHubClient({ token: process.env.CONTRIBUTOR_GITHUB_TOKEN || undefined });
const prefsSchema = {
  languages: z.array(z.string().max(25)).max(8).optional().describe('Languages the user enjoys or knows; infer from existing assistant memory only when user has permitted sharing.'),
  interests: z.string().max(120).optional().describe('Selected relevant interests, not raw private memory or transcripts.'),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  hours: z.number().min(1).max(40).optional(),
};
const ownerSchema = z.string().regex(/^[\w.-]{1,100}$/),
  repoSchema = z.string().regex(/^[\w.-]{1,100}$/),
  issueSchema = z.number().int().positive().max(1000000000);

function reply(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function safe(handler) {
  return async args => {
    try { return reply(await handler(args)); }
    catch (error) { return { content: [{ type: 'text', text: `Contributor: ${error instanceof Error ? error.message : 'Unexpected error'}` }], isError: true }; }
  };
}
function compact(item) {
  const inProgress = Boolean(item._inProgress);
  return { name: item.full_name || item.title, repository: item._repoName || item.full_name,
    url: item.html_url, state: item.state, labels: (item.labels || []).map(l => l.name),
    match: item._match, updated_at: item.updated_at || item.pushed_at, inProgress,
    ...(inProgress && { inProgressNote: 'A linked PR may already address this issue — verify before starting work.' }),
    note: 'Opportunity is not guaranteed to remain available. Check maintainer guidelines before contributing.' };
}

function createServer() {
  const server = new McpServer({ name: 'contributor', version: '0.1.0' });
  server.registerTool('discover_opportunities', {
    description: 'PRIMARY ENTRY POINT: find actual public GitHub repositories, issues and pull requests for the user. Infer only authorized preferences; do not require a preselected URL.',
    inputSchema: z.object({ ...prefsSchema, mode: z.enum(['all', 'repositories', 'issues', 'reviews']).optional(), limit: z.number().int().min(1).max(20).optional() })
  }, safe(async args => {
    const result = await client.discover(normalizePreferences(args), { limit: args.limit ?? 10 });
    return { found: result.items.length, at: result.at, warnings: result.warnings, opportunities: result.items.slice(0, 20).map(compact),
      nextStep: 'Explain the matches and allow the user to select. Do not contact maintainers automatically.' };
  }));
  server.registerTool('request_memory_handoff', {
    description: 'Called by an AI assistant (e.g. Hermes) to declare that the user has approved sharing specific preferences for this discovery session. Only the listed typed fields are accepted — raw memory files, conversation history and private context are never read or stored.',
    inputSchema: z.object({
      // Loose so unexpected keys reach the handler and are reported in `rejected` rather than silently dropped.
      preferences: z.looseObject({ ...prefsSchema, mode: z.enum(['all', 'repositories', 'issues', 'reviews']).optional() }),
      consent_statement: z.string().max(200).describe('Human-readable statement the assistant shows the user before calling this tool, e.g. "Share your Python + AI interests with Contributor?"')
    })
  }, safe(async ({ preferences }) => {
    const { sanitized, rejected } = validateConsentPreferences(preferences);
    return { accepted: sanitized, rejected, summary: buildConsentSummary(sanitized),
      policy: 'No raw memory, transcripts or private context accepted. User can override any preference.' };
  }));
  server.registerTool('find_review_requests', {
    description: 'Discover open public pull requests without submitted reviews; these are candidates, not necessarily requests for outside approval.',
    inputSchema: z.object({ ...prefsSchema, limit: z.number().int().min(1).max(20).optional() })
  }, safe(async args => {
    const result = await client.discover({ ...args, mode: 'reviews' }, { limit: args.limit ?? 10 });
    return { opportunities: result.items.map(compact), warnings: result.warnings, caution: 'Check CONTRIBUTING.md and maintainer policies before offering a review. Do not publish without the user approving the exact comment.' };
  }));
  server.registerTool('inspect_repository', {
    description: 'Read public repository metadata: language, activity, issues and license. Does not assert maintainer acceptance.',
    inputSchema: z.object({ owner: ownerSchema, repo: repoSchema })
  }, safe(async ({ owner, repo }) => {
    const data = await client.getRepo(owner, repo);
    return { full_name: data.full_name, html_url: data.html_url, description: data.description, language: data.language, topics: data.topics,
      stars: data.stargazers_count, open_issues_count: data.open_issues_count, updated_at: data.updated_at,
      pushed_at: data.pushed_at, archived: data.archived, has_issues: data.has_issues,
      license: data.license?.spdx_id ?? 'Unknown', note: 'Read CONTRIBUTING.md, issue thread, linked PRs and AI policies before initiating work.' };
  }));
  server.registerTool('get_repository_passport', {
    description: 'Summarize whether a public repository looks ready for outside contributors: CONTRIBUTING file, license, maintainer activity, AI policy file and setup effort. Read-only; does not guarantee maintainer acceptance.',
    inputSchema: z.object({ owner: ownerSchema, repo: repoSchema })
  }, safe(async ({ owner, repo }) => {
    const data = await client.getRepo(owner, repo);
    const files = await client.getRepoFiles(owner, repo);
    return { repository: data.full_name, url: data.html_url, passport: getPassportSummary(data, files),
      note: 'This passport does not guarantee maintainer acceptance. It only checks root file names and public metadata, so read CONTRIBUTING, the README and recent issue and PR threads before starting work.' };
  }));
  server.registerTool('analyze_issue', {
    description: 'Fetch factual issue context and produce a safe starter plan prompt. Deep code analysis is done by the connected AI assistant, not by this tool.',
    inputSchema: z.object({ owner: ownerSchema, repo: repoSchema, number: issueSchema, ...prefsSchema })
  }, safe(async args => {
    const issue = await client.request(`/repos/${args.owner}/${args.repo}/issues/${args.number}`);
    if (issue.pull_request) throw new Error('This number refers to a pull request, not an issue. Use analyze_pull_request.');
    return { issue: { title: issue.title, url: issue.html_url, state: issue.state, body_excerpt: (issue.body || '').slice(0, 5000), labels: issue.labels?.map(l => l.name), updated_at: issue.updated_at },
      handoffPrompt: buildHandoffPrompt(issue, args), recommendations: scoreOpportunity(issue, args),
      caveat: 'The issue might have a linked in-progress PR. Inspect repository and contribution rules before creating code.' };
  }));
  server.registerTool('analyze_pull_request', {
    description: 'Fetch public PR metadata and first-page changed-file summaries, for human-led code review. No comments are posted.',
    inputSchema: z.object({ owner: ownerSchema, repo: repoSchema, number: issueSchema, ...prefsSchema })
  }, safe(async args => {
    const pr = await client.request(`/repos/${args.owner}/${args.repo}/pulls/${args.number}`);
    const files = await client.request(`/repos/${args.owner}/${args.repo}/pulls/${args.number}/files?per_page=30`);
    return { pr: { title: pr.title, url: pr.html_url, state: pr.state, draft: pr.draft, changed_files: pr.changed_files,
        additions: pr.additions, deletions: pr.deletions, description_excerpt: (pr.body || '').slice(0, 3500), base_sha: pr.base?.sha, head_sha: pr.head?.sha },
      firstPageFiles: files.map(x => ({ filename: x.filename, status: x.status, additions: x.additions, deletions: x.deletions, patch_excerpt: (x.patch || '').slice(0, 1200) })),
      truncated: pr.changed_files > 30, nextStep: 'Independently verify any suspected bug and draft review comments. The user approves exact comments before publishing.' };
  }));
  server.registerTool('prepare_contribution', {
    description: 'Generate a grounded, approval-first prompt for an opportunity the user has chosen. Never writes GitHub data.',
    inputSchema: z.object({ url: z.string().url().max(400), title: z.string().max(200).optional(), ...prefsSchema })
  }, safe(async args => ({ prompt: buildHandoffPrompt({ html_url: args.url, title: args.title }, args), publishPolicy: 'No autonomous public comments, PRs or reviews.' })));
  server.registerTool('get_contribution_status', {
    description: 'Read current state of a public GitHub issue or pull request. No local account connection required.',
    inputSchema: z.object({ owner: ownerSchema, repo: repoSchema, number: issueSchema })
  }, safe(async args => {
    const issue = await client.request(`/repos/${args.owner}/${args.repo}/issues/${args.number}`);
    return { url: issue.html_url, title: issue.title, type: issue.pull_request ? 'pull_request' : 'issue', state: issue.state,
      comments: issue.comments, updated_at: issue.updated_at, closed_at: issue.closed_at, caveat: 'This reflects public GitHub state only and cannot prove your changes were accepted.' };
  }));
  return server;
}

void serveStdio(createServer);
console.error('Contributor MCP v2 listening on stdio (public discovery, read-only).');
