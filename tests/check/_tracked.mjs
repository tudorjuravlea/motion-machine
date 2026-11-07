// Tests that enumerate the shipped pieces read the tracked ones only: a piece a user scaffolds
// next to them (`mm new --id hello`) is theirs, and must not turn the suite red. Outside a
// repository (a copy of the tree with no history) every folder counts.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';

/** Repo-relative paths of the tracked files under `dir`, or null when the tree is not a repository. */
export function trackedFiles(dir) {
  const r = spawnSync('git', ['ls-files', '-z', '--', dir], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0 || !r.stdout) return null;
  return r.stdout.split('\0').filter(Boolean).filter((f) => existsSync(join(ROOT, f)));
}

/** `pieces/<name>` for every tracked piece (a folder whose story.json is tracked), sorted. */
export function trackedPieces() {
  const files = trackedFiles('pieces');
  if (files) return [...new Set(files.filter((f) => /^pieces\/[^/]+\/story\.json$/.test(f)).map((f) => f.split('/').slice(0, 2).join('/')))].sort();
  return readdirSync(join(ROOT, 'pieces'), { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(ROOT, 'pieces', d.name, 'story.json'))).map((d) => `pieces/${d.name}`).sort();
}
