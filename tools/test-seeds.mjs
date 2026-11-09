#!/usr/bin/env node
// Seed versioning (js/seeds-version.js): an untouched copy of any shipped version of a built-in scene is recognised as
// one (and refreshed by the app); a copy with the learner's edits is not. Run: node tools/test-seeds.mjs
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { sceneFp, isSeedCopy } = await import(pathToFileURL(join(ROOT, 'js/seeds-version.js')).href);
const { FLAGSHIPS } = await import(pathToFileURL(join(ROOT, 'js/seeds-scenes.js')).href);
let bad = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) bad++; };
const C = o => JSON.parse(JSON.stringify(o)), water = FLAGSHIPS[0];
// a copy as a room stores it: a JSON copy plus the part's purpose, lessons migrated, slider values used
const cur = { ...C(water), purpose: 'x', values: { sun: 1.2 } }; cur.lessons = cur.lessons.slice(0, 2);
ok(isSeedCopy(cur), 'the current water cycle, with purpose / values / migrated lessons, is a seed copy');
ok(sceneFp(cur) === sceneFp(water), 'its fingerprint is the seed\'s');
// the round-5 valley (cone mountains): an old version from the history
let old = null; try { const dir = mkdtempSync(join(tmpdir(), 'seedtest-')); for (const f of ['seeds-scenes.js', 'seeds-sources.js', 'seeds-figures.js']) { try { writeFileSync(join(dir, f), execSync(`git show 67bce98:js/${f}`, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { } } writeFileSync(join(dir, 'package.json'), '{"type":"module"}'); old = (await import(pathToFileURL(join(dir, 'seeds-scenes.js')).href)).FLAGSHIPS[0]; } catch (e) { }
if (old) { const o = { ...C(old), purpose: 'p' }; ok(o.bodies.some(b => b.shape.kind === 'mountain') && isSeedCopy(o), 'the round-5 water cycle (cone mountains) is recognised as an old seed copy'); }
else console.log('skip  the round-5 version (git history not available)');
const moved = C(cur); moved.overrides = { 'ground/0': { p: [1, 0, 0] } }; ok(!isSeedCopy(moved), 'a copy with an object moved or retinted (overrides) is the learner\'s');
const added = C(cur); added.bodies.push({ id: 'add-1', shape: { kind: 'box' } }); ok(!isSeedCopy(added), 'a copy with an added object is the learner\'s');
const removed = C(cur); removed.bodies.pop(); ok(!isSeedCopy(removed), 'a copy with an object removed is the learner\'s');
const recoded = C(cur); recoded.code += '\n// mine'; ok(!isSeedCopy(recoded), 'a copy whose code was rewritten is the learner\'s');
const stamped = C(added); stamped.seedFp = sceneFp(added); ok(isSeedCopy(stamped), 'a copy stamped with its own fingerprint (seedFp) is a seed copy');
console.log(bad ? `${bad} failed` : 'all passed'); process.exit(bad ? 1 : 0);
