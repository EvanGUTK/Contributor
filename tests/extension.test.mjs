import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const read = (name) => readFile(new URL(`../extension/${name}`, import.meta.url), 'utf8');

test('manifest is MV3 with minimal permissions and github.com-only content script', async () => {
  const manifest = JSON.parse(await read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.action.default_popup, 'popup.html');
  for (const cs of manifest.content_scripts) {
    for (const m of cs.matches) assert.match(m, /^https:\/\/github\.com\/.*issues/);
  }
});

function runContentScript(source, document) {
  vm.runInNewContext(source, { document, Object });
}

function fakeDocument(title) {
  const listeners = {};
  const inserted = [];
  const doc = {
    body: {},
    inserted,
    listeners,
    querySelector: (sel) => (title && sel === 'h1' ? title : null),
    getElementById: (id) => inserted.find((e) => e.id === id) ?? null,
    createElement: () => ({ style: {} }),
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  if (title) title.insertAdjacentElement = (_pos, el) => inserted.push(el);
  return doc;
}

test('content script appends one badge after the issue title', async () => {
  const source = await read('content.js');
  const doc = fakeDocument({ parentNode: {} });
  runContentScript(source, doc);
  runContentScript(source, doc);
  assert.equal(doc.inserted.length, 1);
  assert.match(doc.inserted[0].textContent, /Contributor: open web app to find similar issues/);
});

test('content script does nothing and does not throw when title is missing', async () => {
  const doc = fakeDocument(null);
  runContentScript(await read('content.js'), doc);
  assert.equal(doc.inserted.length, 0);
});
