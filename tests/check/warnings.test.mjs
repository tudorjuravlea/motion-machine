// The W- rules (SPEC §7): each negative warns with exactly its id and nothing else
// fails or warns; a rule whose measurement did not fully run reports SKIP (partial), never PASS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gate, warnsOnly, row, NEG } from './_harness.mjs';
import { subWarning } from '../../scripts/check/W-SUB.mjs';
import wMix from '../../scripts/check/W-MIX.mjs';
import wCaption from '../../scripts/check/W-CAPTION.mjs';
import wAmbient from '../../scripts/check/W-AMBIENT.mjs';
import wRead from '../../scripts/check/W-READ.mjs';
import { schedule } from '../../runtime/kit/schedule.js';

const run = gate();

const CASES = {
  'W-FADE-ONLY': ['W-FADE-ONLY', (r) => assert.equal(r.evidence.measured, 1)],
  'W-READ': ['W-READ', (r) => assert.equal(r.evidence.selector, '[data-scene="style"]')],
  'W-DUR-LITERAL': ['W-DUR-LITERAL', (r) => assert.equal(r.evidence.measured, '0.5')],
  'W-BAN': ['W-BAN', (r) => assert.equal(r.evidence.ban, 'frame-borders')],
  'W-CONTRAST/color': ['W-CONTRAST', (r) => assert.ok(r.evidence.measured < 1.5, `Review Focus 1: #888 on #777 measured ${r.evidence.measured}:1`)],
  'W-CONTRAST/pseudo': ['W-CONTRAST', (r) => assert.match(r.evidence.selector, /::after$/)],
  'W-CONTRAST/gradient': ['W-CONTRAST', (r) => { assert.equal(r.evidence.background, 'rendered'); assert.match(r.evidence.selector, /data-scene="notch"/); }],
  'W-PACE': ['W-PACE', (r) => assert.equal(r.evidence.measured, 8)],
  'W-ASK': ['W-ASK', (r) => assert.deepEqual(r.evidence.measured, ['type.display', 'type.text'])],
  'W-HOLD': ['W-HOLD', (r) => assert.equal(r.evidence.measured, 1.2)],
  'W-ENTRANCE': ['W-ENTRANCE', (r) => assert.match(r.evidence.selector, /data-scene="style".*div\.mark/)],
  'W-STAGGER': ['W-STAGGER', (r) => { assert.equal(r.evidence.selector, '[data-scene="style"] [data-slot="headline"]'); assert.ok(r.evidence.measured < 0.1); }],
  'W-AMBIENT': ['W-AMBIENT', (r) => assert.ok(r.evidence.measured > r.evidence.threshold)],
  'W-CAPTION': ['W-CAPTION', (r) => assert.equal(r.evidence.measured, 2)],
  'W-OVERSHOOT/declared': ['W-OVERSHOOT', (r) => { assert.equal(r.evidence.kind, 'declared'); assert.equal(r.evidence.selector, 'style.motion.spring.type'); }],
  'W-OVERSHOOT/measured': ['W-OVERSHOOT', (r) => { assert.equal(r.evidence.kind, 'measured'); assert.match(r.evidence.reason, /type passes its resting place/); }],
  'W-EMPTY': ['W-EMPTY', (r) => { assert.ok(r.evidence.measured > 6); assert.ok(Math.abs(r.evidence.instant - 5) < 0.05, String(r.evidence.instant)); }],
};

for (const [dir, [id, more]] of Object.entries(CASES)) {
  test(`fixtures/negatives/${dir} warns ${id} and nothing else`, async () => more(warnsOnly(await run(dir), id)));
}

test('W-SUB: the negative warns when checked as an export with --sub 4', async () => {
  const r = warnsOnly(await run('W-SUB', { sub: 4 }), 'W-SUB');
  assert.equal(r.evidence.selector, '[data-scene="style"] [data-slot="headline"]');
  assert.ok(r.evidence.measured > 4);
});

test('W-SUB: --sub 1 never warns; the exporter passes the piece folder; mm check without --sub skips it', async () => {
  const story = JSON.parse(readFileSync(join(NEG, 'W-SUB/story.json'), 'utf8'));
  assert.equal((await subWarning(story, 1)).status, 'PASS');
  assert.equal((await subWarning(story, 4)).status, 'SKIP', 'no folder, nothing measured');
  assert.equal((await subWarning(story, 4, { dir: join(NEG, 'W-SUB') })).status, 'WARN');
  const res = await run('W-SUB', { only: ['W-SUB'] });
  assert.equal(row(res, 'W-SUB').status, 'SKIP');
});

test('W-STAGGER: a hard cut and the film\'s first frame are exempt; the bases pass', async () => {
  const r = row(await run('_base/film', { only: ['W-STAGGER'] }), 'W-STAGGER');
  assert.equal(r.status, 'PASS');
});

// Partial measurements: SKIP with partial: true and the missing half named.
const ctxOf = (dir) => {
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  const style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
  return { dir, story, style, kind: story.kind, schedule: schedule(story, style), patternsBase: join(NEG, '_shared/patterns'), cache: {} };
};

test('W-MIX: clean cue structure without out/cues.json is SKIP (partial), not PASS', async () => {
  const ctx = ctxOf(join(NEG, 'W-CUE'));
  const r = await wMix(ctx);
  assert.equal(r.status, 'SKIP');
  assert.equal(r.evidence.partial, true);
  assert.match(r.evidence.reason, /peaks not measured/);
});

test('W-CAPTION: one group at a time but no words-per-group range is SKIP (partial)', async () => {
  const ctx = ctxOf(join(NEG, 'W-CAPTION'));
  ctx.page = { evaluate: async () => 0 };
  ctx.sample = async () => ({ probe: { elements: [] } });
  const r = await wCaption(ctx);
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /words-per-group not checked/);
  ctx.style.motion.captions = { wordsPerGroup: [1, 2] };
  assert.equal((await wCaption(ctx)).status, 'WARN', 'with a range, a long group warns');
});

test('W-AMBIENT: a moving scene with no rest is SKIP (partial), not PASS', async () => {
  const ctx = { kind: 'film', schedule: { scenes: [{ id: 'a', move: 'moves/idle-drift' }], holds: [], items: [] } };
  const r = await wAmbient(ctx);
  assert.equal(r.status, 'SKIP');
  assert.match(r.evidence.reason, /no rest to sample/);
});

// brag (MIT, restated): each line holds settled long enough to read, not only the scene as a whole.
// A label of 1-3 words needs 0.8 s; a longer line 0.3 s per word, at least 1.2 s; settled runs from
// the end of its entrance to its exit or its scene's end.
const readCtx = (edit) => {
  const ctx = ctxOf(join(NEG, '_base/film'));
  edit(ctx.story.scenes.find((sc) => sc.id === 'style').beats[1]);
  ctx.schedule = schedule(ctx.story, ctx.style);
  return ctx;
};

test('W-READ: the base film passes; a scene that fits can still hold one line too briefly', async () => {
  assert.equal((await wRead(ctxOf(join(NEG, '_base/film')))).status, 'PASS');
  const label = await wRead(readCtx((b) => { b.text = 'Brand.'; b.out = 1.6; }));
  assert.equal(label.status, 'WARN');
  assert.equal(label.evidence.kind, 'line');
  assert.equal(label.evidence.selector, '[data-scene="style"] [data-slot="sub"]');
  assert.equal(label.evidence.threshold, 0.8);
  assert.ok(label.evidence.measured < 0.8, `settled ${label.evidence.measured}`);
});

test('W-READ: a sentence needs 0.3 s a word and at least 1.2 s settled; a line that stays to its scene\'s end passes', async () => {
  const it = (ctx) => ctx.schedule.items.find((x) => x.selector === '[data-scene="style"] [data-slot="sub"]');
  const base = readCtx(() => {});
  const settledAt = it(base).start + it(base).d - base.schedule.scenes.find((sc) => sc.id === 'style').start;
  const long = await wRead(readCtx((b) => { b.out = settledAt + 1.5; }));   // 6 words: 1.8 s
  assert.equal(long.status, 'WARN');
  assert.equal(long.evidence.threshold, 1.8);
  assert.ok(Math.abs(long.evidence.measured - 1.5) < 0.01, `settled ${long.evidence.measured}`);
  const short = await wRead(readCtx((b) => { b.text = 'Brand and motion compose.'; b.out = settledAt + 1.0; }));   // 4 words: 1.2 s floor
  assert.equal(short.evidence.threshold, 1.2);
  assert.equal((await wRead(readCtx((b) => { b.out = settledAt + 1.9; }))).status, 'PASS');
});

test('W-STAGGER: an instant beat at a cut\'s start is revealed by the cut, not an arrival that fights it; an entrance there still warns', async () => {
  const { default: wStagger } = await import('../../scripts/check/W-STAGGER.mjs');
  const story = JSON.parse(readFileSync(new URL('../kit/media/sketch.json', import.meta.url), 'utf8'));
  const style = JSON.parse(readFileSync(new URL('../../styles/presets/editorial.json', import.meta.url), 'utf8'));
  const check = (s) => wStagger({ story: s, style, kind: s.kind, schedule: schedule(s, style), cache: {} });
  assert.equal((await check(story)).status, 'PASS', 'sketch-to-ink reveals its instant beats');
  const moving = structuredClone(story);
  delete moving.scenes[1].beats[1].params.instant;
  const r = await check(moving);
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.selector, '[data-scene="ink"] [data-slot="tile-1"]');
});
