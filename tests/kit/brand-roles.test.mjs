// The role rules a captured or merged palette goes through before anyone reviews it: contrast pairs,
// the muted fix, accent sanity, the ink on the accent and on a surface, and the questions left for a person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contrast } from '../../scripts/capture-brand.mjs';
import { deltaE, fixToward, pairsOf, reviewRoles } from '../../scripts/lib/brand-roles.mjs';

const role = (hex, confidence = 'measured', extra = {}) => ({ hex, confidence, source: 'site', evidence: 'test', ...extra });
const base = () => ({
  canvas: role('#F4EFE6'), ink: role('#1F2A20'), muted: role('#5F7D68'), surface: role('#FBF8F1'),
  line: role('#C9C2B5'), accent: role('#E9573F'), accentInk: role('#1F2A20'),
});

test('deltaE is 0 for one colour and large between black and white', () => {
  assert.equal(Math.round(deltaE('#336699', '#336699')), 0);
  assert.ok(deltaE('#000000', '#FFFFFF') > 99);
});

test('fixToward moves a colour toward a target until the contrast is met, and no further', () => {
  const r = fixToward('#9AA39C', '#1F2A20', '#F4EFE6', 4.5);
  assert.ok(contrast(r.hex, '#F4EFE6') >= 4.5, `got ${contrast(r.hex, '#F4EFE6')}`);
  assert.ok(contrast(r.hex, '#F4EFE6') < 5.2, 'stops near the target, not at the ink');
  assert.ok(r.t > 0 && r.t < 1);
  assert.equal(fixToward('#1F2A20', '#000000', '#F4EFE6', 4.5).t, 0, 'already passing: unchanged');
});

test('pairsOf lists every text-on-background pair with its ratio, need and verdict', () => {
  const p = pairsOf({ canvas: '#F4EFE6', ink: '#1F2A20', muted: '#5F7D68', surface: '#FBF8F1', line: '#C9C2B5', accent: '#E9573F', accentInk: '#1F2A20' });
  const by = Object.fromEntries(p.map((x) => [`${x.fg}/${x.bg}`, x]));
  for (const k of ['ink/canvas', 'muted/canvas', 'accent/canvas', 'accentInk/accent', 'ink/surface', 'line/canvas']) assert.ok(by[k], k);
  assert.equal(by['ink/canvas'].need, 4.5);
  assert.equal(by['ink/canvas'].pass, true);
  assert.equal(typeof by['accent/canvas'].ratio, 'number');
  assert.equal(by['ink/surface'].fg, 'ink', 'without surfaceInk the surface carries ink');
  const withSi = pairsOf({ ...Object.fromEntries(p.map(() => [])), canvas: '#F4EFE6', ink: '#1F2A20', muted: '#5F7D68', surface: '#202020', line: '#C9C2B5', accent: '#E9573F', accentInk: '#1F2A20', surfaceInk: '#F4EFE6' });
  assert.ok(withSi.some((x) => x.fg === 'surfaceInk' && x.bg === 'surface'));
});

test('a measured muted under 4.5:1 is fixed toward the ink and the fix is recorded', () => {
  const r = reviewRoles({ ...base(), muted: role('#A9B3AB') });
  assert.ok(contrast(r.roles.muted.hex, '#F4EFE6') >= 4.5);
  assert.equal(r.roles.muted.fixed.from, '#A9B3AB');
  assert.equal(r.roles.muted.fixed.to, r.roles.muted.hex);
  assert.match(r.roles.muted.fixed.why, /4\.5/);
  assert.ok(!r.ask.some((a) => a.role === 'muted'));
});

test('an exact or hand-set muted under 4.5:1 is never changed: it becomes a question with the fix as an option', () => {
  for (const c of ['exact', 'set']) {
    const r = reviewRoles({ ...base(), muted: role('#A9B3AB', c) });
    assert.equal(r.roles.muted.hex, '#A9B3AB');
    const q = r.ask.find((a) => a.role === 'muted');
    assert.ok(q, c);
    assert.ok(q.options.some((o) => contrast(o.value, '#F4EFE6') >= 4.5));
    assert.ok(q.options.some((o) => o.value === '#A9B3AB'), 'keeping it is an option');
  }
});

test('an accent that is the ink (or the canvas) is a warning and a question', () => {
  const r = reviewRoles({ ...base(), accent: role('#1F2A20') });
  assert.ok(r.warnings.some((w) => w.id === 'accent-like-ink'));
  assert.ok(r.ask.some((a) => a.role === 'accent'));
  const c = reviewRoles({ ...base(), accent: role('#F2EDE4') });
  assert.ok(c.warnings.some((w) => w.id === 'accent-like-canvas'));
});

test('a grey accent warns', () => {
  const r = reviewRoles({ ...base(), accent: role('#8A8A8A') });
  assert.ok(r.warnings.some((w) => w.id === 'accent-grey'));
});

test('an accent under 3:1 on the canvas turns accentText off; between 3 and 4.5 it is large-text only', () => {
  const low = reviewRoles({ ...base(), accent: role('#F7C948') });
  assert.equal(low.accentText, false);
  assert.ok(low.notes.some((n) => /accentText/.test(n)));
  const mid = reviewRoles({ ...base(), accent: role('#E9573F') });
  assert.equal(mid.accentText, true);
  assert.ok(mid.warnings.some((w) => w.id === 'accent-large-only'));
  const fine = reviewRoles({ ...base(), accent: role('#A3271A') });
  assert.equal(fine.accentText, true);
  assert.ok(!fine.warnings.some((w) => w.id === 'accent-large-only'));
});

test('a measured accentInk that fails on the accent is replaced by the better of ink and canvas', () => {
  const r = reviewRoles({ ...base(), accent: role('#1F4FA8'), accentInk: role('#1A1A40') });
  assert.equal(r.roles.accentInk.hex, '#F4EFE6');
  assert.ok(r.roles.accentInk.fixed);
  const exact = reviewRoles({ ...base(), accent: role('#1F4FA8'), accentInk: role('#1A1A40', 'exact') });
  assert.equal(exact.roles.accentInk.hex, '#1A1A40');
  assert.ok(exact.ask.some((a) => a.role === 'accentInk'));
});

test('a failing accentInk is only replaced by one that reads better than it does', () => {
  // #FFF7F0 reads 4.2:1 on #D2491F; the canvas #F6F1E7 only 3.96:1 and the ink 3.3:1: keep it, and warn
  const r = reviewRoles({ ...base(), canvas: role('#F6F1E7'), ink: role('#1B2A2F'), accent: role('#D2491F'), accentInk: role('#FFF7F0') });
  assert.equal(r.roles.accentInk.hex, '#FFF7F0');
  assert.equal(r.roles.accentInk.fixed, undefined);
  assert.ok(r.warnings.some((w) => w.id === 'accent-ink-weak'));
});

test('a dark surface gets a surfaceInk that reads on it', () => {
  const r = reviewRoles({ ...base(), surface: role('#22302A') });
  assert.ok(r.roles.surfaceInk, 'surfaceInk derived');
  assert.ok(contrast(r.roles.surfaceInk.hex, '#22302A') >= 4.5);
  assert.equal(reviewRoles(base()).roles.surfaceInk, undefined, 'none when ink reads on the surface');
});

test('a surface equal to the canvas warns; an invisible line warns', () => {
  const r = reviewRoles({ ...base(), surface: role('#F4EFE6'), line: role('#F2EDE4') });
  assert.ok(r.warnings.some((w) => w.id === 'surface-same-as-canvas'));
  assert.ok(r.warnings.some((w) => w.id === 'line-invisible'));
});

test('weak ink warns; ink under 4.5:1 is also a question', () => {
  const weak = reviewRoles({ ...base(), ink: role('#55605A') });
  assert.ok(weak.warnings.some((w) => w.id === 'ink-weak'));
  const bad = reviewRoles({ ...base(), ink: role('#9AA39C'), muted: role('#C0C7C1') });
  assert.ok(bad.ask.some((a) => a.role === 'ink'));
});

test('a muted that is not quieter than the ink warns', () => {
  const r = reviewRoles({ ...base(), ink: role('#4A5650'), muted: role('#101510') });
  assert.ok(r.warnings.some((w) => w.id === 'muted-not-quieter'));
});

test('every guessed role is a question to confirm', () => {
  const r = reviewRoles({ ...base(), surface: role('#FBF8F1', 'guess'), line: role('#C9C2B5', 'guess') });
  assert.ok(r.ask.some((a) => a.role === 'surface'));
  assert.ok(r.ask.some((a) => a.role === 'line'));
});

test('the input is not changed, and the same input gives the same review', () => {
  const input = { ...base(), muted: role('#A9B3AB') };
  const copy = structuredClone(input);
  const a = reviewRoles(input); const b = reviewRoles(input);
  assert.deepEqual(input, copy);
  assert.deepEqual(a, b);
});
