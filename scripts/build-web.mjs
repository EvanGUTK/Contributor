import { mkdir, copyFile, cp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
const root = new URL('../', import.meta.url).pathname;
const out = join(root, 'dist');
await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'lib'), { recursive: true });
for (const name of ['index.html', 'setup.html', '404.html', 'app.mjs', 'styles.css']) await copyFile(join(root, 'web', name), join(out, name));
await cp(join(root, 'web/assets'), join(out, 'assets'), { recursive: true });
// Copy root-level assets (e.g. contributor-banner.svg used by og:image meta tags)
await cp(join(root, 'assets'), join(out, 'assets'), { recursive: true });
await copyFile(join(root, 'packages/core/matching.mjs'), join(out, 'lib/matching.mjs'));
// GitHub client imports ../core/matching.mjs in the monorepo; the deploy bundle needs a rewritten local import.
let github = (await import('node:fs/promises')).readFile;
const source = await github(join(root, 'packages/github/client.mjs'), 'utf8');
await (await import('node:fs/promises')).writeFile(join(out, 'lib/github.mjs'), source.replace("'../core/matching.mjs'", "'./matching.mjs'"));
console.log('Built zero-dependency static web app at dist/.');
