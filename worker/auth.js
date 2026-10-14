// Contributor auth Worker: GitHub App read-only login (server-side OAuth code flow).
// All secrets come from the Worker environment: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, WORKER_SECRET.
// The GitHub access token lives only inside the HMAC-signed, HttpOnly session cookie. It is never stored
// server-side, logged, or sent to the browser in a response body; /api/github uses it to proxy API calls.

const SESSION_COOKIE = 'contributor_session';
const STATE_COOKIE = 'contributor_oauth_state';
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const STATE_TTL_SECONDS = 10 * 60;
const DEFAULT_APP_ORIGIN = 'https://contributor-7cw.pages.dev';
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_API_URL = 'https://api.github.com';
// Upstream headers the browser may read; everything else (cookies, tokens) is dropped.
const PROXY_RESPONSE_HEADERS = ['content-type', 'etag', 'link', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-resource'];

const encoder = new TextEncoder();

function appOrigin(env) {
  return env.APP_ORIGIN || DEFAULT_APP_ORIGIN;
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function randomToken(byteLength = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

function hmacKey(env, usage) {
  return crypto.subtle.importKey('raw', encoder.encode(env.WORKER_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

// Signed value format: base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload part)).
async function sign(env, payload) {
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(env, 'sign'), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

// Returns the payload when the signature is valid and the value has not expired; otherwise null.
async function verify(env, value) {
  if (!value || typeof value !== 'string') return null;
  const [body, signature, ...rest] = value.split('.');
  if (!body || !signature || rest.length) return null;
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(env, 'verify'), fromBase64Url(signature), encoder.encode(body));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    if (!payload || typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(request, name) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function redirect(location, cookies = []) {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const value of cookies) headers.append('Set-Cookie', value);
  return new Response(null, { status: 302, headers });
}

function errorRedirect(env) {
  return redirect(`${appOrigin(env)}/?auth_error=1`, [cookie(STATE_COOKIE, '', 0)]);
}

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': appOrigin(env),
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, If-None-Match',
    'Access-Control-Expose-Headers': PROXY_RESPONSE_HEADERS.join(', '),
  };
}

function json(body, status = 200, env = null) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  if (env) Object.entries(corsHeaders(env)).forEach(([k, v]) => headers.set(k, v));
  return new Response(JSON.stringify(body), { status, headers });
}

function timingSafeEqual(a, b) {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

function configured(env) {
  return Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.WORKER_SECRET);
}

async function handleLogin(env) {
  const state = randomToken();
  const signedState = await sign(env, { state, exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS });
  const authorize = new URL(GITHUB_AUTHORIZE_URL);
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', `${appOrigin(env)}/auth/callback`);
  authorize.searchParams.set('scope', 'read:user');
  authorize.searchParams.set('state', state);
  return redirect(authorize.toString(), [cookie(STATE_COOKIE, signedState, STATE_TTL_SECONDS)]);
}

async function handleCallback(request, env, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expected = await verify(env, readCookie(request, STATE_COOKIE));
  if (!code || !state || !expected || !timingSafeEqual(state, expected.state)) return errorRedirect(env);

  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${appOrigin(env)}/auth/callback`,
    }),
  });
  if (!tokenResponse.ok) return errorRedirect(env);
  const accessToken = (await tokenResponse.json()).access_token;
  if (typeof accessToken !== 'string' || !accessToken) return errorRedirect(env);

  const userResponse = await fetch(GITHUB_USER_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'contributor-auth' },
  });
  if (!userResponse.ok) return errorRedirect(env);
  const user = await userResponse.json();
  if (!Number.isInteger(user.id) || typeof user.login !== 'string') return errorRedirect(env);

  // The token rides in the signed cookie so /api/github can authenticate calls; the signature prevents tampering.
  const session = await sign(env, { id: user.id, login: user.login, token: accessToken, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
  return redirect(`${appOrigin(env)}/`, [cookie(SESSION_COOKIE, session, SESSION_TTL_SECONDS), cookie(STATE_COOKIE, '', 0)]);
}

function handleLogout(env) {
  return redirect(`${appOrigin(env)}/`, [cookie(SESSION_COOKIE, '', 0), cookie(STATE_COOKIE, '', 0)]);
}

async function handleUser(request, env) {
  const session = await verify(env, readCookie(request, SESSION_COOKIE));
  if (!session) return json({ authenticated: false }, 401, env);
  return json({
    authenticated: true,
    id: session.id,
    login: session.login,
    avatar_url: `https://avatars.githubusercontent.com/u/${session.id}`,
  }, 200, env);
}

// A proxied path must be an absolute API path: no host override, no traversal, no encoded traversal.
function validProxyPath(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('..') && !/%2e/i.test(path) && !/[\\\s]/.test(path);
}

// 1:1 pass-through of a GitHub REST call using the token from the signed session; nothing is stored.
async function handleGitHubProxy(request, env, url) {
  const session = await verify(env, readCookie(request, SESSION_COOKIE));
  if (!session || typeof session.token !== 'string' || !session.token) return json({ error: 'not_authenticated' }, 401, env);
  const path = url.searchParams.get('path');
  if (!validProxyPath(path)) return json({ error: 'invalid_path' }, 400, env);
  const headers = {
    Authorization: `Bearer ${session.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'contributor-auth',
  };
  const etag = request.headers.get('If-None-Match');
  if (etag) headers['If-None-Match'] = etag;
  const upstream = await fetch(`${GITHUB_API_URL}${path}`, { headers });
  const out = new Headers({ 'Cache-Control': 'no-store' });
  for (const name of PROXY_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  Object.entries(corsHeaders(env)).forEach(([k, v]) => out.set(k, v));
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Handle CORS preflight for the credentialed JSON endpoints
    if (request.method === 'OPTIONS' && (url.pathname === '/auth/user' || url.pathname === '/api/github')) {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, OPTIONS' } });
    try {
      if (!configured(env)) return url.pathname === '/auth/user' ? json({ authenticated: false }, 401, env) : url.pathname === '/api/github' ? json({ error: 'not_authenticated' }, 401, env) : errorRedirect(env);
      switch (url.pathname) {
        case '/auth/login': return await handleLogin(env);
        case '/auth/callback': return await handleCallback(request, env, url);
        case '/auth/logout': return handleLogout(env);
        case '/auth/user': return await handleUser(request, env);
        case '/api/github': return await handleGitHubProxy(request, env, url);
        default: return new Response('Not Found', { status: 404 });
      }
    } catch {
      // Never expose error details to the browser.
      if (url.pathname === '/api/github') return json({ error: 'upstream_unavailable' }, 502, env);
      return url.pathname === '/auth/user' ? json({ authenticated: false }, 401) : errorRedirect(env);
    }
  },
};
