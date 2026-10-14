import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (name) => readFile(new URL(`../extension/${name}`, import.meta.url), 'utf8');
const DAY_MS = 24 * 60 * 60 * 1000;
const ISSUE_URL = 'https://github.com/octo/repo/issues/42';

test('manifest is MV3 with minimal permissions and github.com-only content script', async () => {
  const manifest = JSON.parse(await read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab']);
  assert.deepEqual(manifest.host_permissions, ['https://api.github.com/*']);
  assert.equal(manifest.action.default_popup, 'popup.html');
  for (const cs of manifest.content_scripts) {
    for (const m of cs.matches) assert.match(m, /^https:\/\/github\.com\/.*issues/);
  }
});

function fakeElement(tag = 'div') {
  const el = {
    tag,
    style: {},
    attributes: {},
    children: [],
    parent: null,
    get firstChild() { return el.children[0] ?? null; },
    setAttribute(name, value) { el.attributes[name] = value; },
    appendChild(child) { child.parent = el; el.children.push(child); return child; },
    append(...kids) { kids.forEach((k) => el.appendChild(k)); },
    insertBefore(child, ref) {
      child.parent = el;
      const i = ref ? el.children.indexOf(ref) : -1;
      if (i < 0) el.children.push(child); else el.children.splice(i, 0, child);
      return child;
    },
    remove() {
      if (el.parent) el.parent.children = el.parent.children.filter((c) => c !== el);
      el.parent = null;
    },
  };
  return el;
}

function findById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}

function findByTag(node, tag) {
  if (node.tag === tag) return node;
  for (const child of node.children) {
    const hit = findByTag(child, tag);
    if (hit) return hit;
  }
  return null;
}

function textOf(node) {
  return [node.textContent ?? '', ...node.children.map(textOf)].join(' ');
}

// Runs content.js against a fake DOM and a mocked fetch, then waits for the async update.
async function runContentScript({ url = ISSUE_URL, issue, fetchImpl, withSidebar = false, body = fakeElement('body') } = {}) {
  const source = await read('content.js');
  const sidebar = withSidebar ? body.appendChild(fakeElement('aside')) : null;
  const fetchCalls = [];
  const fetch = fetchImpl ?? (async (api) => {
    fetchCalls.push(api);
    return { ok: true, json: async () => issue };
  });
  const document = {
    body,
    querySelector: (sel) => (sel === '.discussion-sidebar' ? sidebar : null),
    getElementById: (id) => findById(body, id),
    createElement: (tag) => fakeElement(tag),
    addEventListener: () => {},
  };
  vm.runInNewContext(source, { document, location: { href: url }, fetch, Object });
  await new Promise((resolve) => setImmediate(resolve));
  return { body, sidebar, fetchCalls, badge: () => findById(body, 'contributor-ext-badge') };
}

const issueWith = (labels, updatedMsAgo) => ({
  title: 'Synthetic issue',
  labels: labels.map((name) => ({ name })),
  updated_at: new Date(Date.now() - updatedMsAgo).toISOString(),
  repository_url: 'https://api.github.com/repos/octo/repo',
});

test('fetches the issue anonymously and shows a capped 60/60 score with reasons and link', async () => {
  const issue = issueWith(['Good First Issue', 'help wanted'], 1 * DAY_MS);
  const { badge, fetchCalls } = await runContentScript({ issue });
  assert.deepEqual(fetchCalls, ['https://api.github.com/repos/octo/repo/issues/42']);
  const el = badge();
  assert.ok(el, 'badge is mounted');
  const text = textOf(el);
  assert.match(text, /◇ Contributor/);
  assert.match(text, /60\/60/);
  assert.match(text, /Good first issue/);
  assert.match(text, /Help wanted/);
  assert.match(text, /Recently active/);
  const link = findByTag(el, 'a');
  assert.equal(link.href, 'https://contributor-7cw.pages.dev/#discover');
  assert.equal(link.target, '_blank');
  assert.match(link.rel, /noopener/);
  assert.equal(el.style.background, '#191a1b');
});

test('scores 8 for activity within 90 days (not within 30)', async () => {
  const withLabel = await runContentScript({ issue: issueWith(['help wanted'], 60 * DAY_MS) });
  assert.match(textOf(withLabel.badge()), /23\/60/);
  assert.match(textOf(withLabel.badge()), /Active this quarter/);

  const noLabels = await runContentScript({ issue: issueWith([], 60 * DAY_MS) });
  assert.match(textOf(noLabels.badge()), /8\/60/);
});

test('mounts at the top of .discussion-sidebar when present', async () => {
  const { sidebar, badge } = await runContentScript({
    issue: issueWith(['beginner'], 1 * DAY_MS),
    withSidebar: true,
  });
  assert.equal(sidebar.children[0], badge());
});

test('shows nothing when the score is 0', async () => {
  const { badge } = await runContentScript({ issue: issueWith(['bug'], 400 * DAY_MS) });
  assert.equal(badge(), null);
});

test('shows nothing and does not throw when the API fails', async () => {
  const rejected = await runContentScript({ fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(rejected.badge(), null);
  const rateLimited = await runContentScript({ fetchImpl: async () => ({ ok: false, status: 403 }) });
  assert.equal(rateLimited.badge(), null);
});

test('does not call the API on non-issue pages', async () => {
  const { fetchCalls, badge } = await runContentScript({
    url: 'https://github.com/octo/repo/pulls',
    issue: issueWith(['good first issue'], DAY_MS),
  });
  assert.equal(fetchCalls.length, 0);
  assert.equal(badge(), null);
});

test('removes an existing badge when the next issue has a zero score', async () => {
  const first = await runContentScript({ issue: issueWith(['good first issue'], DAY_MS) });
  assert.ok(first.badge());
  const second = await runContentScript({
    url: 'https://github.com/octo/repo/issues/43',
    issue: issueWith([], 400 * DAY_MS),
    body: first.body,
  });
  assert.equal(second.badge(), null);
});
