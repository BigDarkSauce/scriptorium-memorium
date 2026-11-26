#!/usr/bin/env node
/**
 * Assemble the complete browser application for static hosting.
 * Copies tracked runtime, example, documentation and local-launcher files;
 * excludes development tooling and GitHub workflow definitions.
 */
import { execFileSync } from 'node:child_process';
import { copyFile, lstat, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(root, process.argv[2] || '_site');
if (output === root || !output.startsWith(root + path.sep)) {
  throw new Error('Output directory must be a child of the repository root.');
}

const excluded = p =>
  p === '.gitignore' ||
  p.startsWith('.github/') ||
  p.startsWith('tools/') ||
  p.startsWith('_site/') ||
  p.startsWith('node_modules/');

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter(p => !excluded(p))
  .sort();

const required = [
  'index.html', 'css/app.css', 'js/main.js',
  'assets/scriptorium.png', 'assets/apple-touch-icon.png',
  'launcher/serve.py', 'launcher/serve.ps1',
  'Launch Scriptorium.bat', 'Launch Scriptorium with OpenAI.bat',
  'docs/OPENAI-LOCAL.md', 'docs/USER_GUIDE.md',
  'examples/room-example.json', 'schema/room.schema.json'
];
for (const p of required) {
  if (!tracked.includes(p)) throw new Error('Required deployment file is not tracked: ' + p);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
let bytes = 0;
for (const relative of tracked) {
  const source = path.resolve(root, relative);
  if (!source.startsWith(root + path.sep)) throw new Error('Unsafe tracked path: ' + relative);
  const info = await lstat(source);
  if (!info.isFile()) throw new Error('Deployment source must be a regular file: ' + relative);
  const destination = path.resolve(output, relative);
  if (!destination.startsWith(output + path.sep)) throw new Error('Unsafe output path: ' + relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  bytes += info.size;
}
const nojekyll = path.join(output, '.nojekyll');
try { await stat(nojekyll); } catch { await writeFile(nojekyll, '', 'utf8'); }

const exists = async p => {
  try { return (await stat(p)).isFile(); } catch { return false; }
};
const checkRef = async (fromFile, ref, kind) => {
  const value = ref.split(/[?#]/, 1)[0];
  if (!value || value.startsWith('#') || /^(?:[a-z]+:|\/\/)/i.test(value)) return;
  if (value.startsWith('/')) {
    throw new Error(kind + ' uses a root-absolute path that breaks on project Pages URLs: ' + fromFile + ' -> ' + ref);
  }
  const target = path.resolve(path.dirname(path.join(output, fromFile)), decodeURIComponent(value));
  if (!target.startsWith(output + path.sep) || !(await exists(target))) {
    throw new Error('Missing local ' + kind + ': ' + fromFile + ' -> ' + ref);
  }
};

const html = await readFile(path.join(output, 'index.html'), 'utf8');
for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  await checkRef('index.html', match[1], 'HTML asset');
}

const jsFiles = tracked.filter(p => p.endsWith('.js') || p.endsWith('.mjs'));
const cssFiles = tracked.filter(p => p.endsWith('.css'));
for (const file of jsFiles) {
  const source = await readFile(path.join(output, file), 'utf8');
  const patterns = [
    /^\s*import\s+[^;\n]*?\s+from\s*["']([^"']+)["']/gm,
    /^\s*export\s+[^;\n]*?\s+from\s*["']([^"']+)["']/gm,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s*["']([^"']+)["']/gm
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier.startsWith('.')) await checkRef(file, specifier, 'module import');
      else if (specifier.startsWith('/')) throw new Error('Root-absolute module import breaks on project Pages URLs: ' + file + ' -> ' + specifier);
    }
  }
}
for (const file of cssFiles) {
  const source = await readFile(path.join(output, file), 'utf8');
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const ref = match[1].trim();
    if (!ref.startsWith('/') && !/^(?:[a-z]+:|\/\/|data:)/i.test(ref)) {
      await checkRef(file, ref, 'CSS asset');
    }
    if (ref.startsWith('/')) throw new Error('Root-absolute CSS asset breaks on project Pages URLs: ' + file + ' -> ' + ref);
  }
}

console.log('Pages build ready: ' + tracked.length + ' files, ' + (bytes / 1024 / 1024).toFixed(2) + ' MiB -> ' + path.relative(root, output));
console.log('Checked index resources, local JavaScript module imports and CSS asset URLs.');
