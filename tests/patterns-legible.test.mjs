// G-LEGIBLE's body floor (SPEC §12) holds at every rest in every format, and the caption role sits
// under it at 16x9, so no pattern sets text in --mm-size-caption. Found by the catalogue films:
// bar-grow's and funnel's labels and stat-tile's label measured 28.56 px against a 36 px floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PATTERNS = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'patterns');

test('no pattern sets text in the caption size role, which is under the 16x9 body floor', () => {
  const offenders = [];
  for (const group of readdirSync(PATTERNS)) {
    for (const name of readdirSync(join(PATTERNS, group))) {
      let css;
      try { css = readFileSync(join(PATTERNS, group, name, 'pattern.css'), 'utf8'); } catch { continue; }
      if (/font-size:\s*var\(--mm-size-caption\)/.test(css)) offenders.push(`${group}/${name}`);
    }
  }
  assert.deepEqual(offenders, []);
});
