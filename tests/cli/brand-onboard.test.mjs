// Bringing a brand in: `mm brand onboard` merges every source by trust, applies the role rules and writes
// sources/onboard.json; `mm brand set` retypes roles, `mm brand font` takes a font file with its licence and
// `mm brand logo` takes an SVG. Nothing here needs a browser (the site source is tested in
// brand-onboard-site.test.mjs).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validators } from '../../scripts/lib/validate.mjs';
import { contrast } from '../../scripts/capture-brand.mjs';
import { ROLES, deltaE } from '../../scripts/lib/brand-roles.mjs';
import { GROUP_USAGE } from '../../scripts/lib/cli.mjs';
import { mm, ROOT, readJson, solidPng } from './cli-helpers.mjs';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'mm-onboard-')));
after(() => rmSync(tmp, { recursive: true, force: true }));
const v = validators();
const fresh = (name) => join(tmp, name);
const onboardOf = (dir) => readJson(join(dir, 'sources', 'onboard.json'));
const brandOf = (dir) => readJson(join(dir, 'brand.json'));
const notesOf = (dir) => readFileSync(join(dir, 'notes.md'), 'utf8');
const snapshot = (dir) => Object.fromEntries(readdirSync(dir, { recursive: true }).filter((f) => /\.(json|md|svg|ttf|txt)$/.test(f)).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));

const write = (name, content) => { const p = fresh(name); writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content)); return p; };

// tokens that name six roles and leave muted out: muted is then derived, and the derived tone is too faint
const TOKENS = { colors: { canvas: '#F6F1E7', ink: '#1B2A2F', surface: '#FFFFFF', line: '#D8D0C0', accent: '#D2491F', 'accent ink': '#FFF7F0' }, typography: { display: { fontFamily: 'Fraunces', fontWeight: 700 }, text: { fontFamily: 'Manrope', fontWeight: 400 } } };
const tokensFile = write('tokens.json', TOKENS);

// ----------------------------------------------------------------------------------- onboard

test('onboard from a token file: a valid brand.json, every contract key, every role with a confidence, six pairs', () => {
  const dir = fresh('Tokens Brand');
  const r = mm(['brand', 'onboard', dir, '--from', tokensFile]);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /mm brand sheet/);

  const brand = brandOf(dir);
  assert.ok(v.brand(brand), JSON.stringify(v.brand.errors));
  assert.equal(brand.fictional, false);
  for (const role of ROLES) assert.match(brand.color[role], /^#[0-9A-F]{6}$/, role);

  const o = onboardOf(dir);
  for (const key of ['version', 'brand', 'sources', 'roles', 'accentText', 'pairs', 'warnings', 'notes', 'ask', 'fonts', 'logo']) assert.ok(key in o, key);
  assert.equal(o.version, 1);
  assert.equal(o.brand, brand.name);
  assert.deepEqual(o.sources, [{ kind: 'tokens', from: tokensFile, trust: 3 }]);
  for (const role of ROLES) {
    const x = o.roles[role];
    assert.match(x.hex, /^#[0-9A-F]{6}$/, role);
    assert.ok(['exact', 'measured', 'rule', 'guess', 'set'].includes(x.confidence), `${role} ${x.confidence}`);
    assert.ok(['tokens', 'designmd', 'site', 'stills', 'rule', 'hand'].includes(x.source), `${role} ${x.source}`);
    assert.ok(x.evidence.length > 0, role);
    assert.ok('fixed' in x, `${role} has a fixed key`);
    assert.equal(brand.color[role], x.hex, `${role}: brand.json carries the reviewed value`);
  }
  assert.equal(o.roles.canvas.confidence, 'exact');
  assert.equal(o.roles.canvas.source, 'tokens');
  assert.equal(o.pairs.length, 6);
  assert.deepEqual(Object.keys(o.pairs[0]).sort(), ['aim', 'bg', 'fg', 'need', 'pass', 'ratio', 'use'].sort());
  assert.equal(o.logo, null);
  assert.deepEqual(o.fonts.map((f) => f.role), ['display', 'text', 'mono']);
  for (const f of o.fonts) { assert.equal(f.source, 'stand-in'); assert.equal(f.licence, 'SIL OFL 1.1'); assert.ok(f.files.length > 0); }
  assert.equal(brand.composition.accentText, o.accentText);
  // the stand-in faces are inside the folder, with their licence
  for (const face of Object.values(brand.type)) for (const f of face.files) assert.ok(existsSync(join(dir, f.src)), f.src);
  assert.ok(existsSync(join(dir, 'fonts', 'manrope', 'LICENSE.txt')));
});

test('a derived muted under 4.5:1 is fixed on its own: the fix is in onboard.json, in notes.md and in brand.json', () => {
  const dir = fresh('Muted Fix');
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  const o = onboardOf(dir);
  const m = o.roles.muted;
  assert.equal(m.confidence, 'guess');
  assert.ok(m.fixed, 'muted carries a fix');
  assert.ok(contrast(m.fixed.from, o.roles.canvas.hex) < 4.5, 'it was under 4.5:1');
  assert.ok(contrast(m.hex, o.roles.canvas.hex) >= 4.5, 'it reads now');
  assert.equal(m.hex, m.fixed.to);
  assert.equal(brandOf(dir).color.muted, m.fixed.to, 'brand.json carries the fixed value');
  assert.ok(o.pairs.find((p) => p.fg === 'muted').pass);
  const notes = notesOf(dir);
  assert.ok(notes.includes(`${m.fixed.from} → ${m.fixed.to}`), 'notes.md lists the fix as from → to');
  assert.match(notes, /muted on the canvas was/);
});

test('onboard from a DESIGN.md plus a folder of stills: the DESIGN.md colours win, as exact', () => {
  const designmd = write('DESIGN.md', ['# Acme', '', '| token | value |', '|---|---|', '| canvas | #F6F1E7 |', '| ink | #1B2A2F |', '| muted | #4F5C60 |', '| surface | #FFFFFF |', '| line | #D8D0C0 |', '| accent | #D2491F |', '| accent ink | #FFF7F0 |', ''].join('\n'));
  const stills = fresh('stills'); mkdirSync(stills);
  writeFileSync(join(stills, 'a.png'), solidPng(96, 96, [0x20, 0x40, 0x80]));      // a blue the DESIGN.md does not have
  writeFileSync(join(stills, 'b.png'), solidPng(96, 96, [0xFF, 0xFF, 0xFF]));
  writeFileSync(join(stills, 'c.png'), solidPng(96, 96, [0xFF, 0xFF, 0xFF]));
  const dir = fresh('Design Md');
  const r = mm(['brand', 'onboard', dir, '--from', designmd, '--from', stills]);
  assert.equal(r.status, 0, r.out);
  const o = onboardOf(dir);
  assert.deepEqual(o.sources.map((s) => [s.kind, s.trust]), [['designmd', 3], ['stills', 1]]);
  for (const [role, hex] of Object.entries({ canvas: '#F6F1E7', ink: '#1B2A2F', muted: '#4F5C60', surface: '#FFFFFF', line: '#D8D0C0', accent: '#D2491F', accentInk: '#FFF7F0' })) {
    assert.equal(o.roles[role].hex, hex, role);
    assert.equal(o.roles[role].confidence, 'exact', role);
    assert.equal(o.roles[role].source, 'designmd', role);
  }
  // the stills' own readings stay on the table as the other candidates
  const accentAsk = o.ask.find((a) => a.role === 'accent');
  if (accentAsk) assert.ok(accentAsk.options.every((x) => x.command.startsWith('mm brand set ')));
});

test('stills alone: measured roles, guessed tones, a question per guess', () => {
  const stills = fresh('stills-only'); mkdirSync(stills);
  writeFileSync(join(stills, 'a.png'), solidPng(96, 96, [0xF6, 0xF1, 0xE7]));
  writeFileSync(join(stills, 'b.png'), solidPng(96, 96, [0xF6, 0xF1, 0xE7]));
  writeFileSync(join(stills, 'c.png'), solidPng(96, 96, [0x1B, 0x2A, 0x2F]));
  writeFileSync(join(stills, 'd.png'), solidPng(96, 96, [0xD2, 0x49, 0x1F]));
  const dir = fresh('Stills Only');
  assert.equal(mm(['brand', 'onboard', dir, '--from', stills]).status, 0);
  const o = onboardOf(dir);
  assert.equal(o.roles.canvas.confidence, 'measured');
  assert.equal(o.roles.canvas.source, 'stills');
  assert.equal(o.roles.muted.confidence, 'guess');
  assert.ok(o.ask.some((a) => a.role === 'line' || a.role === 'surface'), 'a guessed tone is asked');
  for (const a of o.ask) for (const x of a.options) assert.ok(x.command.includes('mm brand set') && x.command.includes(`${a.role}=`), `${a.id} option has a command`);
});

test('a planted wrong role: an accent equal to the ink warns, and the accent is asked with the other colours as options', () => {
  const planted = write('planted.json', { colors: { canvas: '#F6F1E7', ink: '#1B2A2F', muted: '#4B5A5F', surface: '#FFFFFF', line: '#D8D0C0', accent: '#1B2A2F', 'accent ink': '#FFF7F0', coral: '#E9573F' } });
  const dir = fresh('Planted');
  assert.equal(mm(['brand', 'onboard', dir, '--from', planted]).status, 0);
  const o = onboardOf(dir);
  assert.ok(o.warnings.some((w) => w.id === 'accent-like-ink'), JSON.stringify(o.warnings));
  const ask = o.ask.find((a) => a.role === 'accent');
  assert.ok(ask, 'the accent is asked');
  const coral = ask.options.find((x) => x.value.toUpperCase() === '#E9573F');
  assert.ok(coral, `options: ${JSON.stringify(ask.options)}`);
  assert.match(coral.label, /tokens/);
  assert.equal(coral.command, `mm brand set "${dir}" accent=#E9573F`);
  for (const x of ask.options) assert.ok(x.command.startsWith(`mm brand set "${dir}" accent=`), x.command);
  assert.match(notesOf(dir), /accent-like-ink/);
  assert.match(notesOf(dir), new RegExp(`mm brand set "${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}" accent=#E9573F`));
});

test('--color wins: confidence set, source hand, never fixed', () => {
  const dir = fresh('Color Wins');
  const r = mm(['brand', 'onboard', dir, '--from', tokensFile, '--color', 'accent=#123456', '--color', 'muted=#CCCCCC']);
  assert.equal(r.status, 0, r.out);
  const o = onboardOf(dir);
  assert.equal(o.roles.accent.hex, '#123456');
  assert.equal(o.roles.accent.confidence, 'set');
  assert.equal(o.roles.accent.source, 'hand');
  assert.equal(o.roles.accent.fixed, null);
  assert.equal(brandOf(dir).color.accent, '#123456');
  // a hand-set muted that fails is never changed, only asked
  assert.equal(o.roles.muted.hex, '#CCCCCC');
  assert.equal(o.roles.muted.fixed, null);
  assert.ok(o.ask.some((a) => a.role === 'muted'));
});

test('a bad source or --color stops with exit 2 and writes nothing', () => {
  const dir = fresh('Nothing Written');
  for (const args of [['--from', fresh('missing.json')], ['--from', tokensFile, '--color', 'accent=red'], ['--from', tokensFile, '--color', 'bogus=#000000'], []]) {
    const r = mm(['brand', 'onboard', dir, ...args]);
    assert.equal(r.status, 2, r.out);
    assert.ok(!existsSync(dir), `${args.join(' ')} left a folder`);
  }
});

test('onboarding again replaces onboard.json and appends a second notes section, never deleting the first', () => {
  const dir = fresh('Twice');
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  const first = notesOf(dir);
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile, '--color', 'accent=#123456']).status, 0);
  const second = notesOf(dir);
  assert.ok(second.startsWith(first), 'earlier notes are kept');
  assert.equal([...second.matchAll(/^## Onboarded/gm)].length, 2);
  assert.equal(onboardOf(dir).roles.accent.hex, '#123456');
});

// ----------------------------------------------------------------------------------- set

test('brand set: changes brand.json and onboard.json, appends to the notes, and fixes what the new value breaks', () => {
  const dir = fresh('Set');
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  const before = notesOf(dir);
  const r = mm(['brand', 'set', dir, 'accent=#0A7F5A', 'canvas=#101418']);
  assert.equal(r.status, 0, r.out);
  const o = onboardOf(dir);
  assert.equal(o.roles.accent.hex, '#0A7F5A');
  assert.equal(o.roles.accent.confidence, 'set');
  assert.equal(o.roles.accent.source, 'hand');
  assert.equal(o.roles.canvas.hex, '#101418');
  assert.equal(brandOf(dir).color.accent, '#0A7F5A');
  assert.equal(brandOf(dir).color.canvas, '#101418');
  assert.ok(v.brand(brandOf(dir)));
  assert.equal(o.pairs.length, 6);
  const after = notesOf(dir);
  assert.ok(after.startsWith(before) && after.length > before.length);
  assert.match(after, /accent/);
  assert.match(after, /#0A7F5A/);
  // the ink is dark on a dark canvas now: the review says so
  assert.ok(o.warnings.some((w) => w.id === 'ink-weak') || o.ask.some((a) => a.role === 'ink'));
});

test('brand set refuses a colour name and an unknown role, and writes nothing', () => {
  const dir = fresh('Set Refuses');
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  const snap = snapshot(dir);
  for (const arg of ['accent=red', 'bogus=#000000', 'accent', 'accent=#12']) {
    const r = mm(['brand', 'set', dir, arg]);
    assert.equal(r.status, 2, `${arg}: ${r.out}`);
  }
  assert.equal(mm(['brand', 'set', dir, 'accent=#0A7F5A', 'bogus=#000000']).status, 2);
  assert.deepEqual(snapshot(dir), snap);
});

test('brand set works on a folder that was never onboarded (all roles measured) and takes surfaceInk', () => {
  const dir = fresh('Set Plain');
  assert.equal(mm(['brand', 'init', dir]).status, 0);
  const r = mm(['brand', 'set', dir, 'accent=#0A7F5A', 'surfaceInk=#101010']);
  assert.equal(r.status, 0, r.out);
  const o = onboardOf(dir);
  assert.equal(o.roles.surfaceInk.hex, '#101010');
  assert.equal(o.roles.surfaceInk.confidence, 'set');
  assert.equal(o.roles.canvas.confidence, 'measured');
  assert.equal(brandOf(dir).color.surfaceInk, '#101010');
  assert.ok(v.brand(brandOf(dir)));
});

test('brand set tells the user to refresh a sheet that exists', () => {
  const dir = fresh('Set Sheet');
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  mkdirSync(join(dir, 'sheets'), { recursive: true });
  writeFileSync(join(dir, 'sheets', 'review.html'), '<!doctype html>');
  const r = mm(['brand', 'set', dir, 'accent=#0A7F5A']);
  assert.equal(r.status, 0, r.out);
  // the hint names a verb only when the verb exists
  if (GROUP_USAGE.brand.includes('sheet')) assert.match(r.out, /mm brand sheet/);
  else assert.doesNotMatch(r.out, /out of date/);
});

// ----------------------------------------------------------------------------------- font

const MANROPE = readdirSync(join(ROOT, 'styles', 'fonts', 'manrope')).find((f) => f.endsWith('.woff2'));
const manrope = join(ROOT, 'styles', 'fonts', 'manrope', MANROPE);
const OFL = join(ROOT, 'styles', 'fonts', 'manrope', 'LICENSE.txt');

test('brand font: a bundled OFL font goes into fonts/<family>/ with its licence, recognised as SIL OFL 1.1', () => {
  const dir = fresh('Font');
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  const r = mm(['brand', 'font', dir, manrope, '--family', 'Test Sans', '--role', 'text', '--weight', '400', '--license', OFL]);
  assert.equal(r.status, 0, r.out);
  assert.ok(existsSync(join(dir, 'fonts', 'test-sans', MANROPE)));
  assert.equal(readFileSync(join(dir, 'fonts', 'test-sans', 'LICENSE.txt'), 'utf8'), readFileSync(OFL, 'utf8'));
  const brand = brandOf(dir);
  assert.ok(v.brand(brand), JSON.stringify(v.brand.errors));
  assert.equal(brand.type.text.family, 'Test Sans');
  assert.deepEqual(brand.type.text.files, [{ src: `fonts/test-sans/${MANROPE}`, weight: 400, unicodeRange: 'U+0000-FFFF' }]);
  assert.notEqual(brand.type.display.family, 'Test Sans');
  const f = onboardOf(dir).fonts.find((x) => x.role === 'text');
  assert.deepEqual([f.family, f.source, f.licence, f.files], ['Test Sans', 'brand', 'SIL OFL 1.1', [`fonts/test-sans/${MANROPE}`]]);
  assert.equal(onboardOf(dir).fonts.find((x) => x.role === 'display').source, 'stand-in');
  assert.match(notesOf(dir), /Test Sans/);
});

test('brand font --role both sets display and text; no licence means private-use; Apache is recognised', () => {
  const dir = fresh('Font Both');
  assert.equal(mm(['brand', 'init', dir]).status, 0);
  assert.equal(mm(['brand', 'font', dir, manrope, '--family', 'House Sans', '--role', 'both']).status, 0);
  const o = onboardOf(dir);
  for (const role of ['display', 'text']) { const f = o.fonts.find((x) => x.role === role); assert.deepEqual([f.family, f.source, f.licence], ['House Sans', 'brand', 'private-use']); }
  assert.equal(brandOf(dir).type.display.family, 'House Sans');
  assert.ok(!existsSync(join(dir, 'fonts', 'house-sans', 'LICENSE.txt')));

  const apache = write('apache.txt', '                                 Apache License\n                           Version 2.0, January 2004\n');
  assert.equal(mm(['brand', 'font', dir, manrope, '--family', 'Mono Face', '--role', 'mono', '--license', apache]).status, 0);
  assert.equal(onboardOf(dir).fonts.find((x) => x.role === 'mono').licence, 'Apache 2.0');
});

test('brand font refuses wrong magic bytes, an unsafe family, an unknown role and a wrong extension, writing nothing', () => {
  const dir = fresh('Font Refuses');
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  const snap = snapshot(dir);
  const fake = write('fake.ttf', 'this is not a font file at all');
  const txt = write('font.txt', 'wOF2');
  for (const args of [
    [fake, '--family', 'Fake', '--role', 'text'],
    [manrope, '--family', 'x"</style>', '--role', 'text'],
    [manrope, '--family', 'Good', '--role', 'heading'],
    [txt, '--family', 'Good', '--role', 'text'],
    [manrope, '--role', 'text'],
  ]) {
    const r = mm(['brand', 'font', dir, ...args]);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.out}`);
  }
  assert.deepEqual(snapshot(dir), snap);
  assert.ok(!existsSync(join(dir, 'fonts', 'fake')) && !existsSync(join(dir, 'fonts', 'good')));
});

// ----------------------------------------------------------------------------------- logo

const DIRTY_LOGO = `<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="100" onload="alert(1)">
  <script>alert(2)</script>
  <style>@import url(https://evil.example/x.css); .a { fill: #D2491F; background: url(https://evil.example/p.png) } </style>
  <foreignObject width="10" height="10"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>
  <a href="https://evil.example/"><rect class="a" x="0" y="0" width="100" height="100" onclick="alert(3)"/></a>
  <image xlink:href="https://evil.example/pixel.png" width="1" height="1"/>
  <circle cx="150" cy="50" r="40" fill="#1B2A2F" style="stroke:#F6F1E7;filter:url(https://evil.example/f.svg#x)"/>
  <path d="M0 0L10 10" fill="#7A3FD0" stroke="none"/>
  <use href="#local"/>
</svg>
`;

test('brand logo: scripts, handlers, outside references and outside url() are gone; viewBox, mono variant and fills mapped', () => {
  const dir = fresh('Logo');
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  const svg = write('dirty.svg', DIRTY_LOGO);
  const r = mm(['brand', 'logo', dir, svg]);
  assert.equal(r.status, 0, r.out);
  const out = readFileSync(join(dir, 'logo', 'logo.svg'), 'utf8');
  assert.doesNotMatch(out, /<script|foreignObject|\bon[a-z]+\s*=|evil\.example|@import|<!DOCTYPE/i);
  assert.match(out, /href="#local"/, 'a local reference stays');
  assert.match(out, /viewBox="0 0 200 100"/);
  assert.doesNotMatch(out.match(/<svg[^>]*>/)[0], /\b(width|height)=/);
  assert.match(out, /#D2491F/i, 'the original colours are kept in logo.svg');

  const mono = readFileSync(join(dir, 'logo', 'logo-mono.svg'), 'utf8');
  assert.match(mono, /currentColor/);
  assert.doesNotMatch(mono, /#D2491F|#1B2A2F|#F6F1E7|#7A3FD0/i);
  assert.doesNotMatch(mono, /<script|\bon[a-z]+\s*=|evil\.example/i);

  const logo = onboardOf(dir).logo;
  assert.equal(logo.file, 'logo/logo.svg');
  assert.equal(logo.mono, 'logo/logo-mono.svg');
  const o = onboardOf(dir);
  assert.equal(logo.fills['#D2491F'], 'accent');
  assert.equal(logo.fills['#1B2A2F'], 'ink');
  assert.ok(logo.fills['#F6F1E7'] === 'canvas');
  assert.ok(ROLES.includes(logo.fills['#7A3FD0']));
  assert.ok(Math.min(...ROLES.map((role) => deltaE('#7A3FD0', o.roles[role].hex))) > 12);
  assert.match(notesOf(dir), /#7A3FD0/, 'a colour far from every role is warned in the notes');
});

test('brand logo derives a viewBox from width and height, and refuses a file that is not an SVG', () => {
  const dir = fresh('Logo Plain');
  assert.equal(mm(['brand', 'init', dir]).status, 0);
  const plain = write('plain.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="48px" height="24"><rect width="48" height="24" fill="#000"/></svg>');
  assert.equal(mm(['brand', 'logo', dir, plain]).status, 0);
  assert.match(readFileSync(join(dir, 'logo', 'logo.svg'), 'utf8'), /viewBox="0 0 48 24"/);

  const snap = snapshot(dir);
  for (const bad of [write('not.svg', 'just some text'), write('page.svg', '<html><body>hi</body></html>'), write('logo.png', 'x')]) {
    assert.equal(mm(['brand', 'logo', dir, bad]).status, 2, bad);
  }
  assert.deepEqual(snapshot(dir), snap);
});

test('a font and a logo added before any onboarding survive a later onboard', () => {
  const dir = fresh('Order');
  assert.equal(mm(['brand', 'init', dir]).status, 0);
  assert.equal(mm(['brand', 'font', dir, manrope, '--family', 'Test Sans', '--role', 'text', '--license', OFL]).status, 0);
  assert.equal(mm(['brand', 'logo', dir, write('l.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#D2491F"/></svg>')]).status, 0);
  assert.equal(mm(['brand', 'onboard', dir, '--from', tokensFile]).status, 0);
  const o = onboardOf(dir);
  assert.equal(brandOf(dir).type.text.family, 'Test Sans', 'the brand font is not replaced by a stand-in');
  assert.equal(o.fonts.find((f) => f.role === 'text').source, 'brand');
  assert.equal(o.logo.file, 'logo/logo.svg');
});
