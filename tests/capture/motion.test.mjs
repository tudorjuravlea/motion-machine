// `capture-motion` on a reference film the kit rendered from
// fixtures/capture/reference/pieces/cuts (a hard cut, a crossfade and a push at instants the
// kit's own schedule knows). Ground truth comes from schedule(), never from typed numbers.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';
import { schedule } from '../../runtime/kit/schedule.js';
import { captureMotion } from '../../scripts/capture-motion.mjs';

const PIECE = join(ROOT, 'fixtures/capture/reference/pieces/cuts');
const VIDEO = join(ROOT, 'fixtures/capture/reference/cuts.mp4');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const FRAME = 0.1 + 1e-6; // one frame at 10 fps

const KIND = { 'transitions/hard-cut': 'hard', 'transitions/crossfade': 'fade', 'transitions/push': 'push' };

let truth, sourceMotion, result, out, notes;

before(async () => {
  const story = read(join(PIECE, 'story.json'));
  const style = read(join(PIECE, 'style.json'));
  const patterns = {};
  for (const sc of story.scenes) patterns[sc.cut] = (await import(join(PIECE, 'patterns', sc.cut, 'pattern.js'))).default;
  const sched = schedule(story, style, { patterns });
  truth = sched.scenes.slice(1).map((s) => ({ t: s.start, kind: KIND[s.cut.pattern], d: s.cut.d }));
  sourceMotion = read(join(ROOT, style.from.motion));
  out = join(mkdtempSync(join(tmpdir(), 'mm-capture-')), 'captured.json');
  result = await captureMotion({ from: VIDEO, name: 'captured', out });
  notes = readFileSync(result.notesPath, 'utf8');
});

test('the reference has the three known cuts (sanity of the fixture)', () => {
  assert.deepEqual(truth.map((c) => c.kind), ['hard', 'fade', 'push']);
});

test('detected cuts are within one frame of the scheduled instants and their kinds match', () => {
  const cuts = result.analysis.cuts;
  assert.equal(cuts.length, truth.length, JSON.stringify(cuts));
  truth.forEach((c, i) => {
    assert.ok(Math.abs(cuts[i].t - c.t) <= FRAME, `cut ${i}: detected ${cuts[i].t}, scheduled ${c.t}`);
    assert.equal(cuts[i].kind, c.kind, `cut ${i} at ${c.t}`);
  });
  assert.equal(cuts[2].direction, 'left', 'the stub pushes the picture to the left');
});

test('pacing.energy matches the motion style that rendered the piece', () => {
  assert.equal(result.motion.pacing.energy, sourceMotion.pacing.energy);
});

test('the captured motion half validates against contracts/motion.schema.json', () => {
  const { motion } = validators();
  const written = read(out);
  assert.ok(motion(written), JSON.stringify(motion.errors));
  assert.equal(written.name, 'captured');
});

test('preferred transitions come from the observed kinds', () => {
  const t = result.motion.transitions;
  assert.equal(t.opening, 'transitions/hard-cut', 'opening = first cut kind');
  assert.equal(t.outro, 'transitions/push', 'outro = last cut kind');
  assert.equal(t.climax, 'transitions/push', 'climax = the cut before the longest shot in the last third');
});

test('composed with linen by a plain merge, motion.durations sit within 15 % of the source motion style', () => {
  const linen = read(join(ROOT, 'styles/brands/linen.json'));
  const { name, version, source, ...motionHalf } = read(out);
  const composed = { ...linen, ...motionHalf, name: 'linen-captured', from: { brand: 'styles/brands/linen.json', motion: out } };
  const { style } = validators();
  assert.ok(style(composed), JSON.stringify(style.errors));
  for (const role of ['quick', 'standard', 'slow', 'hold']) {
    const got = composed.motion.durations[role], want = sourceMotion.motion.durations[role];
    assert.ok(Math.abs(got - want) / want <= 0.15, `${role}: captured ${got} ms, source ${want} ms`);
  }
  // The same check through the kit: a title-stack story scheduled with each style.
  const story = read(join(ROOT, 'fixtures/kit-smoke/film/story.json'));
  const durs = (st) => schedule(story, st).items.filter((it) => !it.spring).map((it) => it.d);
  const a = durs(composed), b = durs({ ...linen, ...sourceMotion });
  a.forEach((d, i) => assert.ok(Math.abs(d - b[i]) / b[i] <= 0.15, `schedule item ${i}: ${d} s vs ${b[i]} s`));
});

test('capture-notes.md carries the shot list, the derived values and what was defaulted', () => {
  assert.match(notes, /## Shot list/);
  assert.equal((notes.match(/^\| \d+ \|/gm) ?? []).length, 4, 'four shots');
  assert.match(notes, /hard/);
  assert.match(notes, /fade/);
  assert.match(notes, /push/);
  assert.match(notes, /## Derived/);
  assert.match(notes, /## Defaulted/);
  assert.match(notes, /easings/);
  assert.match(notes, /spring/);
  assert.doesNotMatch(notes, /Named gap: no cuts observed/);
});

test('the CLI writes the motion half and its notes, and exits 2 on a missing video', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-capture-cli-'));
  const outCli = join(dir, 'cli-cap.json');
  const ok = spawnSync(process.execPath, [join(ROOT, 'scripts/capture-motion.mjs'), '--from', VIDEO, '--name', 'cli-cap', '--out', outCli], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(existsSync(outCli) && existsSync(join(dir, 'cli-cap.capture-notes.md')));
  const bad = spawnSync(process.execPath, [join(ROOT, 'scripts/capture-motion.mjs'), '--from', join(dir, 'nope.mp4'), '--name', 'x-y', '--out', join(dir, 'x.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /nope\.mp4/);
});
