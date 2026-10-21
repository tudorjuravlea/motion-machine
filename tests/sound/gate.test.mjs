// The three rule files compose into the gate (scripts/check.mjs) without changes: they
// are picked up by name, get the composer's ctx, and report the same verdicts as when called
// directly. The composer is pointed at a folder holding only these three files, so this test does
// not depend on the other rules being ready.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, ensureNegatives, ensurePiece, PIECE } from '../../fixtures/sound/setup.mjs';
import { runCheck } from '../../scripts/check.mjs';

let rulesDir, neg;
before(async () => {
  await ensurePiece();
  neg = await ensureNegatives();
  rulesDir = mkdtempSync(join(tmpdir(), 'mm-sound-rules-'));
  for (const id of ['G-PEAK', 'W-LOUDNESS', 'W-CUE', 'W-MIX']) symlinkSync(join(ROOT, 'scripts/check', `${id}.mjs`), join(rulesDir, `${id}.mjs`));
});

const only = ['G-PEAK', 'W-LOUDNESS', 'W-CUE', 'W-MIX'];
const run = (dir) => runCheck(dir, { rulesDir, only }).then((r) => Object.fromEntries(r.rules.map((x) => [x.id, x])));

test('through the composer: W-CUE and W-MIX warn on their negatives, G-PEAK and W-LOUDNESS skip until audio exists, and no rule crashes', async () => {
  const cue = await run(neg.cue);
  assert.equal(cue['W-CUE'].status, 'WARN');
  assert.equal(cue['G-PEAK'].status, 'SKIP');
  assert.equal(cue['W-LOUDNESS'].status, 'SKIP');
  const mix = await run(neg.mix);
  assert.equal(mix['W-MIX'].status, 'WARN');
  assert.ok(mix['W-MIX'].evidence.kinds.includes('cooldown'));
  assert.equal(mix['W-CUE'].status, 'SKIP');                  // no beat grid in that piece
  const clip = await run(neg.peak);
  assert.equal(clip['G-PEAK'].status, 'FAIL');
  assert.equal(clip['W-LOUDNESS'].status, 'WARN');
  const quiet = await run(neg.quiet);
  assert.equal(quiet['G-PEAK'].status, 'PASS');
  assert.equal(quiet['W-LOUDNESS'].status, 'WARN');
});

test('through the composer: kit-smoke-cues: W-CUE passes, G-PEAK and W-LOUDNESS skip, and only the rate sub-check of W-MIX warns', async () => {
  const r = await run(PIECE);
  assert.equal(r['W-CUE'].status, 'PASS');
  assert.equal(r['G-PEAK'].status, 'SKIP');
  assert.equal(r['W-LOUDNESS'].status, 'SKIP');
  assert.deepEqual(r['W-MIX'].evidence.kinds, ['rate']);       // 4 cues in 6 s against calm's 1-4 per 10 s
  for (const x of Object.values(r)) assert.ok(!x.evidence.crash, JSON.stringify(x.evidence));
});
