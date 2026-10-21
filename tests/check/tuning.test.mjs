// The style's `gate` block (SPEC §3, §7): a brand studio tunes the soft thresholds (W-LENGTH, W-DEAD,
// W-QUIET, W-READ, and the looks W-BAN detects). Hard rules are never tunable: a `gate` entry naming
// a G- rule, or any unknown key, is a contract error (exit 2). Each tuned rule reports the threshold it used.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { gate, row, NEG } from './_harness.mjs';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { SetupError, TUNED_BY } from '../../scripts/check.mjs';
import { validators } from '../../scripts/lib/validate.mjs';
import { compose } from '../../scripts/compose.mjs';
import { timingRules, floors } from '../../scripts/check/timing.mjs';
import { prepare } from './_timing-snapshot.mjs';

const run = gate();
const made = [];
after(() => { for (const d of made) rmSync(d, { recursive: true, force: true }); });

/** A copy of fixtures/negatives/<dir> (same depth, so its relative paths still resolve) whose style carries `gateBlock`. */
function tuned(dir, gateBlock) {
  const copy = join(NEG, `.tmp-tuning-${process.pid}-${made.length}`);
  made.push(copy);
  rmSync(copy, { recursive: true, force: true });
  cpSync(join(NEG, dir), copy, { recursive: true, filter: (p) => !p.includes('/out') });
  const file = join(copy, 'style.json');
  writeFileSync(file, `${JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), gate: gateBlock }, null, 2)}\n`);
  return copy;
}

const only = (id) => ({ only: [id] });

test('a style that widens the length band makes a 15 s film pass W-LENGTH, and reports the band it used', async () => {
  const before = row(await run('W-LENGTH', only('W-LENGTH')), 'W-LENGTH');
  assert.equal(before.status, 'WARN');
  const res = await run(tuned('W-LENGTH', { length: { filmS: [10, 90] } }));
  const r = row(res, 'W-LENGTH');
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.threshold, '10–90s');
  assert.deepEqual(res.rules.filter((x) => x.status === 'FAIL' || x.status === 'WARN'), []);
  assert.equal(res.code, 0);
});

test('a band that is still too narrow warns, naming the tuned band', async () => {
  const r = row(await run(tuned('W-LENGTH', { length: { filmS: [20, 40] } }), only('W-LENGTH')), 'W-LENGTH');
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.threshold, '20–40s');
});

test('a wider dead-air window passes W-DEAD and reports it', async () => {
  const r = row(await run(tuned('W-DEAD', { deadS: 6 }), only('W-DEAD')), 'W-DEAD');
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.threshold, 6);
  assert.equal(r.evidence.measured, 4.8);
});

test('a shorter quiet tail passes W-QUIET and reports it', async () => {
  const r = row(await run(tuned('W-QUIET/film', { quietS: 1 }), only('W-QUIET')), 'W-QUIET');
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.threshold, 1);
});

test('a faster reading speed passes W-READ and reports the speed and floors it used', async () => {
  const r = row(await run(tuned('W-READ', { read: { perWordS: 0.15 } }), only('W-READ')), 'W-READ');
  assert.equal(r.status, 'PASS');
  assert.equal(r.evidence.perWord, 0.15);
  assert.equal(r.evidence.label, 0.8);
  assert.equal(r.evidence.sentence, 1.2);
});

test('a reading speed that is still too slow warns, naming the speed it used', async () => {
  const r = row(await run(tuned('W-READ', { read: { perWordS: 0.25 } }), only('W-READ')), 'W-READ');
  assert.equal(r.status, 'WARN');
  assert.equal(r.evidence.perWord, 0.25);
  assert.equal(r.evidence.measured, 6.45);
});

test('a lifted ban silences that W-BAN finding only', async () => {
  const warns = row(await run('W-BAN', only('W-BAN')), 'W-BAN');
  assert.equal(warns.evidence.ban, 'frame-borders');
  const other = row(await run(tuned('W-BAN', { liftBans: ['corner-labels'] }), only('W-BAN')), 'W-BAN');
  assert.equal(other.status, 'WARN', 'lifting another look leaves frame-borders warning');
  assert.equal(other.evidence.ban, 'frame-borders');
  const lifted = row(await run(tuned('W-BAN', { liftBans: ['frame-borders'] }), only('W-BAN')), 'W-BAN');
  assert.equal(lifted.status, 'PASS');
  assert.deepEqual(lifted.evidence.lifted, ['frame-borders']);
  assert.deepEqual(lifted.evidence.bans, ['centered-title-on-gradient', 'corner-labels'], 'the other looks are still checked');
});

test('a lifted ban leaves W-FADE-ONLY alone: only the three looks W-BAN detects can be lifted', () => {
  const style = JSON.parse(readFileSync(join(NEG, 'W-FADE-ONLY/style.json'), 'utf8'));
  assert.equal(validators().style({ ...style, gate: { liftBans: ['frame-borders'] } }), true);
  assert.equal(validators().style({ ...style, gate: { liftBans: ['fade-only'] } }), false);
});

test('a gate key naming a G- rule is a contract error, and mm check exits 2', async () => {
  const copy = tuned('W-LENGTH', { 'G-LEGIBLE': { floor: 10 } });
  await assert.rejects(() => run(copy), (e) => e instanceof SetupError && /gate/.test(e.message) && /G-LEGIBLE/.test(e.message) && /hard/.test(e.message));
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'check', copy], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /G-LEGIBLE/);
});

test('the run and the console summary name the warning rules the style\'s gate block tuned', async () => {
  const copy = tuned('W-LENGTH', { length: { filmS: [10, 90] }, read: { perWordS: 0.2 }, liftBans: ['frame-borders'] });
  assert.deepEqual((await run(copy, only('W-LENGTH'))).tuned, ['W-LENGTH', 'W-READ', 'W-BAN']);
  assert.deepEqual((await run('W-LENGTH', only('W-LENGTH'))).tuned, [], 'no gate block, nothing tuned');
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'check', copy], { encoding: 'utf8', timeout: 180_000 });
  assert.match(r.stdout, /Tuned by the style's gate block: W-LENGTH, W-READ, W-BAN\./, r.stdout.slice(-400));
  assert.deepEqual(JSON.parse(readFileSync(join(copy, 'out', 'check.json'), 'utf8')).tuned, ['W-LENGTH', 'W-READ', 'W-BAN']);
  const plain = spawnSync(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'check', join(NEG, 'W-LENGTH')], { encoding: 'utf8', timeout: 180_000 });
  assert.doesNotMatch(plain.stdout, /Tuned by/);
});

test('every key the motion schema allows in a gate block maps to the warning rule it tunes', () => {
  const keys = Object.keys(JSON.parse(readFileSync(join(ROOT, 'contracts', 'motion.schema.json'), 'utf8')).properties.gate.properties);
  assert.ok(keys.every((k) => /^W-/.test(TUNED_BY[k] ?? '')), `gate keys: ${keys}`);
});

test('a G- rule named at any depth of the gate block, in any case, gets the hard-rule hint', async () => {
  for (const gate of [{ read: { 'G-LEGIBLE': 1 } }, { 'g-legible': { floor: 10 } }, { length: { 'g-Brand': 1 } }]) {
    await assert.rejects(() => run(tuned('W-LENGTH', gate)), (e) => e instanceof SetupError && /hard rules and cannot be tuned/.test(e.message), JSON.stringify(gate));
  }
});

test('an unknown gate key, or an unknown key inside a group, is a contract error', async () => {
  await assert.rejects(() => run(tuned('W-LENGTH', { lengthS: [1, 2] })), (e) => e instanceof SetupError && /lengthS/.test(e.message));
  await assert.rejects(() => run(tuned('W-LENGTH', { length: { moviesS: [1, 2] } })), (e) => e instanceof SetupError && /moviesS/.test(e.message));
});

test('the style schema refuses a band that is not two numbers and a negative threshold', () => {
  const style = JSON.parse(readFileSync(join(NEG, 'W-LENGTH/style.json'), 'utf8'));
  const ok = (g) => validators().style({ ...style, gate: g });
  assert.equal(ok({ length: { filmS: [10, 90] }, deadS: 6, quietS: 1, read: { perWordS: 0.2, labelS: 0.6, sentenceS: 1 }, liftBans: ['frame-borders'] }), true);
  assert.equal(ok({ length: { filmS: [10] } }), false);
  assert.equal(ok({ deadS: -1 }), false);
  assert.equal(ok({ read: { perWordS: 0 } }), false);
});

test('compose carries the motion half\'s gate block into the style; a half without one adds none', () => {
  const dir = join(ROOT, 'styles', 'motion');
  const half = JSON.parse(readFileSync(join(dir, 'calm.json'), 'utf8'));
  assert.equal('gate' in compose({ brand: 'paper', motion: 'calm' }), false);
  const copy = join(NEG, `.tmp-tuning-${process.pid}-motion`);
  made.push(copy);
  mkdirSync(copy, { recursive: true });
  const file = join(copy, 'calm-tuned.json');
  writeFileSync(file, JSON.stringify({ ...half, name: 'calm-tuned', gate: { quietS: 1, liftBans: ['frame-borders'] } }));
  const style = compose({ brand: 'paper', motion: file, from: { brand: 'a', motion: 'b' } });
  assert.deepEqual(style.gate, { quietS: 1, liftBans: ['frame-borders'] });
  writeFileSync(file, JSON.stringify({ ...half, name: 'calm-tuned', gate: { 'G-TIME': true } }));
  assert.throws(() => compose({ brand: 'paper', motion: file, from: { brand: 'a', motion: 'b' } }), /invalid/);
});

test('the live gate and its floors read the same tuned thresholds', async () => {
  const ctx = (await prepare('fixtures/negatives/W-READ'))['16x9'];
  const fast = { ...ctx.style, gate: { read: { perWordS: 0.15 } } };
  const slow = (rows) => rows.find((r) => r.id === 'W-READ');
  assert.equal(slow(await timingRules(ctx)).status, 'WARN');
  assert.equal(slow(await timingRules({ ...ctx, style: fast })).status, 'PASS');
  const min = (style) => floors(ctx.schedule, ctx.story, style).scenes.find((s) => s.id === 'style').minDuration;
  assert.ok(min(fast) < min(ctx.style), `${min(fast)} < ${min(ctx.style)}`);
});
