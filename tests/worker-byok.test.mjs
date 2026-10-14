import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/auth.js';

const APP = 'https://app.test';
const BASE = 'https://auth.test';
const OPENAI_KEY = 'sk-proj-abcdefghijklmnop1234';
const ANTHROPIC_KEY = 'sk-ant-api03-abcdefghijklmnop5678';

// In-memory stand-in for the KV binding; records put options so TTL and metadata can be asserted.
function memoryKV() {
  const store = new Map();
  return {
    store,
    async put(key, value, options = {}) { store.set(key, { value, options }); },
    async get(key) { return store.get(key)?.value ?? null; },
    async getWithMetadata(key) { const entry = store.get(key); return { value: entry?.value ?? null, metadata: entry?.options.metadata ?? null }; },
    async delete(key) { store.delete(key); },
  };
}

function makeEnv() {
  return { GITHUB_CLIENT_ID: 'id', GITHUB_CLIENT_SECRET: 'secret', WORKER_SECRET: 'test-signing-secret', APP_ORIGIN: APP, BYOK_KEYS: memoryKV() };
}

// Walks the real login -> callback flow with a stubbed GitHub so the session cookie is produced by the Worker itself.
async function signIn(env, id = 7) {
  const login = await worker.fetch(new Request(`${BASE}/auth/login`), env);
  const stateCookie = login.headers.get('Set-Cookie').split(';')[0];
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => String(url).endsWith('/access_token')
    ? Response.json({ access_token: 'fake-access-token' })
    : Response.json({ id, login: `user${id}` });
  try {
    const callback = await worker.fetch(new Request(`${BASE}/auth/callback?code=c&state=${state}`, { headers: { Cookie: stateCookie } }), env);
    return callback.headers.getSetCookie().find(c => c.startsWith('contributor_session=')).split(';')[0];
  } finally { globalThis.fetch = realFetch; }
}

function call(env, method, path, { cookie, body, origin = APP } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (origin) headers.Origin = origin;
  return worker.fetch(new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
}

test('BYOK endpoints require a valid session and never touch KV without one', async () => {
  const env = makeEnv();
  for (const [method, path] of [['POST', '/api/byok/save'], ['GET', '/api/byok/status'], ['DELETE', '/api/byok/delete']]) {
    const none = await call(env, method, path, { body: method === 'POST' ? { key: OPENAI_KEY } : undefined });
    assert.equal(none.status, 401, `${method} ${path}`);
    const forged = await call(env, method, path, { cookie: 'contributor_session=eyJpZCI6N30.AAAA', body: method === 'POST' ? { key: OPENAI_KEY } : undefined });
    assert.equal(forged.status, 401, `${method} ${path} forged`);
  }
  assert.equal(env.BYOK_KEYS.store.size, 0);
});

test('save stores only ciphertext with a 30-day TTL and never echoes the key', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  const response = await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY } });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.deepEqual(JSON.parse(text), { saved: true });
  assert.ok(!text.includes(OPENAI_KEY));
  assert.ok(![...response.headers.values()].some(v => v.includes(OPENAI_KEY)));
  const entry = env.BYOK_KEYS.store.get('byok:7');
  assert.ok(entry, 'stored under the GitHub user ID');
  assert.ok(!entry.value.includes(OPENAI_KEY) && !entry.value.includes('sk-'), 'value is encrypted');
  assert.deepEqual(Object.keys(JSON.parse(entry.value)).sort(), ['data', 'iv']);
  assert.equal(entry.options.expirationTtl, 30 * 24 * 60 * 60);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), APP);
});

test('save rejects malformed, wrong-prefix, short, long and header-unsafe keys', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  const bad = [{}, { key: 42 }, { key: 'pk-abcdefghijklmnopqrstu' }, { key: 'sk-short' }, { key: `sk-${'a'.repeat(198)}` }, { key: 'sk-abcdefghij\r\nX-Evil: 1' }, { key: 'sk-abcdefghij klmnopqrs' }];
  for (const body of bad) {
    const response = await call(env, 'POST', '/api/byok/save', { cookie, body });
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  for (const body of ['not json', '[1]', JSON.stringify({ key: OPENAI_KEY, pad: 'x'.repeat(5000) })]) {
    assert.equal((await call(env, 'POST', '/api/byok/save', { cookie, body })).status, 400);
  }
  assert.equal(env.BYOK_KEYS.store.size, 0);
});

test('state-changing BYOK calls from another origin are refused (CSRF)', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  assert.equal((await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY }, origin: 'https://evil.test' })).status, 403);
  assert.equal((await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY }, origin: null })).status, 403);
  await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY } });
  assert.equal((await call(env, 'DELETE', '/api/byok/delete', { cookie, origin: 'https://evil.test' })).status, 403);
  assert.ok(env.BYOK_KEYS.store.has('byok:7'));
});

test('status reports presence and provider only; delete removes the key', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  assert.deepEqual(await (await call(env, 'GET', '/api/byok/status', { cookie })).json(), { hasKey: false, provider: null });
  await call(env, 'POST', '/api/byok/save', { cookie, body: { key: ANTHROPIC_KEY } });
  const status = await call(env, 'GET', '/api/byok/status', { cookie });
  const text = await status.text();
  assert.deepEqual(JSON.parse(text), { hasKey: true, provider: 'anthropic' });
  assert.ok(!text.includes('sk-'));
  await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY } });
  assert.deepEqual(await (await call(env, 'GET', '/api/byok/status', { cookie })).json(), { hasKey: true, provider: 'openai' });
  const deleted = await call(env, 'DELETE', '/api/byok/delete', { cookie });
  assert.deepEqual(await deleted.json(), { deleted: true });
  assert.equal(env.BYOK_KEYS.store.size, 0);
  assert.deepEqual(await (await call(env, 'GET', '/api/byok/status', { cookie })).json(), { hasKey: false, provider: null });
});

test('BYOK endpoints answer CORS preflight for credentialed POST/DELETE and reject wrong methods', async () => {
  const env = makeEnv();
  for (const path of ['/api/byok/save', '/api/byok/status', '/api/byok/delete']) {
    const preflight = await worker.fetch(new Request(`${BASE}${path}`, { method: 'OPTIONS' }), env);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), APP);
    assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), 'true');
    assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /POST/);
    assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /DELETE/);
  }
  const cookie = await signIn(env);
  assert.equal((await call(env, 'GET', '/api/byok/save', { cookie })).status, 405);
  assert.equal((await call(env, 'POST', '/api/byok/status', { cookie, body: {} })).status, 405);
});

test('a missing KV binding fails closed with 503', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  delete env.BYOK_KEYS;
  const response = await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY } });
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(OPENAI_KEY));
});

// Runs one /api/byok/explain call with the provider stubbed; records the outbound calls the Worker made.
async function explain(env, cookie, body, providerResponse = () => Response.json({ choices: [{ message: { content: ' Great fit. ' } }] }), origin = APP) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return providerResponse(String(url)); };
  try {
    const response = await call(env, 'POST', '/api/byok/explain', { cookie, body, origin });
    return { response, text: await response.text(), calls };
  } finally { globalThis.fetch = realFetch; }
}

test('explain calls OpenAI server-side with the decrypted key and returns only the explanation', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY } });
  const { response, text, calls } = await explain(env, cookie, { prompt: 'Why is this a match?' });
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(text), { explanation: 'Great fit.' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${OPENAI_KEY}`);
  assert.equal(JSON.parse(calls[0].options.body).messages[0].content, 'Why is this a match?');
  assert.ok(!text.includes(OPENAI_KEY));
  assert.ok(![...response.headers.values()].some(v => v.includes(OPENAI_KEY)));
});

test('explain routes Anthropic keys to the Messages API without the browser-access header', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  await call(env, 'POST', '/api/byok/save', { cookie, body: { key: ANTHROPIC_KEY } });
  const { response, text, calls } = await explain(env, cookie, { prompt: 'Why?' }, () => Response.json({ content: [{ type: 'text', text: 'Because.' }] }));
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(text), { explanation: 'Because.' });
  assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(calls[0].options.headers['x-api-key'], ANTHROPIC_KEY);
  assert.equal(calls[0].options.headers['anthropic-dangerous-direct-browser-access'], undefined);
});

test('explain without a saved key returns no_key and calls no provider', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  const { response, text, calls } = await explain(env, cookie, { prompt: 'Why?' });
  assert.equal(response.status, 400);
  assert.deepEqual(JSON.parse(text), { error: 'no_key', message: 'Save an API key first' });
  assert.equal(calls.length, 0);
});

test('explain rejects missing, empty and over-500-character prompts before calling the provider', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY } });
  for (const body of [{}, { prompt: '   ' }, { prompt: 7 }, { prompt: 'x'.repeat(501) }]) {
    const { response, calls } = await explain(env, cookie, body);
    assert.equal(response.status, 400, JSON.stringify(body).slice(0, 40));
    assert.equal(calls.length, 0);
  }
  assert.equal((await explain(env, cookie, { prompt: 'x'.repeat(500) })).response.status, 200);
});

test('provider failures map to reason codes and never forward the upstream body', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY } });
  const leaky = status => () => Response.json({ error: { message: `Incorrect API key provided: ${OPENAI_KEY}` } }, { status });
  const rejected = await explain(env, cookie, { prompt: 'Why?' }, leaky(401));
  assert.equal(rejected.response.status, 502);
  assert.deepEqual(JSON.parse(rejected.text), { error: 'key_rejected' });
  const failed = await explain(env, cookie, { prompt: 'Why?' }, leaky(500));
  assert.deepEqual(JSON.parse(failed.text), { error: 'provider_failed' });
  const empty = await explain(env, cookie, { prompt: 'Why?' }, () => Response.json({ choices: [] }));
  assert.deepEqual(JSON.parse(empty.text), { error: 'provider_failed' });
  const thrown = await explain(env, cookie, { prompt: 'Why?' }, () => { throw new Error(`network ${OPENAI_KEY}`); });
  assert.equal(thrown.response.status, 502);
  for (const result of [rejected, failed, empty, thrown]) assert.ok(!result.text.includes(OPENAI_KEY));
});

test("one user's ciphertext cannot be decrypted under another user's session", async () => {
  const env = makeEnv();
  await call(env, 'POST', '/api/byok/save', { cookie: await signIn(env, 7), body: { key: OPENAI_KEY } });
  env.BYOK_KEYS.store.set('byok:8', env.BYOK_KEYS.store.get('byok:7'));
  const { response, text, calls } = await explain(env, await signIn(env, 8), { prompt: 'Why?' });
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(text), { error: 'byok_failed' });
  assert.equal(calls.length, 0);
});

test('explain requires a session and the app origin', async () => {
  const env = makeEnv();
  const cookie = await signIn(env);
  await call(env, 'POST', '/api/byok/save', { cookie, body: { key: OPENAI_KEY } });
  const anonymous = await explain(env, undefined, { prompt: 'Why?' });
  assert.equal(anonymous.response.status, 401);
  const crossSite = await explain(env, cookie, { prompt: 'Why?' }, undefined, 'https://evil.test');
  assert.equal(crossSite.response.status, 403);
  assert.equal(anonymous.calls.length + crossSite.calls.length, 0);
  const preflight = await worker.fetch(new Request(`${BASE}/api/byok/explain`, { method: 'OPTIONS' }), env);
  assert.equal(preflight.status, 204);
});
