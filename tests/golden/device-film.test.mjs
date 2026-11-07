// A device film that shows a recording on a phone, a captured site
// scrolled, tapped and swapped on a phone, and the same site zoomed with a callout on a laptop,
// passes the gate in both formats, survives `export --prove`, and draws the same pixels for the
// same t in any seek order. Assets come from fixtures/device-film/make-assets.sh (git-ignored).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser, framePng } from '../../scripts/lib/browser.mjs';

const PIECE = join(ROOT, 'fixtures/device-film');
const mm = (args) => spawnSync(process.execPath, [join(ROOT, 'scripts/mm.mjs'), ...args], { encoding: 'utf8', timeout: 900_000, maxBuffer: 64 << 20 });

before(() => {
  if (!existsSync(join(PIECE, 'assets/site-laptop/media.json'))) assert.equal(spawnSync('sh', [join(PIECE, 'make-assets.sh')], { encoding: 'utf8' }).status, 0, 'make-assets.sh failed');
});

for (const format of ['9x16', '16x9', '4x5']) {
  test(`the device film passes mm check in ${format}`, () => {
    const r = mm(['check', PIECE, '--format', format, '--quiet', '--json']);
    const report = JSON.parse(readFileSync(join(PIECE, 'out/check.json'), 'utf8'));
    const failed = report.rules.filter((x) => x.status === 'FAIL').map((x) => `${x.id}: ${JSON.stringify(x.evidence).slice(0, 240)}`);
    assert.equal(r.status, 0, failed.join('\n') || r.stdout + r.stderr);
  });
}

test('export --prove renders every frame twice, identically (9x16)', () => {
  const r = mm(['export', PIECE, '--formats', '9x16', '--prove', '--force']);
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-2000));
  const manifest = JSON.parse(readFileSync(join(PIECE, 'out/export.json'), 'utf8'));
  assert.equal(manifest.prove[0].mismatches.length, 0);
});

test('instants inside screen actions draw the same pixels in any seek order', async () => {
  const server = await serveRoot(ROOT), browser = await launchBrowser();
  try {
    const a = await openPiece(PIECE, { server, browser, format: '9x16' });
    const b = await openPiece(PIECE, { server, browser, format: '9x16' });
    const sched = (await a.mm.meta()).schedule;
    const at = sched.events.filter((e) => e.screen).slice(0, 4).map((e) => e.t + e.d / 2);
    assert.ok(at.length >= 3, 'the proof film has screen actions');
    const fwd = []; for (const t of at) fwd.push(await framePng(a.page, t));
    const rev = []; for (const t of [...at].reverse()) rev.unshift(await framePng(b.page, t));
    at.forEach((t, i) => assert.ok(fwd[i].equals(rev[i]), `t = ${t} differs between seek orders`));
    await a.close(); await b.close();
  } finally { await browser.close(); await server.close(); }
});

test('a missing frame of a prepared recording fails G-LOCAL and stops the export', async () => {
  const { cpSync, rmSync, unlinkSync } = await import('node:fs');
  const copy = join(ROOT, 'fixtures', `.tmp-device-missing-${process.pid}`);   // same depth as the piece, so its kit import resolves
  rmSync(copy, { recursive: true, force: true });
  cpSync(PIECE, copy, { recursive: true, filter: (p) => !p.includes('/out') });
  try {
    unlinkSync(join(copy, 'assets/rec/f00030.jpg'));
    const c = mm(['check', copy, '--format', '9x16', '--quiet']);
    const report = JSON.parse(readFileSync(join(copy, 'out/check.json'), 'utf8'));
    const local = report.rules.find((x) => x.id === 'G-LOCAL');
    assert.equal(local.status, 'FAIL', JSON.stringify(local));
    assert.match(JSON.stringify(local.evidence), /f00030\.jpg/);
    assert.notEqual(c.status, 0);
    const e = mm(['export', copy, '--formats', '9x16', '--fps', '10', '--force']);
    assert.notEqual(e.status, 0, 'the export went through with a missing frame');
    assert.match(e.stdout + e.stderr, /f00030\.jpg/);
  } finally { rmSync(copy, { recursive: true, force: true }); }
});

test('a deck with devices and screen actions works standalone from file://', async () => {
  const { cpSync, rmSync, writeFileSync } = await import('node:fs');
  const { pathToFileURL } = await import('node:url');
  const { buildStandalone } = await import('../../scripts/lib/standalone.mjs');
  const dir = join(ROOT, 'fixtures', `.tmp-device-deck-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  cpSync(PIECE, dir, { recursive: true, filter: (p) => !p.includes('/out') });
  const story = { id: 'device-deck', kind: 'deck', formats: ['16x9'], title: 'Device deck', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, cta: { text: '', url: '' },
    scenes: [
      { id: 'rec', layout: 'layouts/caption-bar', presses: 1, cut: 'transitions/hard-cut', move: null, beats: [{ step: 1, at: 0, slot: 'stage', fx: 'devices/phone', asset: 'assets/rec/', params: { size: 'large' } }], say: '' },
      { id: 'site', layout: 'layouts/caption-bar', presses: 2, position: 'topic', move: null, beats: [{ step: 1, at: 0, slot: 'stage', fx: 'devices/laptop', asset: 'assets/site-laptop/',
        screen: [{ do: 'screen/scroll', step: 0, params: { to: 'Pricing' } }, { do: 'screen/callout', step: 1, params: { at: 'Price', text: 'One plan' } }] },
      { step: 1, at: 0, slot: 'caption', fx: 'style:body', text: 'A page, scrolled and named.' }], say: '' }] };
  writeFileSync(join(dir, 'story.json'), JSON.stringify(story, null, 2));
  const browser = await launchBrowser();
  try {
    const style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
    const out = join(dir, 'out', 'deck');
    buildStandalone(dir, out, { story, style });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on('pageerror', (e) => errors.push(String(e.message)));
    await page.goto(pathToFileURL(join(out, 'index.html')).href + '?render=1');
    await page.waitForFunction(() => window.mm && ('ready' in window.mm), null, { timeout: 30_000 });
    const st = await page.evaluate(() => ({ ready: window.mm.ready, error: window.mm.error ?? null, warnings: window.mm.warnings ?? [] }));
    assert.equal(st.ready, true, st.error ?? errors.join('\n'));
    assert.deepEqual(st.warnings.filter((w) => /screen|pattern|media/.test(w)), []);
    await page.evaluate(async () => { window.mm.goto(1); await window.mm.settle(); });
    assert.ok(await page.evaluate(() => { const i = document.querySelector('[data-scene="rec"] .mm-screen__media'); return !!i && i.complete && i.naturalWidth > 0; }), 'the recording does not show');
    await page.evaluate(async () => { window.mm.goto(3); await window.mm.settle(); });
    assert.equal(await page.evaluate(() => document.querySelector('.mm-screen-out .callout__label')?.textContent ?? null), 'One plan');
  } finally { await browser.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('the Price mark is the price text, not the full-width block around it', () => {
  for (const site of ['site-phone', 'site-laptop']) {
    const m = JSON.parse(readFileSync(join(PIECE, 'assets', site, 'media.json'), 'utf8'));
    assert.ok(m.marks.Price.w < 0.8 * m.marks.Pricing.w, // 208 px on macOS, 251 on Linux fonts; a full-width mark would be 350
      `${site}: Price is ${m.marks.Price.w} px wide in a ${m.marks.Pricing.w} px block`);
    assert.ok(m.marks.Price.w > 0 && m.marks.Price.x >= m.marks.Pricing.x);
  }
});
