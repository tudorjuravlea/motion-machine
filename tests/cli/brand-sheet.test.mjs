// `mm brand sheet <folder>`: the review sheet. One page, one Chromium session, the brand judged on its own
// against neutral chrome. The fixtures are a brand folder made by `mm brand init` and a hand-written
// sources/onboard.json (the shape the onboarding step writes).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pairsOf } from '../../scripts/lib/brand-roles.mjs';
import { pngSize } from '../../scripts/lib/sheet.mjs';
import { mm, readJson, ROOT } from './cli-helpers.mjs';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'mm-brand-sheet-')));
after(() => rmSync(tmp, { recursive: true, force: true }));

const EVIL = '<script>alert(1)</script>';
const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" rx="8" fill="#B5451B"/><circle cx="20" cy="20" r="8" fill="#FFF8F1"/></svg>\n';
const FRAMES = ['look-title', 'look-statement', 'look-stat', ...Array.from({ length: 8 }, (_, i) => `tempo-${i}`)];

const brandFolder = (name) => {
  const dir = join(tmp, name);
  const r = mm(['brand', 'init', dir, '--from', 'paper']);
  assert.equal(r.status, 0, r.out);
  return dir;
};

/** The hand-made onboard.json: a fixed muted, a warning, a question with two options, a surfaceInk, hostile evidence. */
function onboardFor(dir) {
  const c = readJson(join(dir, 'brand.json')).color;
  const roles = Object.fromEntries(Object.entries(c).map(([role, hex]) => [role, { hex, confidence: 'measured', source: 'site', evidence: `read from the ${role} of the page`, fixed: null }]));
  roles.canvas = { ...roles.canvas, confidence: 'exact', source: 'tokens', evidence: 'named by the brand: --paper' };
  roles.accent = { ...roles.accent, confidence: 'guess', source: 'stills', evidence: `most common saturated colour ${EVIL}` };
  roles.muted = { hex: '#6F675B', confidence: 'measured', source: 'site', evidence: 'secondary text on the page', fixed: { from: '#A9A090', to: '#6F675B', why: 'muted on the canvas was 2.3:1, under the 4.5:1 text minimum; moved 60% toward the ink' } };
  roles.surfaceInk = { hex: '#1E1B16', confidence: 'rule', source: 'rule', evidence: 'ink on the surface is 3.9:1; #1E1B16 reads at 12.8:1', fixed: null };
  const hexes = Object.fromEntries(Object.entries(roles).map(([role, r]) => [role, r.hex]));
  return {
    version: 1, brand: 'acme-studio',
    sources: [{ kind: 'tokens', from: 'brand/tokens.json', trust: 3 }, { kind: 'stills', from: 'stills/', trust: 1 }],
    roles, accentText: true,
    pairs: pairsOf(hexes),
    warnings: [{ id: 'accent-like-ink', text: 'the accent is almost the ink: the brand colour was probably not found' }],
    notes: [],
    ask: [{
      id: 'accent', role: 'accent', question: 'The accent looks like the ink or the canvas. What is the brand colour?',
      options: [
        { label: 'keep it', value: '#B5451B', command: `mm brand set "${dir}" accent=#B5451B` },
        { label: 'the orange in the logo', value: '#E9573F' },
      ],
    }],
    fonts: [
      { role: 'display', family: 'Fraunces', source: 'brand', licence: 'SIL OFL 1.1', files: [] },
      { role: 'text', family: 'Manrope', source: 'stand-in', licence: 'SIL OFL 1.1', files: [] },
      { role: 'mono', family: 'IBM Plex Mono', source: 'brand', licence: 'private-use', files: [] },
    ],
    logo: null,
  };
}

let dirA, resultA, secsA, htmlA;
before(() => {
  dirA = brandFolder('acme-studio');
  mkdirSync(join(dirA, 'sources'), { recursive: true });
  writeFileSync(join(dirA, 'sources', 'onboard.json'), `${JSON.stringify(onboardFor(dirA), null, 2)}\n`);
  const t0 = Date.now();
  resultA = mm(['brand', 'sheet', dirA], { env: { MM_TIMEOUT_SCALE: '2' } });
  resultA.ms = Date.now() - t0;
  secsA = join(dirA, 'sheets');
  htmlA = existsSync(join(secsA, 'review.html')) ? readFileSync(join(secsA, 'review.html'), 'utf8') : '';
});

test('brand sheet writes review.html, review.png and the frames; one launch, well inside a minute', () => {
  assert.equal(resultA.status, 0, resultA.out);
  assert.ok(existsSync(join(secsA, 'review.html')));
  assert.ok(resultA.ms < 60_000, `took ${resultA.ms} ms`);
  const png = readFileSync(join(secsA, 'review.png'));
  assert.equal(pngSize(png).width, 1440, 'a full-page screenshot at 1440 px');
  assert.ok(pngSize(png).height > 1500, 'the whole page, not the viewport');
});

test('the script launches Chromium once and hands the browser to every page', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'brand-sheet.mjs'), 'utf8');
  assert.equal((src.match(/launchBrowser\(/g) ?? []).length, 1);
  assert.equal((src.match(/chromium\.launch/g) ?? []).length, 0);
});

test('all eleven frames exist; without a logo there are no logo frames', () => {
  const have = readdirSync(join(secsA, 'frames')).sort();
  assert.deepEqual(have, FRAMES.map((f) => `${f}.png`).sort());
  for (const f of FRAMES) assert.equal(pngSize(readFileSync(join(secsA, 'frames', `${f}.png`))).width, 1920, f);
  assert.ok(!/logo-canvas/.test(htmlA));
});

test('the page holds every role hex, the warning, both option commands, "fixed from" and the surfaceInk', () => {
  const onboard = readJson(join(dirA, 'sources', 'onboard.json'));
  for (const [role, r] of Object.entries(onboard.roles)) assert.ok(htmlA.includes(r.hex), `${role} ${r.hex}`);
  assert.ok(htmlA.includes(onboard.warnings[0].text));
  assert.ok(htmlA.includes(`mm brand set "${dirA}" accent=#B5451B`), 'the option with its own command');
  assert.ok(htmlA.includes(`mm brand set "${dirA}" accent=#E9573F`), 'the option without one gets a built command');
  assert.ok(htmlA.includes('fixed from'));
  assert.ok(htmlA.includes('#A9A090'), 'the old muted');
  assert.match(htmlA, /surfaceInk \(derived\)/);
  assert.match(htmlA, /navigator\.clipboard\.writeText/);
  assert.match(htmlA, /needs 4\.5 : 1/);
  assert.match(htmlA, /aim 7 : 1/);
  assert.match(htmlA, /\b\d+\.\d : 1\b/);
  assert.match(htmlA, /Brand review/);
  assert.match(htmlA, /Stand-in face: Manrope/);
  assert.match(htmlA, /1 fix\b/);
  assert.match(htmlA, /accent text on/);
});

test('strings from the data are escaped; the evidence cannot add a script', () => {
  assert.ok(htmlA.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!htmlA.includes('<script>alert'));
});

test('the sections come in order', () => {
  const at = ['Look out', 'Palette', 'Contrast', 'Type', 'Look', 'Motion', 'Questions'].map((t) => {
    const i = htmlA.indexOf(`<h2>${t}</h2>`);
    assert.ok(i >= 0, `section ${t}`);
    return i;
  });
  assert.deepEqual([...at].sort((a, b) => a - b), at);
});

test('no network references; every url() and src resolves to a file under sheets/, fonts included', () => {
  assert.ok(!/http/.test(htmlA), 'no http anywhere in the page');
  const refs = [...htmlA.matchAll(/\burl\(\s*['"]?([^'")]+)['"]?\s*\)/g), ...htmlA.matchAll(/\bsrc=["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(refs.some((r) => /\.woff2$/.test(r)), 'fonts are referenced');
  assert.ok(refs.some((r) => /^frames\/look-title\.png$/.test(r)), 'frames are referenced');
  for (const ref of refs) {
    assert.ok(!/^(\/|[a-z]+:)/i.test(ref), `${ref} is relative`);
    const abs = resolve(secsA, ref);
    assert.ok(abs.startsWith(`${secsA}/`) && existsSync(abs), `${ref} resolves under sheets/`);
  }
  assert.ok(existsSync(join(secsA, 'assets', 'fonts')));
});

test('the page fonts load from sheets/assets/fonts (no fallback in the screenshot run)', () => {
  assert.match(htmlA, /Archivo/);
  assert.match(htmlA, /IBM Plex Mono/);
  assert.ok(readdirSync(join(secsA, 'assets', 'fonts')).length >= 4);
});

test('without onboard.json the sheet reads brand.json; a logo adds three logo frames; the contrast table has six rows', () => {
  const dir = brandFolder('plain-brand');
  writeFileSync(join(dir, 'logo', 'logo.svg'), LOGO);
  const r = mm(['brand', 'sheet', dir], { env: { MM_TIMEOUT_SCALE: '2' } });
  assert.equal(r.status, 0, r.out);
  const sheets = join(dir, 'sheets');
  const html = readFileSync(join(sheets, 'review.html'), 'utf8');
  assert.deepEqual(readdirSync(join(sheets, 'frames')).sort(), [...FRAMES, 'logo-canvas', 'logo-accent', 'logo-ink'].map((f) => `${f}.png`).sort());
  const table = html.slice(html.indexOf('<h2>Contrast</h2>'), html.indexOf('<h2>Type</h2>'));
  assert.equal((table.match(/<tr class="pair"/g) ?? []).length, 6);
  const brand = readJson(join(dir, 'brand.json'));
  for (const hex of Object.values(brand.color)) assert.ok(html.includes(hex), hex);
  assert.match(html, /measured/);
  assert.ok(!/<h2>Questions<\/h2>/.test(html), 'no questions, no section');
  for (const f of ['logo-canvas', 'logo-accent', 'logo-ink']) assert.ok(html.includes(`frames/${f}.png`), f);
  assert.ok(!/http/.test(html));
  assert.ok(existsSync(join(dir, 'sheets', 'review.png')));
});

test('a second run refreshes the sheet; a motion by name is accepted; a bad folder or motion exits 2', () => {
  const dir = brandFolder('again');
  let r = mm(['brand', 'sheet', dir, '--motion', 'kinetic'], { env: { MM_TIMEOUT_SCALE: '2' } });
  assert.equal(r.status, 0, r.out);
  assert.match(readFileSync(join(dir, 'sheets', 'review.html'), 'utf8'), /kinetic/);
  r = mm(['brand', 'sheet', dir, '--motion', 'no-such-motion']);
  assert.equal(r.status, 2);
  assert.match(r.out, /motion half not found/);
  r = mm(['brand', 'sheet', join(tmp, 'nowhere')]);
  assert.equal(r.status, 2);
  assert.match(r.out, /brand\.json/);
  assert.ok(!existsSync(join(ROOT, 'docs', 'private', 'projects-work')) || !readdirSync(join(ROOT, 'docs', 'private', 'projects-work')).some((n) => n.startsWith('sheet-')), 'the work piece is removed');
});
