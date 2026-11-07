// mm brand capture --from <folder of stills>: the palette is clustered across
// the frames and the roles guessed from area, contrast and saturation; fonts cannot be read from
// pixels, so the half lists them in `ask` (W-ASK warns while any remain); a hex the user typed with
// --color role=#hex always wins over a sampled one. The stills are drawn here with ffmpeg.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureBrand, parseHex } from '../../scripts/capture-brand.mjs';

let dir;
const near = (a, b, tol = 8) => parseHex(a).every((v, i) => Math.abs(v - parseHex(b)[i]) <= tol);
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'mm-stills-'));
  // canvas #F4EFE6 everywhere, an ink block #1E1B16 and a small accent block #C8471F, in two frames
  for (const [i, x] of [[1, 40], [2, 120]]) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0xF4EFE6:s=480x270', '-frames:v', '1',
      '-vf', `drawbox=x=${x}:y=60:w=200:h=80:color=0x1E1B16:t=fill,drawbox=x=${x + 230}:y=180:w=50:h=30:color=0xC8471F:t=fill`, join(dir, `still-${i}.png`)]);
    assert.equal(r.status, 0, String(r.stderr));
  }
});
after(() => rmSync(dir, { recursive: true, force: true }));

test('stills: canvas, ink and accent come from the frames, and the half validates', async () => {
  const r = await captureBrand({ from: dir, name: 'stillcap', out: join(dir, 'out', 'stillcap.json') });
  assert.ok(near(r.brand.color.canvas, '#F4EFE6'), r.brand.color.canvas);
  assert.ok(near(r.brand.color.ink, '#1E1B16'), r.brand.color.ink);
  assert.ok(near(r.brand.color.accent, '#C8471F'), r.brand.color.accent);
  assert.equal(r.brand.fictional, false);
});

test('stills: the fonts are asked, not guessed, and the notes say where each colour came from', async () => {
  const r = await captureBrand({ from: dir, name: 'stillcap', out: join(dir, 'out', 'stillcap.json') });
  assert.deepEqual(r.brand.ask, ['type.display', 'type.text']);
  const notes = readFileSync(r.notesPath, 'utf8');
  assert.match(notes, /\*\*canvas\*\* #[0-9A-F]{6}: sampled, \d+(\.\d+)?% of the pixels across 2 stills/);
  assert.match(notes, /ASK/);
});

test('stills: a hex typed with --color wins over the sampled one and is not asked', async () => {
  const r = await captureBrand({ from: dir, name: 'stillcap', out: join(dir, 'out', 'stillcap.json'), color: ['accent=#2255AA'] });
  assert.equal(r.brand.color.accent, '#2255AA');
  assert.match(readFileSync(r.notesPath, 'utf8'), /\*\*accent\*\* #2255AA: typed by the user/);
});

test('stills: a folder with no pictures is an error that names what was expected', async () => {
  const empty = mkdtempSync(join(tmpdir(), 'mm-stills-empty-'));
  try { await assert.rejects(() => captureBrand({ from: empty, name: 'empty-stills', out: join(empty, 'x.json') }), /no stills/); } finally { rmSync(empty, { recursive: true, force: true }); }
});
