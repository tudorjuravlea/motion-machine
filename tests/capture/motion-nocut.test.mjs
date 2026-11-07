// Review Focus 4: a reference film with no cuts (one continuous 10 s kit-smoke shot, rendered from
// fixtures/capture/reference/pieces/single). Expected: `transitions` left at the energy preset's
// defaults and a named gap in capture-notes.md, never an invented preference.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validators, ROOT } from '../../scripts/lib/validate.mjs';
import { captureMotion } from '../../scripts/capture-motion.mjs';

const VIDEO = join(ROOT, 'fixtures/capture/reference/single.mp4');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const PRESET = { calm: 'calm', medium: 'premium', high: 'kinetic' };

let result, notes, out;

before(async () => {
  out = join(mkdtempSync(join(tmpdir(), 'mm-capture-nocut-')), 'single-shot.json');
  result = await captureMotion({ from: VIDEO, name: 'single-shot', out });
  notes = readFileSync(result.notesPath, 'utf8');
});

test('no cut is detected in one continuous shot, but its arrivals are', () => {
  assert.equal(result.analysis.cuts.length, 0, JSON.stringify(result.analysis.cuts));
  assert.equal(result.analysis.shots.length, 1);
  assert.equal(result.analysis.arrivals.length, 2);
});

test('transitions are exactly the energy preset defaults, not an invented preference', () => {
  const preset = read(join(ROOT, 'styles/motion', `${PRESET[result.motion.pacing.energy]}.json`));
  assert.deepEqual(result.motion.transitions, preset.transitions);
});

test('capture-notes.md names the gap', () => {
  assert.match(notes, /Named gap: no cuts observed; transition preferences not captured/);
});

test('the motion half still validates', () => {
  const { motion } = validators();
  assert.ok(motion(read(out)), JSON.stringify(motion.errors));
});
