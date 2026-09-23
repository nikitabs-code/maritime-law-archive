import { copyFile, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '_site');
const files = [
  'index.html', 'app.js', 'styles.css',
  'assets/maritime-ship-emblem.png',
  'assets/lucide.min.js', 'assets/lucide-LICENSE',
  'data/laws.js', 'data/import-template.json', 'data/AUDIT-2026-09-05.md',
];

// An explicit allowlist keeps local administration and unrelated projects private.
for (const file of files) {
  let path = root;
  for (const part of file.split('/')) {
    path = join(path, part);
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Symlink rejected: ${file}`);
  }
  if (!(await lstat(path)).isFile()) throw new Error(`Not a file: ${file}`);
}
const html = await readFile(join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)(?:[?#][^"]*)?"/g)) {
  if (!files.includes(match[1])) throw new Error(`Missing public asset: ${match[1]}`);
}
await rm(output, { recursive: true, force: true });
await mkdir(output);
for (const file of files) {
  await mkdir(dirname(join(output, file)), { recursive: true });
  await copyFile(join(root, file), join(output, file));
}
const hashes = new Map();
for (const file of files) {
  hashes.set(file, createHash('sha256').update(await readFile(join(root, file))).digest('hex').slice(0, 12));
}
const versioned = html.replace(/((?:src|href)="\.\/)([^"?#]+)(?:\?[^"#]*)?(")/g,
  (match, prefix, file, suffix) => /\.(?:js|css|png)$/.test(file)
    ? `${prefix}${file}?v=${hashes.get(file)}${suffix}` : match);
await writeFile(join(output, 'index.html'), versioned);
await writeFile(join(output, '.nojekyll'), '');
const actual = (await readdir(output, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile());
if (actual.length !== files.length + 1) throw new Error('Unexpected public file count');
console.log(`Public site ready: _site (${actual.length} files; admin and workspace files excluded)`);
