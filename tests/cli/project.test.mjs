// `mm project make`: a project and its brand folder live outside the repository; the engine renders them through
// a hidden work piece inside its own git-ignored folder and copies the results back. A deck is the fast render;
// one film covers the film copy-back.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PRIVATE_DIR } from '../../scripts/lib/cli.mjs';
import { workDir } from '../../scripts/lib/project.mjs';
import { mm, probeVideo, ROOT, readJson } from './cli-helpers.mjs';

const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'mm-project-')));
const works = new Set();
after(() => {
  rmSync(tmp, { recursive: true, force: true });
  for (const w of works) { rmSync(w, { recursive: true, force: true }); rmSync(`${w}.compose`, { recursive: true, force: true }); }
});
const gitStatus = () => spawnSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).stdout;
const make = (folder, ...extra) => mm(['project', 'make', folder, ...extra]);
const workOf = (folder) => { const r = mm(['project', 'path', folder]); assert.equal(r.status, 0, r.out); const w = r.stdout.trim(); works.add(w); return w; };
const newProject = (folder, ...extra) => { const r = mm(['project', 'new', folder, '--brand', brand, ...extra]); assert.equal(r.status, 0, r.out); workOf(folder); };
const edit = (file, fn) => { const j = readJson(file); fn(j); writeFileSync(file, `${JSON.stringify(j, null, 2)}\n`); };

let brand, deck, deckWork, gitBefore;
before(() => {
  brand = join(tmp, 'Brand Folder');
  assert.equal(mm(['brand', 'init', brand, '--from', 'paper', '--name', 'projtest']).status, 0);
  deck = join(tmp, 'elsewhere', 'Demo');
  const r = mm(['project', 'new', deck, '--brand', brand, '--kind', 'deck']);
  assert.equal(r.status, 0, r.out);
  deckWork = workOf(deck);
});

test('project path names the work folder inside the engine, before and after a make', () => {
  assert.equal(deckWork, workDir(ROOT, deck, 'demo'));
  assert.ok(deckWork.startsWith(join(ROOT, PRIVATE_DIR, 'projects-work')));
  assert.ok(!existsSync(deckWork), 'nothing exists until the first make');
});

test('make renders a deck from folders outside the repo, copies the results back and leaves git as it was', () => {
  gitBefore = gitStatus();
  const r = make(deck);
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /All rules passed/, 'the check summary is printed');
  for (const f of ['slides/index.html', 'handout.pdf', 'walkthrough.mp4', 'check.json']) assert.ok(existsSync(join(deck, 'out', f)), f);
  assert.ok(statSync(join(deck, 'out', 'walkthrough.mp4')).size > 1000);
  assert.ok(!existsSync(join(deck, 'out', 'deck')), 'the folder is called slides in the project');
  assert.equal(gitStatus(), gitBefore, 'git status in the engine is the same after the run');
  assert.ok(existsSync(join(deckWork, 'assets/fonts')), 'the work piece carries the brand fonts');
  const story = readJson(join(deckWork, 'story.json'));
  assert.equal(story.id, 'demo');
  assert.equal(readJson(join(deck, 'out/check.json')).complete, true);
  const slides = readJson(join(deck, 'out/slides/style.json'));
  const slidesText = readFileSync(join(deck, 'out/slides/index.html'), 'utf8');
  assert.ok(!slidesText.includes('../') && !slidesText.includes(tmp), 'no path of the brand folder travels inside the slides');
  assert.deepEqual(slides.from, { brand: 'brand.json', motion: 'calm' });
  assert.equal(slides.color.accent, readJson(join(brand, 'brand.json')).color.accent, 'the slides wear the brand folder\'s accent');
});

test('an edit to the brand folder reaches the next make', () => {
  const was = readJson(join(deckWork, 'style.json')).color.accent;
  edit(join(brand, 'brand.json'), (b) => { b.color.accent = '#0A7F3F'; });
  const r = make(deck);
  assert.equal(r.status, 0, r.out);
  const now = readJson(join(deckWork, 'style.json')).color.accent;
  assert.notEqual(now, was);
  assert.equal(now, '#0A7F3F');
  assert.equal(readJson(join(deck, 'out/slides/style.json')).color.accent, '#0A7F3F', 'and the copied-back slides');
  assert.deepEqual(readdirSync(join(deckWork, '..')).filter((n) => n.endsWith('.compose')), [], 'the staging folder is removed');
});

test('the project\'s assets are mirrored into the work piece; deleted files disappear; the engine\'s fonts stay', () => {
  mkdirSync(join(deck, 'assets', 'pics'), { recursive: true });
  writeFileSync(join(deck, 'assets', 'logo-note.txt'), 'one');
  writeFileSync(join(deck, 'assets', 'pics', 'a.txt'), 'two');
  assert.equal(make(deck).status, 0);
  assert.equal(readFileSync(join(deckWork, 'assets/logo-note.txt'), 'utf8'), 'one');
  assert.equal(readFileSync(join(deckWork, 'assets/pics/a.txt'), 'utf8'), 'two');
  rmSync(join(deck, 'assets', 'logo-note.txt'));
  rmSync(join(deck, 'assets', 'pics'), { recursive: true });
  assert.equal(make(deck).status, 0);
  assert.ok(!existsSync(join(deckWork, 'assets/logo-note.txt')));
  assert.ok(!existsSync(join(deckWork, 'assets/pics')));
  assert.ok(existsSync(join(deckWork, 'assets/fonts')), 'assets/fonts is the engine\'s and stays');
});

test('deleting the work folder and making again rebuilds the same output from the project and brand folders alone', () => {
  const html = readFileSync(join(deck, 'out/slides/index.html'), 'utf8');
  rmSync(deckWork, { recursive: true, force: true });
  rmSync(join(deck, 'out'), { recursive: true, force: true });
  const r = make(deck);
  assert.equal(r.status, 0, r.out);
  for (const f of ['slides/index.html', 'handout.pdf', 'walkthrough.mp4', 'check.json']) assert.ok(existsSync(join(deck, 'out', f)), f);
  assert.equal(readFileSync(join(deck, 'out/slides/index.html'), 'utf8'), html);
  assert.equal(gitStatus(), gitBefore, 'still clean');
});

test('--to also copies the deliverables under the <id>- names', () => {
  const to = join(tmp, 'deliver');
  const r = make(deck, '--to', to);
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(readdirSync(to).sort(), ['demo-handout.pdf', 'demo-slides', 'demo-walkthrough.mp4']);
  assert.ok(existsSync(join(to, 'demo-slides', 'index.html')));
});

test('a failing check stops with its exit code, names check.json and exports nothing', () => {
  const bad = join(tmp, 'bad', 'Broken');
  newProject(bad, '--kind', 'deck');
  edit(join(bad, 'story.json'), (s) => { s.scenes[0].layout = 'layouts/no-such-layout'; });
  const r = make(bad);
  assert.equal(r.status, 1, r.out);
  const work = workOf(bad);
  assert.ok(r.out.includes(join(work, 'out', 'check.json')), `says where check.json is: ${r.out.slice(-400)}`);
  assert.ok(!existsSync(join(work, 'out', 'handout.pdf')), 'no export ran');
  assert.ok(!existsSync(join(bad, 'out', 'handout.pdf')));
  assert.ok(existsSync(join(bad, 'out', 'check.json')), 'the failing report is copied to the project');
});

test('--check-only writes out/check.json and no deliverables', () => {
  const dir = join(tmp, 'checks', 'Only');
  newProject(dir, '--kind', 'film', '--formats', '16x9');
  const r = make(dir, '--check-only');
  assert.equal(r.status, 0, r.out);
  assert.deepEqual(readdirSync(join(dir, 'out')), ['check.json']);
  assert.equal(readJson(join(dir, 'out/check.json')).complete, true);
});

test('a film is copied back as <id>-<format>.mp4 and poster.png, and --to uses the same names', () => {
  const dir = join(tmp, 'films', 'Teaser');
  newProject(dir, '--kind', 'film', '--formats', '16x9');
  const to = join(tmp, 'films-out');
  const r = make(dir, '--to', to);
  assert.equal(r.status, 0, r.out);
  for (const f of ['teaser-16x9.mp4', 'poster.png', 'check.json']) assert.ok(existsSync(join(dir, 'out', f)), f);
  assert.equal(probeVideo(join(dir, 'out/teaser-16x9.mp4')).width, 1920);
  assert.deepEqual(readdirSync(to), ['teaser-16x9.mp4']);
  assert.ok(!readdirSync(join(dir, 'out')).some((f) => f.endsWith('.partial') || f.includes('loop_check')), 'only the deliverables are copied');
});

test('usage mistakes exit 2: not a project, a vanished brand, no folder', () => {
  assert.equal(make(join(tmp, 'not-a-project')).status, 2);
  assert.equal(mm(['project', 'make']).status, 2);
  assert.equal(mm(['project', 'path', join(tmp, 'not-a-project')]).status, 2);
  const orphan = join(tmp, 'orphans', 'Lost');
  const moved = join(tmp, 'moved-brand');
  assert.equal(mm(['brand', 'init', moved]).status, 0);
  assert.equal(mm(['project', 'new', orphan, '--brand', moved, '--kind', 'deck']).status, 0);
  rmSync(moved, { recursive: true });
  const r = make(orphan);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /brand\.json/);
});

test('a brand with a ground mark carries it into the work piece and the slides', () => {
  const marked = join(tmp, 'Marked Brand');
  assert.equal(mm(['brand', 'init', marked, '--from', 'draftline']).status, 0);
  const dir = join(tmp, 'marked', 'Grid');
  const r = mm(['project', 'new', dir, '--brand', marked, '--kind', 'deck']);
  assert.equal(r.status, 0, r.out);
  const work = workOf(dir);
  const made = make(dir);
  assert.equal(made.status, 0, made.out);
  assert.ok(existsSync(join(work, 'assets/ground/draftline-grid.svg')));
  assert.equal(readJson(join(work, 'style.json')).ground.mark.src, 'assets/ground/draftline-grid.svg');
  assert.ok(!readFileSync(join(dir, 'out/slides/index.html'), 'utf8').includes('../'));
  assert.ok(!made.out.includes('still contains'), 'the export has no warning about the page');
});
