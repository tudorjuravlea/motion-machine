// data/unit-stack: a figure built from countable plates. One plate is one stated unit; the last
// plate may be a part of one. Plates land on a schedule that speeds up as the stack rises, and the
// figure shown is always the landed plates times the unit (never a roll on the clock), reaching the
// fact's value exactly when the last plate lands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, landedAt, shownAt, niceUnit, decimalsOf, figureFix, groupDigits } from '../../patterns/data/unit-stack/pattern.js';

test('unit-stack: one plate per unit, the last one a part when the value is not a multiple', () => {
  const a = plan(37, { unit: 1, d: 2 });
  assert.equal(a.n, 37);
  assert.equal(a.frac, 1);
  const b = plan(37.5, { unit: 1, d: 2 });
  assert.equal(b.n, 38);
  assert.ok(Math.abs(b.frac - 0.5) < 1e-9, `the last plate is half: ${b.frac}`);
  const c = plan(12000, { unit: 1000, d: 2 });
  assert.equal(c.n, 12);
  assert.equal(c.unit, 1000);
});

test('unit-stack: landings rise, speed up as the stack grows, and the last lands at the end', () => {
  const { lands, fall } = plan(30, { unit: 1, d: 2.4 });
  assert.equal(lands.length, 30);
  assert.ok(lands[0] >= fall - 1e-9, 'the first plate has room to fall');
  for (let k = 1; k < lands.length; k++) assert.ok(lands[k] > lands[k - 1], `plate ${k} lands after plate ${k - 1}`);
  assert.ok(Math.abs(lands.at(-1) - 2.4) < 1e-9, `the last plate lands at the end: ${lands.at(-1)}`);
  const gaps = lands.slice(1).map((t, k) => t - lands[k]);
  assert.ok(gaps.at(-1) < gaps[0], `the cascade speeds up: first gap ${gaps[0]}, last ${gaps.at(-1)}`);
});

test('unit-stack: the figure shown is the landed plates times the unit, the value exactly at rest', () => {
  const p = plan(37.5, { unit: 2.5, d: 2 });
  for (let u = 0; u <= 2.2; u += 0.01) {
    const k = landedAt(p, u);
    assert.equal(k, p.lands.filter((t) => t <= u).length, `landed count at ${u}`);
    assert.equal(shownAt(p, u), Math.min(k * p.unit, 37.5), `shown figure at ${u}`);
  }
  assert.equal(shownAt(p, 2), 37.5);
  assert.equal(shownAt(p, Infinity), 37.5, 'a deck rest (u = Infinity) shows the value');
  assert.equal(shownAt(p, 0), 0);
});

test('unit-stack: more than 100 plates take a coarser 1-2-5 unit, so every plate stays countable', () => {
  assert.equal(niceUnit(1, 250), 5);
  assert.equal(niceUnit(1, 100), 1);
  assert.equal(niceUnit(10, 3000), 50);
  assert.equal(niceUnit(1, 1001), 20);
  const p = plan(250, { unit: 1, d: 2 });
  assert.equal(p.unit, 5);
  assert.equal(p.n, 50);
  assert.ok(p.coarsened, 'the plan says the unit changed, so the rule line can state it');
});

test('unit-stack: pure: the same input gives the same plan; bad input gives no plates', () => {
  assert.deepEqual(plan(42, { unit: 2, d: 1.5 }), plan(42, { unit: 2, d: 1.5 }));
  for (const v of [0, -3, NaN]) assert.equal(plan(v, { unit: 1, d: 1 }).n, 0);
  assert.equal(plan(5, { unit: 0, d: 1 }).unit, 1, 'a unit that is not positive falls back to 1');
});

test('unit-stack: with no fix given, the figure keeps the value\'s own precision (and the unit\'s)', () => {
  assert.equal(decimalsOf(7.3), 1);
  assert.equal(decimalsOf(100.5), 1);
  assert.equal(decimalsOf(46), 0);
  assert.equal(decimalsOf(0.125), 3);
  assert.equal(decimalsOf(0.1 + 0.2), 1, 'float noise is not precision');
  assert.equal(decimalsOf(0.123456), 4, 'at most four places');
  assert.equal(figureFix(7.3, 1), 1, '7.3 at 1 a plate rests on 7.3, not 7');
  assert.equal(figureFix(100.5, 2), 1, '100.5 rests on 100.5, not 101');
  assert.equal(figureFix(46, 2), 0);
  assert.equal(figureFix(37, 2.5), 1, 'a unit with decimals keeps the climbing figure steady');
  assert.equal(figureFix(7.3, 1, 0), 0, 'an explicit fix wins');
  assert.equal(figureFix(7.3, 1, ''), 1, 'an empty fix is no fix');
  assert.equal(figureFix(1234567890, 2e7), 0, 'a huge integer has no decimals');
  assert.equal(figureFix(0, 1), 0);
});

test('unit-stack: long figures are grouped in threes with a narrow no-break space', () => {
  const g = ' ';
  assert.equal(groupDigits('1234567890'), `1${g}234${g}567${g}890`);
  assert.equal(groupDigits('20000000'), `20${g}000${g}000`);
  assert.equal(groupDigits('12000.5'), `12${g}000.5`);
  assert.equal(groupDigits('-12000'), `-12${g}000`);
  assert.equal(groupDigits('2024'), '2024', 'four digits stay together');
  assert.equal(groupDigits('100.5'), '100.5');
  assert.equal(groupDigits('0.1250'), '0.1250', 'decimals are never grouped');
});
