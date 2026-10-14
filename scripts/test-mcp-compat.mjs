#!/usr/bin/env node
/**
 * MCP v2 stdio compatibility smoke test.
 *
 * Spawns apps/mcp/server.mjs, performs the JSON-RPC handshake over newline-delimited stdio,
 * lists tools and makes one minimal discover_opportunities call. It does NOT assert on live
 * GitHub results, so it passes offline or when rate-limited. It is a protocol harness only and
 * does not certify compatibility with any real MCP client.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';

const SERVER = fileURLToPath(new URL('../apps/mcp/server.mjs', import.meta.url));
const PROTOCOL_VERSION = '2025-06-18';
const REQUEST_TIMEOUT_MS = 30000;
const EXPECTED_TOOLS = [
  'discover_opportunities', 'find_review_requests', 'inspect_repository', 'analyze_issue', 'analyze_pull_request',
  'prepare_contribution', 'get_contribution_status', 'get_repository_passport', 'request_memory_handoff', 'prepare_review_checklist',
];

let failures = 0;
function check(name, ok, detail = '') {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  return ok;
}

const child = spawn(process.execPath, [SERVER], { stdio: ['pipe', 'pipe', 'pipe'] });
let stderrText = '';
child.stderr.on('data', chunk => { stderrText += chunk; });

const pending = new Map();
let nonJsonLines = 0;
createInterface({ input: child.stdout }).on('line', line => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch { nonJsonLines += 1; return; }
  if (message.id !== undefined && pending.has(message.id)) {
    clearTimeout(pending.get(message.id).timer);
    pending.get(message.id).resolve(message);
    pending.delete(message.id);
  }
});
const exited = new Promise(resolve => child.on('exit', (code, signal) => resolve({ code, signal })));

function send(message) { child.stdin.write(`${JSON.stringify(message)}\n`); }
function request(id, method, params) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`timeout after ${REQUEST_TIMEOUT_MS}ms waiting for ${method}`)); }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

async function run() {
  const init = await request(1, 'initialize', {
    protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'contributor-compat-smoke', version: '0.1.0' },
  });
  check('initialize returns a result', Boolean(init.result) && !init.error, JSON.stringify(init.error ?? init));
  check('initialize reports serverInfo.name "contributor"', init.result?.serverInfo?.name === 'contributor');
  check('initialize advertises tools capability', Boolean(init.result?.capabilities?.tools));
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const list = await request(2, 'tools/list', {});
  const tools = list.result?.tools;
  check('tools/list result contains a tools array', Array.isArray(tools), JSON.stringify(list.error ?? list));
  const names = new Set(Array.isArray(tools) ? tools.map(tool => tool.name) : []);
  for (const name of EXPECTED_TOOLS) check(`tool present: ${name}`, names.has(name));
  const unexpected = [...names].filter(name => !EXPECTED_TOOLS.includes(name));
  check('no unexpected tools (update EXPECTED_TOOLS if intentional)', unexpected.length === 0, unexpected.join(', '));
  check('every tool has an object inputSchema', Array.isArray(tools) && tools.every(tool => tool.inputSchema?.type === 'object'));

  const call = await request(3, 'tools/call', { name: 'discover_opportunities', arguments: { languages: ['JavaScript'], mode: 'issues', limit: 1 } });
  const content = call.result?.content;
  check('discover_opportunities returns a JSON-RPC result with a content array', Array.isArray(content), JSON.stringify(call.error ?? call));
  check('discover_opportunities content[0] is a text block', content?.[0]?.type === 'text' && typeof content[0].text === 'string');
  if (call.result?.isError) console.log(`INFO  discover_opportunities reported isError (expected offline/rate-limited): ${String(content?.[0]?.text).slice(0, 160)}`);
  else {
    let parsed = null;
    try { parsed = JSON.parse(content?.[0]?.text); } catch { /* reported below */ }
    check('discover_opportunities text payload is valid JSON', parsed !== null);
  }

  check('server stdout contained only JSON lines', nonJsonLines === 0, `${nonJsonLines} non-JSON line(s)`);
}

try {
  await run();
} catch (error) {
  check('harness completed without error', false, error instanceof Error ? error.message : String(error));
  if (stderrText.trim()) console.log(`server stderr:\n${stderrText.trim()}`);
} finally {
  child.stdin.end();
  const timer = setTimeout(() => child.kill('SIGTERM'), 2000);
  await exited;
  clearTimeout(timer);
}

console.log(failures === 0 ? '\nRESULT: PASS' : `\nRESULT: FAIL (${failures} failed assertion${failures === 1 ? '' : 's'})`);
process.exit(failures === 0 ? 0 : 1);
