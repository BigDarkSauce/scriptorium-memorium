#!/usr/bin/env node
// The loci review schedule must share the retrieval ledger without contaminating transfer accuracy.
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
const {
  ensureLocusReviewCard,
  locusReviewId,
  rateLocusRecall,
  removeLocusReviewCard,
  ledgerNow,
  stats
} = await import('../js/room/reveal.js');

const bookId = 'book-review-test';
const partId = 'chapter-review-test';
const node = {
  id: 'selective-transport',
  title: 'Selective transport',
  question: 'Why does removing the channel alter movement?',
  summary: 'The channel supplies a route through the membrane.'
};
const id = locusReviewId(bookId, partId, node.id);
assert.equal(id, 'locus/book-review-test/chapter-review-test/selective-transport');

const first = await ensureLocusReviewCard(bookId, partId, 'Membranes', node);
assert.equal(first.id, id);
assert.ok(first.due <= Date.now(), 'a newly assigned concept is due for its first retrieval attempt');
assert.equal(first.interval, 1);
assert.equal(first.attempts, 0);
assert.deepEqual(first.history, []);
assert.equal(ledgerNow().e[id].tr.memoryLocus, true);
assert.equal(ledgerNow().e[id].tr.recall, true);
assert.equal(ledgerNow().e[id].tr.q, node.question);
assert.equal(ledgerNow().e[id].tr.a, node.summary);

const again = await rateLocusRecall(id, false);
assert.equal(again.lastRating, 'again');
assert.equal(again.attempts, 1);
assert.equal(again.interval, 1, 'a recall needing another pass should return to a one-day interval');
assert.deepEqual(again.history, [0]);
assert.ok(again.due >= Date.now() + 864e5 - 1000 && again.due <= Date.now() + 864e5 + 1000);

const accurate = await rateLocusRecall(id, true);
assert.equal(accurate.lastRating, 'recalled');
assert.equal(accurate.attempts, 2);
assert.equal(accurate.interval, 2.5, 'an accurate recall should expand the interval using the shared 2.5 multiplier');
assert.deepEqual(accurate.history, [0, 1]);
assert.ok(accurate.due >= Date.now() + 2.5 * 864e5 - 1000);

const refreshed = await ensureLocusReviewCard(bookId, partId, 'Membranes', {
  ...node,
  question: 'What role does the channel play?'
});
assert.equal(refreshed.id, id);
assert.equal(refreshed.attempts, 2, 'reopening a loci route must preserve its review schedule');
assert.deepEqual(refreshed.history, [0, 1]);
assert.equal(ledgerNow().e[id].tr.q, 'What role does the channel play?');

const totals = await stats();
assert.equal(totals.transfers, 0, 'self-rated loci recall must not be counted as objective transfer accuracy');
assert.equal(totals.cards, 1, 'the loci item should participate in the shared review-card total');
assert.equal(totals.due, 0, 'the accurately recalled item should now be scheduled in the future');

assert.equal(await removeLocusReviewCard(bookId, partId, node.id), true);
assert.equal(ledgerNow().e[id], undefined, 'removing a memory place must remove its associated review card');
assert.equal(await removeLocusReviewCard(bookId, partId, node.id), false);

console.log('PASS  loci review cards share the spaced ledger, preserve history, schedule again/recalled intervals and stay outside transfer accuracy');
process.exit(0);
