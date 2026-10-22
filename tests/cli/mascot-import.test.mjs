// `mm brand mascot <file.svg> --brand <path> [--as <name>] [--out <path>] [--json]`: imports a
// mascot drawn in any vector tool into a brand half (the main character, or a cast member with
// --as), validates the result against the brand schema and the rig's own box check before it
// writes, and says what it mapped, guessed and skipped. The fixture brand is exactly what the
// command writes from the three fixture drawings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, validators } from '../../scripts/lib/validate.mjs';
import { plan } from '../../scripts/mm.mjs';

const v = validators();
const MM = join(ROOT, 'scripts', 'mm.mjs');
const mm = (...args) => { const r = spawnSync(process.execPath, [MM, ...args], { cwd: ROOT, encoding: 'utf8' }); return { status: r.status, out: r.stdout, err: r.stderr }; };
const fx = (f) => join(ROOT, 'fixtures', 'mascot', f);
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('the router sends brand mascot to the importer', () => {
  assert.deepEqual(plan(['brand', 'mascot', 'a.svg', '--brand', 'b.json']), { script: 'mascot-import.mjs', args: ['a.svg', '--brand', 'b.json'], label: 'brand mascot' });
});

test('imports a main character and a cast member, validates, and leaves the source brand alone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-mascot-cli-'));
  try {
    const out = join(dir, 'brand.json');
    const before = readFileSync(fx('palette.json'), 'utf8');
    let r = mm('brand', 'mascot', fx('droplet.svg'), '--brand', fx('palette.json'), '--out', out);
    assert.equal(r.status, 0, r.err + r.out);
    assert.match(r.out, /wrote .*brand\.json/);
    assert.match(r.out, /float/);
    assert.equal(readFileSync(fx('palette.json'), 'utf8'), before, '--out leaves the source brand alone');
    r = mm('brand', 'mascot', fx('cat.svg'), '--brand', out, '--as', 'cat');
    assert.equal(r.status, 0, r.err + r.out);
    const b = json(out);
    assert.ok(v.brand(b), JSON.stringify(v.brand.errors));
    assert.ok(b.mascot.float > 0);
    assert.equal(b.mascot.cast.cat.views.front.limbs.length, 4);
    r = mm('brand', 'mascot', fx('robot.svg'), '--brand', out, '--as', 'robot', '--json');
    assert.equal(r.status, 0, r.err);
    const rep = JSON.parse(r.out);
    assert.equal(rep.summary.face, 'screen');
    assert.deepEqual(Object.keys(json(out).mascot.cast).sort(), ['cat', 'robot']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('usage mistakes exit 2; a drawing it cannot use exits 1 and writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-mascot-cli-'));
  try {
    const out = join(dir, 'b.json');
    let r = mm('brand', 'mascot', fx('cat.svg'));
    assert.equal(r.status, 2); assert.match(r.err, /usage: mm brand mascot/);
    r = mm('brand', 'mascot', '--brand', fx('palette.json'));
    assert.equal(r.status, 2); assert.match(r.err, /svg/i);
    r = mm('brand', 'mascot', join(dir, 'none.svg'), '--brand', fx('palette.json'), '--out', out);
    assert.equal(r.status, 2); assert.match(r.err, /not found/);
    r = mm('brand', 'mascot', fx('cat.svg'), '--brand', fx('palette.json'), '--as', 'cat', '--out', out);
    assert.equal(r.status, 2, 'a cast member needs a main character first'); assert.match(r.err, /main character/);
    r = mm('brand', 'mascot', fx('cat.svg'), '--brand', fx('palette.json'), '--as', 'Big Cat', '--out', out);
    assert.equal(r.status, 2); assert.match(r.err, /--as/);
    const bad = join(dir, 'bad.svg');
    writeFileSync(bad, '<svg viewBox="0 0 10 10"><circle id="head" cx="5" cy="5" r="4"/></svg>');
    r = mm('brand', 'mascot', bad, '--brand', fx('palette.json'), '--out', out);
    assert.equal(r.status, 1, r.err); assert.match(r.err, /body/);
    assert.equal(existsSync(out), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the fixture brand is what the importer writes from the three drawings', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mm-mascot-cli-'));
  try {
    const out = join(dir, 'brand.json');
    for (const [file, as] of [['droplet.svg'], ['cat.svg', 'cat'], ['robot.svg', 'robot']]) {
      const r = mm('brand', 'mascot', fx(file), '--brand', as ? out : fx('palette.json'), '--out', out, ...(as ? ['--as', as] : []));
      assert.equal(r.status, 0, r.err);
    }
    assert.deepEqual(json(out), json(fx('brand.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
