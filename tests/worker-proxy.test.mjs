import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/auth.js';

const env = { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret', WORKER_SECRET: 'test-signing-secret', APP_ORIGIN: 'https://app.test' };
const BASE = 'https://auth.test';
const FAKE_TOKEN = 'fake-access-token';

// Walks the real login -> callback flow with a stubbed GitHub so the session cookie is produced by the Worker itself.
async function signIn() {
  const login = await worker.fetch(new Request(`${BASE}/auth/login`), env);
  const stateCookie = login.headers.get('Set-Cookie').split(';')[0];
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => String(url).endsWith('/access_token')
    ? Response.json({ access_token: FAKE_TOKEN })
    : Response.json({ id: 7, login: 'octo' });
  try {
    const callback = await worker.fetch(new Request(`${BASE}/auth/callback?code=c&state=${state}`, { headers: { Cookie: stateCookie } }), env);
    return callback.headers.getSetCookie().find(c => c.startsWith('contributor_session=')).split(';')[0];
  } finally { globalThis.fetch = realFetch; }
}

async function proxy(path, cookie, init = {}) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', etag: '"abc"', 'x-ratelimit-remaining': '4999', 'set-cookie': 'leak=1' } });
  };
  try {
    const query = path === undefined ? '' : `?path=${encodeURIComponent(path)}`;
    const response = await worker.fetch(new Request(`${BASE}/api/github${query}`, { headers: cookie ? { Cookie: cookie, ...init.headers } : init.headers }), env);
    return { response, calls };
  } finally { globalThis.fetch = realFetch; }
}

test('proxy rejects requests without a valid session', async () => {
  const none = await proxy('/rate_limit');
  assert.equal(none.response.status, 401);
  const forged = await proxy('/rate_limit', 'contributor_session=eyJ4IjoxfQ.AAAA');
  assert.equal(forged.response.status, 401);
  assert.equal(none.calls.length + forged.calls.length, 0);
});

test('proxy forwards the session token to GitHub and never exposes it to the browser', async () => {
  const cookie = await signIn();
  const { response, calls } = await proxy('/search/issues?q=a%20b&per_page=1', cookie, { headers: { 'If-None-Match': '"old"' } });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/search/issues?q=a%20b&per_page=1');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${FAKE_TOKEN}`);
  assert.equal(calls[0].options.headers['If-None-Match'], '"old"');
  assert.equal(await response.text(), '{"ok":true}');
  assert.equal(response.headers.get('etag'), '"abc"');
  assert.equal(response.headers.get('x-ratelimit-remaining'), '4999');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://app.test');
  assert.equal(response.headers.get('Access-Control-Allow-Credentials'), 'true');
  assert.ok(![...response.headers.values()].some(v => v.includes(FAKE_TOKEN)));
});

test('proxy rejects missing, relative, traversal and host-override paths without calling GitHub', async () => {
  const cookie = await signIn();
  for (const bad of [undefined, '', 'repos/a/b', '/repos/../user', '/repos/%2e%2E/user', '//evil.test/x', '/a\\b', '/a b']) {
    const { response, calls } = await proxy(bad, cookie);
    assert.equal(response.status, 400, `path ${JSON.stringify(bad)}`);
    assert.equal(calls.length, 0);
  }
});

test('proxy answers CORS preflight and rejects non-GET methods', async () => {
  const preflight = await worker.fetch(new Request(`${BASE}/api/github`, { method: 'OPTIONS' }), env);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /If-None-Match/);
  const post = await worker.fetch(new Request(`${BASE}/api/github?path=/user`, { method: 'POST' }), env);
  assert.equal(post.status, 405);
});

test('a session cookie from before this change (no token) cannot use the proxy', async () => {
  // Same signing scheme as the Worker, minus the token field.
  const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const body = encode(new TextEncoder().encode(JSON.stringify({ id: 7, login: 'octo', exp: Math.floor(Date.now() / 1000) + 600 })));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WORKER_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = encode(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))));
  const { response, calls } = await proxy('/rate_limit', `contributor_session=${body}.${signature}`);
  assert.equal(response.status, 401);
  assert.equal(calls.length, 0);
});
