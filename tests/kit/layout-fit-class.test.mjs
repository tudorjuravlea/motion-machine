// Every layout's headline slot is fitted at rest: the kit shrinks only elements marked `mm-fit`, so a layout whose
// headline lacks the class lets a long headline cross the safe area on a large-headline brand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../patterns/layouts');

test('every layout headline slot carries mm-fit', () => {
  const missing = [];
  for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name, 'pattern.html');
    if (!fs.existsSync(file)) continue;
    for (const m of fs.readFileSync(file, 'utf8').matchAll(/<[a-z0-9]+\b[^>]*data-slot="headline"[^>]*>/g)) {
      if (!/class="[^"]*\bmm-fit\b/.test(m[0])) missing.push(name);
    }
  }
  assert.deepEqual(missing, []);
});
