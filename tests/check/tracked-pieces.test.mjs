// A piece a user scaffolds in pieces/ (untracked) does not enter the tests that enumerate the shipped
// pieces: the timing snapshot, the studio model, the edit ops and the splice invariant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { pieceDirs } from './_timing-snapshot.mjs';
import { trackedPieces } from './_tracked.mjs';

test('an untracked piece in pieces/ is in no enumeration of the shipped pieces', () => {
  const scratch = join(ROOT, 'pieces', `zz-scratch-${process.pid}`);
  cpSync(join(ROOT, 'fixtures', 'kit-smoke', 'film'), scratch, { recursive: true });
  try {
    assert.ok(!trackedPieces().includes(`pieces/zz-scratch-${process.pid}`));
    assert.ok(!pieceDirs().includes(`pieces/zz-scratch-${process.pid}`));
    assert.ok(trackedPieces().includes('pieces/demo-film') && trackedPieces().length >= 30);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
