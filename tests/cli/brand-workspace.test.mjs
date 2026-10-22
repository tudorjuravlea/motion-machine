// A brand's own folder: `mm brand init` makes it, `mm style compose` and `mm new` read halves and styles
// that live outside the repository, `mm project new` makes a project in it, and the work folder behind a
// project is stable per path. Nothing here needs a browser.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { validators } from '../../scripts/lib/validate.mjs';
import { PRIVATE_DIR } from '../../scripts/lib/cli.mjs';
import { workDir } from '../../scripts/lib/project.mjs';
import { mm, ROOT, readJson } from './cli-helpers.mjs';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'mm-brand-ws-')));
after(() => rmSync(tmp, { recursive: true, force: true }));
const v = validators();
const fresh = (name) => join(tmp, name);
const outside = (p) => { const r = relative(ROOT, p); return r.startsWith('..') || isAbsolute(r); };
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const fontSrcs = (b) => Object.values(b.type).flatMap((face) => face.files.map((f) => f.src));

test('the temp folders sit outside the repository', () => assert.ok(outside(tmp)));

// ----------------------------------------------------------------------------------- brand init

test('brand init --from paper makes the whole layout, a valid brand.json and its fonts with licences', () => {
  const dir = fresh('Acme Studio');
  const r = mm(['brand', 'init', dir, '--from', 'paper']);
  assert.equal(r.status, 0, r.out);
  for (const d of ['fonts', 'logo', 'sources', 'projects']) assert.ok(statSync(join(dir, d)).isDirectory(), d);
  for (const f of ['brand.json', 'notes.md', 'facts.md', 'logo/README.md', 'sources/README.md']) assert.ok(existsSync(join(dir, f)), f);
  assert.deepEqual(readdirSync(join(dir, 'projects')), [], 'projects/ starts empty');
  assert.equal(readFileSync(join(dir, 'logo/README.md'), 'utf8').trim().split('\n').length, 1, 'the logo note is one line');
  assert.match(readFileSync(join(dir, 'logo/README.md'), 'utf8'), /SVG/);
  assert.match(readFileSync(join(dir, 'sources/README.md'), 'utf8'), /DESIGN\.md/);
  assert.match(readFileSync(join(dir, 'notes.md'), 'utf8'), /mm project new/);
  assert.match(readFileSync(join(dir, 'facts.md'), 'utf8'), /\| id \| text \| source \| checked \|/);

  const brand = readJson(join(dir, 'brand.json'));
  assert.ok(v.brand(brand), JSON.stringify(v.brand.errors));
  assert.equal(brand.fictional, false);
  assert.equal(brand.name, 'acme-studio', 'the name is the folder name as a slug');
  const srcs = fontSrcs(brand);
  assert.ok(srcs.length >= 6);
  for (const src of srcs) {
    assert.match(src, /^fonts\/[a-z0-9-]+\/[^/]+$/, src);
    assert.ok(existsSync(resolve(dir, src)), `${src} resolves beside brand.json`);
  }
  for (const fam of readdirSync(join(dir, 'fonts'))) assert.ok(existsSync(join(dir, 'fonts', fam, 'LICENSE.txt')), `${fam} carries its licence`);
  assert.ok(!existsSync(join(dir, 'ground')), 'paper has no ground mark, so no ground/ folder');
  assert.ok(!readFileSync(join(dir, 'brand.json'), 'utf8').includes(ROOT), 'no path of the repository is written');
});

test('brand init takes --name, defaults --from to paper, and accepts an empty existing folder', () => {
  const dir = fresh('plain');
  mkdirSync(dir);
  const r = mm(['brand', 'init', dir, '--name', 'northwind']);
  assert.equal(r.status, 0, r.out);
  const brand = readJson(join(dir, 'brand.json'));
  assert.equal(brand.name, 'northwind');
  assert.deepEqual(brand.color, readJson(join(ROOT, 'styles/brands/paper.json')).color);
});

test('brand init copies the ground mark into ground/ and points src at it', () => {
  const dir = fresh('with-ground');
  const r = mm(['brand', 'init', dir, '--from', 'draftline']);
  assert.equal(r.status, 0, r.out);
  const brand = readJson(join(dir, 'brand.json'));
  assert.ok(v.brand(brand), JSON.stringify(v.brand.errors));
  assert.equal(brand.ground.mark.src, 'ground/draftline-grid.svg');
  assert.ok(existsSync(join(dir, 'ground/draftline-grid.svg')));
});

test('brand init --from a path works from the current folder, with fonts found beside that half', () => {
  const src = fresh('src-brand');
  assert.equal(mm(['brand', 'init', src, '--from', 'linen', '--name', 'first']).status, 0);
  const r = mm(['brand', 'init', 'second', '--from', 'src-brand/brand.json', '--name', 'second'], { cwd: tmp });
  assert.equal(r.status, 0, r.out);
  const brand = readJson(join(tmp, 'second/brand.json'));
  assert.equal(brand.name, 'second');
  for (const src of fontSrcs(brand)) assert.ok(existsSync(join(tmp, 'second', src)), src);
});

test('brand init --from a captured half in the private brands folder', () => {
  const name = `zz-init-${process.pid}`;
  const privateBrands = join(ROOT, PRIVATE_DIR, 'brands');
  mkdirSync(privateBrands, { recursive: true });
  const file = join(privateBrands, `${name}.json`);
  const half = readJson(join(ROOT, 'styles/brands/signal.json'));
  half.name = name;
  writeFileSync(file, JSON.stringify(half));
  try {
    const dir = fresh('from-private');
    const r = mm(['brand', 'init', dir, '--from', name]);
    assert.equal(r.status, 0, r.out);
    assert.deepEqual(readJson(join(dir, 'brand.json')).color, half.color);
  } finally { rmSync(file, { force: true }); }
});

test('brand init refuses a non-empty folder, an unknown --from and a name the schema rejects, with exit 2', () => {
  const dir = fresh('busy');
  mkdirSync(dir);
  writeFileSync(join(dir, 'keep.txt'), 'mine');
  const busy = mm(['brand', 'init', dir]);
  assert.equal(busy.status, 2, busy.out);
  assert.match(busy.stderr, /not empty/);
  assert.equal(readFileSync(join(dir, 'keep.txt'), 'utf8'), 'mine');
  assert.deepEqual(readdirSync(dir), ['keep.txt'], 'nothing else was written');

  const unknown = mm(['brand', 'init', fresh('nowhere'), '--from', 'no-such-brand']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /no-such-brand/);
  assert.ok(!existsSync(fresh('nowhere')), 'nothing was made');

  const badName = mm(['brand', 'init', fresh('x1'), '--name', 'A']);
  assert.equal(badName.status, 2);
  assert.match(badName.stderr, /name/);
  assert.equal(mm(['brand', 'init']).status, 2);
});

// ----------------------------------------------------------------------------- halves anywhere

test('style compose reads a brand half outside the repository and writes a style anywhere', () => {
  const brandDir = fresh('compose-brand');
  assert.equal(mm(['brand', 'init', brandDir, '--from', 'draftline']).status, 0);
  const outFile = fresh('elsewhere/styles/style.json');
  const r = mm(['style', 'compose', '--brand', join(brandDir, 'brand.json'), '--motion', 'calm', '--out', outFile]);
  assert.equal(r.status, 0, r.out);
  const style = readJson(outFile);
  assert.ok(v.style(style), JSON.stringify(v.style.errors));
  assert.equal(style.from.motion, 'styles/motion/calm.json', 'a half inside the repo stays repo-relative');
  assert.ok(!isAbsolute(style.from.brand));
  assert.equal(resolve(dirname(outFile), style.from.brand), join(brandDir, 'brand.json'), 'an outside half is recorded relative to the style file');
  const srcs = fontSrcs(style);
  assert.ok(srcs.length >= 6);
  for (const src of srcs) assert.ok(existsSync(resolve(dirname(outFile), src)), `${src} resolves from the style file`);
  assert.ok(existsSync(resolve(dirname(outFile), style.ground.mark.src)), 'the ground mark resolves from the style file');
  assert.equal(mm(['style', 'export-designmd', '--style', outFile, '--out', fresh('elsewhere/DESIGN.md')]).status, 0, 'a style with an outside `from` still exports a DESIGN.md');
});

test('style compose with an outside half and an --out inside the repository keeps fonts reachable', () => {
  const brandDir = fresh('compose-brand-2');
  assert.equal(mm(['brand', 'init', brandDir, '--from', 'paper']).status, 0);
  const folder = join(ROOT, `.tmp-bw-compose-${process.pid}`);
  try {
    const outFile = join(folder, 'style.json');
    const r = mm(['style', 'compose', '--brand', join(brandDir, 'brand.json'), '--motion', 'calm', '--out', outFile]);
    assert.equal(r.status, 0, r.out);
    const style = readJson(outFile);
    for (const src of fontSrcs(style)) assert.ok(existsSync(resolve(folder, src)), src);
    assert.equal(resolve(folder, style.from.brand), join(brandDir, 'brand.json'));
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('mm new copies the fonts and the ground mark of a style outside the repository into the piece', () => {
  const brandDir = fresh('new-brand');
  assert.equal(mm(['brand', 'init', brandDir, '--from', 'draftline']).status, 0);
  const styleFile = fresh('new-style/style.json');
  assert.equal(mm(['style', 'compose', '--brand', join(brandDir, 'brand.json'), '--motion', 'calm', '--out', styleFile]).status, 0);
  const folder = join(ROOT, `.tmp-bw-new-${process.pid}`);
  const piece = join(folder, 'piece');
  try {
    const r = mm(['new', '--kind', 'deck', '--style', styleFile, '--dir', piece, '--id', 'bw-piece']);
    assert.equal(r.status, 0, r.out);
    const style = readJson(join(piece, 'style.json'));
    for (const src of fontSrcs(style)) {
      assert.match(src, /^assets\/fonts\//, src);
      assert.ok(existsSync(join(piece, src)), src);
    }
    assert.equal(style.ground.mark.src, 'assets/ground/draftline-grid.svg');
    assert.ok(existsSync(join(piece, 'assets/ground/draftline-grid.svg')));
    assert.ok(walk(join(piece, 'assets/fonts')).some((f) => f.endsWith('LICENSE.txt')), 'the licences travel too');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

// -------------------------------------------------------------------------------------- work folder

test('the work folder is stable per path and differs for same-named projects elsewhere', () => {
  const a = workDir(ROOT, join(tmp, 'one', 'Demo'), 'demo');
  assert.equal(workDir(ROOT, join(tmp, 'one', 'Demo'), 'demo'), a, 'the same path gives the same folder');
  const b = workDir(ROOT, join(tmp, 'two', 'Demo'), 'demo');
  assert.notEqual(a, b);
  assert.match(a, /\/demo-[0-9a-f]{8}$/);
  assert.equal(dirname(a), join(ROOT, PRIVATE_DIR, 'projects-work'));
  assert.equal(dirname(b), dirname(a));
});

// ------------------------------------------------------------------------------------- project new

test('project new makes the project folder: project.json, the skeleton story, assets, sources, out', () => {
  const brandDir = fresh('pn-brand');
  assert.equal(mm(['brand', 'init', brandDir]).status, 0);
  const dir = fresh('pn-projects/Launch Deck');
  const r = mm(['project', 'new', dir, '--brand', brandDir, '--kind', 'deck']);
  assert.equal(r.status, 0, r.out);
  for (const d of ['assets', 'out']) assert.ok(statSync(join(dir, d)).isDirectory(), d);
  assert.deepEqual(readdirSync(join(dir, 'assets')), []);
  assert.match(readFileSync(join(dir, 'inputs/sources.md'), 'utf8'), /\| line in the story \| from file \| where in it \|/);
  const project = readJson(join(dir, 'project.json'));
  assert.equal(project.id, 'launch-deck');
  assert.equal(project.kind, 'deck');
  assert.equal(project.brand, brandDir, 'the brand folder is recorded as an absolute path');
  assert.equal(project.motion, 'calm');
  assert.deepEqual(project.formats, ['16x9']);
  assert.ok(!Number.isNaN(Date.parse(project.created)));
  const story = readJson(join(dir, 'story.json'));
  assert.equal(story.id, 'launch-deck');
  assert.equal(story.kind, 'deck');
  assert.deepEqual(story.formats, ['16x9']);
  assert.ok(story.scenes.length >= 1);
});

test('project new: a bare name goes under <brand>/projects, --formats and --motion are kept, a deck keeps one format', () => {
  const brandDir = fresh('pn-brand-2');
  assert.equal(mm(['brand', 'init', brandDir]).status, 0);
  const film = mm(['project', 'new', 'Teaser', '--brand', brandDir, '--kind', 'film', '--formats', '9x16,1x1', '--motion', 'kinetic']);
  assert.equal(film.status, 0, film.out);
  const dir = join(brandDir, 'projects', 'Teaser');
  const project = readJson(join(dir, 'project.json'));
  assert.deepEqual([project.id, project.kind, project.motion, project.formats], ['teaser', 'film', 'kinetic', ['9x16', '1x1']]);
  assert.deepEqual(readJson(join(dir, 'story.json')).formats, ['9x16', '1x1']);

  const deck = mm(['project', 'new', 'Pitch', '--brand', brandDir, '--kind', 'deck', '--formats', '4x5,16x9', '--motion', join(ROOT, 'styles/motion/premium.json')]);
  assert.equal(deck.status, 0, deck.out);
  const pitch = readJson(join(brandDir, 'projects', 'Pitch', 'project.json'));
  assert.deepEqual(pitch.formats, ['4x5'], 'a deck keeps one format');
  assert.equal(pitch.motion, join(ROOT, 'styles/motion/premium.json'), 'a motion given as a path is recorded as an absolute path');
});

test('project new refuses a folder that is not empty, a missing brand and a bad kind with exit 2', () => {
  const brandDir = fresh('pn-brand-3');
  assert.equal(mm(['brand', 'init', brandDir]).status, 0);
  const busy = fresh('pn-busy');
  mkdirSync(busy);
  writeFileSync(join(busy, 'x.txt'), '1');
  const notEmpty = mm(['project', 'new', busy, '--brand', brandDir, '--kind', 'film']);
  assert.equal(notEmpty.status, 2);
  assert.match(notEmpty.stderr, /not empty/);
  const noBrand = mm(['project', 'new', fresh('pn-nb'), '--brand', fresh('no-such-brand-folder'), '--kind', 'film']);
  assert.equal(noBrand.status, 2);
  assert.match(noBrand.stderr, /brand\.json/);
  assert.equal(mm(['project', 'new', fresh('pn-bk'), '--brand', brandDir, '--kind', 'poster']).status, 2);
  assert.equal(mm(['project', 'new', fresh('pn-nk'), '--brand', brandDir]).status, 2);
  assert.equal(mm(['project', 'new', fresh('pn-bm'), '--brand', brandDir, '--kind', 'film', '--motion', 'no-such-motion']).status, 2);
  assert.ok(!existsSync(fresh('pn-bm')), 'a refused project leaves no folder');
});
