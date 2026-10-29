// `mm brand onboard` from a saved page: the page is read in headless Chromium, so this file sits in the browser
// group. The page's muted text colour is measured under 4.5:1, so the role rules fix it on their own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validators } from '../../scripts/lib/validate.mjs';
import { contrast } from '../../scripts/capture-brand.mjs';
import { ROLES } from '../../scripts/lib/brand-roles.mjs';
import { mm, ROOT, readJson } from './cli-helpers.mjs';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'mm-onboard-site-')));
after(() => rmSync(tmp, { recursive: true, force: true }));
const SITE = join(ROOT, 'fixtures', 'capture', 'site', 'index.html');
const dir = join(tmp, 'Harbour Pine');
const run = mm(['brand', 'onboard', dir, '--from', SITE], { timeout: 120_000 });

test('site: the run succeeds and writes a valid brand.json and a complete onboard.json', () => {
  assert.equal(run.status, 0, run.out);
  const v = validators();
  const brand = readJson(join(dir, 'brand.json'));
  assert.ok(v.brand(brand), JSON.stringify(v.brand.errors));
  const o = readJson(join(dir, 'sources', 'onboard.json'));
  for (const key of ['version', 'brand', 'sources', 'roles', 'accentText', 'pairs', 'warnings', 'notes', 'ask', 'fonts', 'logo']) assert.ok(key in o, key);
  assert.deepEqual(o.sources, [{ kind: 'site', from: SITE, trust: 2 }]);
  for (const role of ROLES) {
    assert.ok(['exact', 'measured', 'rule', 'guess', 'set'].includes(o.roles[role].confidence), role);
    assert.equal(o.roles[role].source, 'site');
  }
  assert.equal(o.pairs.length, 6);
  assert.equal(o.roles.canvas.hex, '#F6F1E7');
  assert.equal(o.roles.canvas.confidence, 'measured');
  assert.equal(o.roles.accent.hex, '#D2491F');
  assert.deepEqual(o.fonts.map((f) => [f.role, f.source]), [['display', 'stand-in'], ['text', 'stand-in'], ['mono', 'stand-in']]);
  assert.equal(o.fonts[0].family, 'Fraunces');   // the page's display serif is not bundled: the nearest serif stands in
});

test('site: the measured muted colour is under 4.5:1, is fixed on its own, and the fix reaches brand.json, onboard.json and notes.md', () => {
  const o = readJson(join(dir, 'sources', 'onboard.json'));
  const m = o.roles.muted;
  assert.equal(m.fixed.from, '#6A7478');
  assert.ok(contrast(m.fixed.from, o.roles.canvas.hex) < 4.5);
  assert.ok(contrast(m.hex, o.roles.canvas.hex) >= 4.5);
  assert.equal(m.confidence, 'measured');
  assert.equal(readJson(join(dir, 'brand.json')).color.muted, m.hex);
  assert.ok(readFileSync(join(dir, 'notes.md'), 'utf8').includes(`#6A7478 → ${m.hex}`));
  assert.ok(o.pairs.find((p) => p.fg === 'muted').pass);
});

test('site: the folder holds the stand-in fonts with their licences', () => {
  assert.ok(existsSync(join(dir, 'fonts', 'fraunces', 'LICENSE.txt')));
});
