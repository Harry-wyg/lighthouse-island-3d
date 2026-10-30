// Package only the browser app. Images and videos remain on Cloudinary.
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const out = new URL('dist/', root);
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const name of ['index.html', 'lite.html', 'assets-preview.html', 'css', 'js', 'vendor']) {
  await cp(new URL(`public/${name}`, root), new URL(name, out), { recursive: true });
}
const entry = new URL('index.html', out);
const html = await readFile(entry, 'utf8');
await writeFile(entry, html.replace('<head>', '<head>\n<meta name="island-mode" content="static">'));
await writeFile(new URL('.nojekyll', out), '');
console.log(`GitHub Pages build ready: ${fileURLToPath(out)}`);
