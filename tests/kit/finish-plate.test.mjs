// The misregistered plate's kick, as a pure function of piece time: an emphasis swings the plate out,
// back past register and to rest, a damped swing. It steps on the plate's grid (every max(2, frameHold)
// thirtieths of a second from t = 0), and its first step is the first grid instant at or after the
// emphasis begins, so the same swing shows wherever the emphasis falls against the grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plateKick } from '../../runtime/kit/kit.js';

const stepOf = (hold) => Math.max(2, hold) / 30;
// the kick at each grid instant from the emphasis start to past its end
function swing(start, d, hold) {
  const q = stepOf(hold), out = [];
  for (let k = Math.ceil(start / q - 1e-6); k * q < start + d + 0.3; k++) out.push(plateKick(k * q + 1e-4, start, d, hold));
  const first = out.findIndex((v) => v !== 0);
  return first < 0 ? [] : out.slice(first, out.length - [...out].reverse().findIndex((v) => v !== 0));
}

for (const hold of [1, 3]) {
  test(`frameHold ${hold}: the same damped swing wherever the emphasis falls on the grid`, () => {
    const q = stepOf(hold);
    const ref = swing(14, 1, hold).map((v) => Math.round(v * 1e6) / 1e6);
    assert.ok(ref.length >= 4, `a swing of several steps: ${ref}`);
    for (let k = 0; k < 10; k++) {
      const got = swing(14 + (k / 10) * q + 0.003, 1, hold).map((v) => Math.round(v * 1e6) / 1e6);
      assert.deepEqual(got, ref, `phase ${k / 10} of a step`);
    }
    assert.ok(ref[0] >= 0.9, `it kicks out on its first step: ${ref[0]}`);
    assert.ok(ref.some((v) => v < -0.05), `it swings back past register: ${ref}`);
    for (let i = 1; i < ref.length; i++) assert.ok(Math.abs(ref[i]) < ref[0], `damped: ${ref}`);
  });

  test(`frameHold ${hold}: the kick changes only on the grid, and is over before the emphasis ends`, () => {
    const q = stepOf(hold);
    for (const start of [3.21, 7.5, 14.35]) {
      for (let t = start - 0.2; t < start + 1.4; t += 0.01) {
        const g = Math.floor(t / q + 1e-6) * q;
        assert.equal(plateKick(t, start, 1, hold), plateKick(g + 1e-7, start, 1, hold), `t ${t.toFixed(3)} draws the step at ${g.toFixed(3)}`);
      }
      assert.equal(plateKick(start - 0.01, start, 1, hold), 0);
      for (let t = start + 1; t < start + 2; t += 0.05) assert.equal(plateKick(t, start, 1, hold), 0, `after the emphasis at ${t}`);
    }
    assert.equal(plateKick(5.05, 5, 0.05, hold), 0, 'an emphasis shorter than a step does not kick');
  });
}
