// The package, packed and unpacked somewhere else, works: its verbs load (every import is shipped),
// a piece scaffolds in it and the gate runs on that piece. The tarball holds no dot-folder, no
// scratch folder and no output. (pack-imports.test.mjs checks the import graph without packing.)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';

let tmp, listed, pkg;
const run = (args, cwd = pkg) => {
  const r = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 170_000 });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'mm-pack-'));
  const p = spawnSync('npm', ['pack', '--json', '--pack-destination', tmp], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(p.status, 0, p.stderr);
  const [info] = JSON.parse(p.stdout);
  listed = info.files.map((f) => f.path);
  const t = spawnSync('tar', ['-xzf', join(tmp, info.filename), '-C', tmp], { encoding: 'utf8' });
  assert.equal(t.status, 0, t.stderr);
  pkg = join(tmp, 'package');
  symlinkSync(join(ROOT, 'node_modules'), join(pkg, 'node_modules'));   // the dependencies an install would fetch
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test('the tarball holds no dot-folder, no scratch folder, no output and no test', () => {
  assert.ok(listed.includes('scripts/mm.mjs') && listed.includes('scripts/lib/validate.mjs') && listed.includes('runtime/kit/kit.js'));
  const stray = listed.filter((f) => /(^|\/)\.[^/]+\//.test(f) || /(^|\/)out\//.test(f) || f.startsWith('tests/') || f.startsWith('fixtures/'));
  assert.deepEqual(stray, []);
});

test('in the unpacked package: export --help prints its usage and exits 0', () => {
  const r = run(['scripts/mm.mjs', 'export', '--help']);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /^usage: mm export/);
  assert.doesNotMatch(r.out, /ERR_MODULE_NOT_FOUND|Cannot find module/);
});

test('in the unpacked package: a scaffolded piece loads in the timeline and the gate runs on it', () => {
  const made = run(['scripts/mm.mjs', 'new', '--kind', 'film', '--style', 'editorial', '--id', 'packed']);
  assert.equal(made.status, 0, made.out);
  const tl = run(['scripts/mm.mjs', 'timeline', 'pieces/packed', '--json']);
  assert.equal(tl.status, 0, tl.out);
  assert.doesNotMatch(tl.out, /ERR_MODULE_NOT_FOUND|Cannot find module/);
  const gate = run(['scripts/mm.mjs', 'check', 'pieces/packed', '--quiet']);
  assert.ok(gate.status === 0 || gate.status === 1, `exit ${gate.status}: ${gate.out}`);   // the gate ran: 0 or 1, not a crash (2)
  assert.doesNotMatch(gate.out, /ERR_MODULE_NOT_FOUND|Cannot find module/);
  const report = JSON.parse(readFileSync(join(pkg, 'pieces', 'packed', 'out', 'check.json'), 'utf8'));
  assert.equal(report.complete, true);
  assert.ok(report.rules.length >= 30);
  assert.ok(existsSync(join(pkg, 'pieces', 'packed', 'story.json')));
});
