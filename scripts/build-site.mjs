import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { assets } from './site-assets.mjs';
import './build-pwa.mjs';

const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of [...assets, 'sw.js']) {
  const target = new URL(asset, output);
  await mkdir(new URL('./', target), { recursive: true });
  await copyFile(new URL(asset, root), target);
}
await writeFile(new URL('.nojekyll', output), '');
console.log('Static site ready in dist/ (root domain or repository subpath).');
