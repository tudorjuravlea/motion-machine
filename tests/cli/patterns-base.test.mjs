// A piece's patternsBase is code the machine runs (pattern.js is imported in Node), so it is read
// only from the piece's module script and must stay inside the repository. A path planted in a
// comment is ignored; one planted in the script is a setup error (exit 2) and no outside code runs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { patternsBaseOf } from '../../scripts/lib/patterns-base.mjs';
import { editContext } from '../../scripts/lib/story-edit.mjs';
import { resolvePatternsBase } from '../../scripts/sound.mjs';
import { ROOT, mm, workCopy } from './cli-helpers.mjs';

let w, outside, marker;
before(() => {
  w = workCopy('pbase');
  outside = mkdtempSync(join(tmpdir(), 'mm-outside-'));
  marker = join(outside, 'PWNED.txt');
  // a pattern outside the repository that leaves a file behind when Node imports it
  const pat = join(outside, 'pats', 'entrances', 'fade-up');
  mkdirSync(pat, { recursive: true });
  writeFileSync(join(pat, 'pattern.js'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'ran');\nexport default { dur: 0.5 };\n`);
});
after(() => { w.cleanup(); rmSync(outside, { recursive: true, force: true }); });

const piece = (name, html, files = {}) => {
  const dir = join(w.dir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  for (const [f, text] of Object.entries(files)) writeFileSync(join(dir, f), text);
  return dir;
};
const page = (script, { src = '', before = '' } = {}) => `<!doctype html>\n<html><body>${before}\n<script type="module"${src}>${script}</script>\n</body></html>\n`;
const mountWith = (base) => `import { mount } from '../../runtime/kit/kit.js';\nawait mount({ story, style, patternsBase: new URL(${JSON.stringify(base)}, import.meta.url) });`;
const outsideUrl = () => `file://${join(outside, 'pats')}/`;

test('no declaration: the repository patterns; an inside base resolves from the script file', () => {
  assert.equal(patternsBaseOf(piece('none', page('console.log(1)'))), join(ROOT, 'patterns'));
  assert.equal(patternsBaseOf(piece('inside', page(mountWith('./patterns/')))), join(w.dir, 'inside', 'patterns'));
  const srcDir = piece('srcmod', page('', { src: ' src="piece.js"' }), { 'piece.js': mountWith('../patterns/') });
  assert.equal(patternsBaseOf(srcDir), join(w.dir, 'patterns'));
});

test('a path in an HTML comment, a JS comment, a classic script or a script from elsewhere is not read', () => {
  const comment = piece('c-html', page('console.log(1)', { before: `<!-- patternsBase: new URL('${outsideUrl()}') -->` }));
  assert.equal(patternsBaseOf(comment), join(ROOT, 'patterns'));
  const jsComment = piece('c-js', page(`// patternsBase: new URL('${outsideUrl()}')\n/* patternsBase: new URL('${outsideUrl()}') */\n${mountWith('./patterns/')}`));
  assert.equal(patternsBaseOf(jsComment), join(w.dir, 'c-js', 'patterns'));
  const classic = piece('c-classic', `<script>({ patternsBase: new URL('${outsideUrl()}') })</script>`);
  assert.equal(patternsBaseOf(classic), join(ROOT, 'patterns'));
  const remote = piece('c-remote', page('', { src: ` src="https://example.com/x.js"` }));
  assert.equal(patternsBaseOf(remote), join(ROOT, 'patterns'));
});

test('a base outside the repository, in the script, is a one-line setup error: absolute, file URL, ../, http, symlink', () => {
  const link = join(w.dir, 'linkout');
  symlinkSync(join(outside, 'pats'), link);
  const bases = [join(outside, 'pats') + '/', outsideUrl(), '../../../../../../../../tmp/', 'https://example.com/patterns/', '../linkout/'];
  for (const [i, base] of bases.entries()) {
    const dir = piece(`bad-${i}`, page(mountWith(base)));
    assert.throws(() => patternsBaseOf(dir), (e) => e.exitCode === 2 && !/\n/.test(e.message) && /patternsBase/.test(e.message), base);
  }
  const srcDir = piece('bad-src', page('', { src: ' src="piece.js"' }), { 'piece.js': mountWith(outsideUrl()) });
  assert.throws(() => patternsBaseOf(srcDir), /outside the repository/);
});

test('every reader refuses it: the gate, the editing service and mm sound; no outside pattern.js runs', async () => {
  const dir = piece('evil', page(mountWith(outsideUrl())));
  for (const f of ['story.json', 'style.json']) writeFileSync(join(dir, f), readFileSync(join(w.film, f)));
  const r = mm(['check', dir, '--format', '16x9']);
  assert.equal(r.status, 2, r.out);
  assert.equal(r.stderr.trim().split('\n').length, 1, r.stderr);
  assert.match(r.stderr, /patternsBase .*outside the repository/);
  await assert.rejects(editContext(dir), /outside the repository/);
  assert.throws(() => resolvePatternsBase(dir, null), /outside the repository/);
  assert.equal(existsSync(marker), false, 'the outside pattern.js was imported');
});

test('mm studio refuses to start on it, exit 2', () => {
  const r = mm(['studio', join(w.dir, 'evil')], { timeout: 30_000 });
  assert.equal(r.status, 2, r.out);
  assert.match(r.stderr, /outside the repository/);
  assert.equal(existsSync(marker), false);
});
