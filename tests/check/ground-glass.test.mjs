// The gate over glass cards on every ground kind (SPEC §3, §7): the bloom, the graph-paper with its scan
// band and the dot grid are made of palette roles, so G-BRAND's pixel half passes; text on a glass card
// still clears W-CONTRAST and G-LEGIBLE over each of them; nothing in the pieces fails the gate.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newPiece } from '../../scripts/new.mjs';
import { runCheck } from '../../scripts/check.mjs';
import { ROOT, launchBrowser, serveRoot } from '../../scripts/lib/browser.mjs';

const work = join(ROOT, `.tmp-gate-ground-${process.pid}`);
let browser, server;
before(async () => { mkdirSync(work, { recursive: true }); browser = await launchBrowser(); server = await serveRoot(ROOT); });
after(async () => { await browser?.close(); await server?.close(); rmSync(work, { recursive: true, force: true }); });

const RULES = ['G-TIME', 'G-DETERMINISM', 'G-LOCAL', 'G-BRAND', 'G-LEGIBLE', 'G-REST', 'G-EDGE', 'G-OVERLAP', 'W-CONTRAST'];
const GROUNDS = {
  bloom: undefined,   // obsidian's own: a bloom and a dot grid
  'graph-paper': { kind: 'graph-paper', grid: { spacing: 0.02, every: 5, strength: 0.7, drift: 0.012, cycle: 8, scan: { role: 'accent', size: 0.2, strength: 0.14 } } },
  dots: { kind: 'dots', dots: { role: 'line', spacing: 0.025, size: 0.12, strength: 0.6 } },
};

async function piece(name, ground, formats) {
  const dir = join(work, name);
  newPiece({ kind: 'film', style: 'obsidian-premium', dir });
  const story = JSON.parse(readFileSync(join(ROOT, 'tests/kit/media/ground-glass.json'), 'utf8'));
  writeFileSync(join(dir, 'story.json'), JSON.stringify({ ...story, id: name, formats }, null, 2));
  if (ground) {
    const style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
    style.ground = ground;
    writeFileSync(join(dir, 'style.json'), JSON.stringify(style, null, 2));
  }
  return dir;
}

for (const [name, ground] of Object.entries(GROUNDS)) {
  test(`glass cards over a ${name} ground: the brand holds, the text stays legible and contrasted`, async () => {
    const dir = await piece(name, ground, ['16x9']);
    const res = await runCheck(dir, { browser, server, only: RULES });
    const rows = Object.fromEntries(res.rules.map((r) => [r.id, r]));
    for (const id of RULES) assert.ok(['PASS', 'SKIP'].includes(rows[id]?.status), `${id}: ${rows[id]?.status} ${JSON.stringify(rows[id]?.evidence ?? {})}`);
    for (const id of ['G-BRAND', 'G-LEGIBLE', 'W-CONTRAST']) assert.equal(rows[id].status, 'PASS', id);
    assert.equal(res.code, 0);
  });
}

test('the same cards on the tall format: the bloom, the glass and the text still pass', async () => {
  const dir = await piece('tall', undefined, ['9x16', '1x1']);
  const res = await runCheck(dir, { browser, server, only: RULES });
  for (const r of res.rules) assert.ok(['PASS', 'SKIP'].includes(r.status), `${r.id}: ${r.status} ${JSON.stringify(r.evidence ?? {})}`);
});
