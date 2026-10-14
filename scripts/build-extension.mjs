import { cp, rm, access } from 'node:fs/promises';
import { join } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const src = join(root, 'extension');
const out = join(root, 'dist-extension');
await access(join(src, 'manifest.json'));
await rm(out, { recursive: true, force: true });
await cp(src, out, { recursive: true, filter: (path) => !path.endsWith('README.md') });
console.log('Built unpacked browser extension at dist-extension/.');
