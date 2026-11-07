// `mm doctor` warns when the keys file (`$HOME/.config/motion-machine/keys.env`, read by `mm gen`) can be read by
// the group or by others, and says how to close it. It never changes the file's mode itself, and a loose file is a
// warning: the tools are fine, so the exit code stays 0. A temporary HOME holds every file here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { keysFileMode } from '../../scripts/lib/gen/keys.mjs';
import { mm } from './cli-helpers.mjs';

// Playwright looks for its browser under the home folder; a temporary HOME must be told where the real one is
const BROWSERS = /^(.*ms-playwright)\//.exec(chromium.executablePath())?.[1];
const env = (home) => ({ HOME: home, ...(BROWSERS ? { PLAYWRIGHT_BROWSERS_PATH: BROWSERS } : {}) });

function homeWith(mode) {
  const home = mkdtempSync(join(tmpdir(), 'mm-doctor-home-'));
  if (mode == null) return { home, file: null };
  const dir = join(home, '.config', 'motion-machine');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'keys.env');
  writeFileSync(file, ['KIE', 'API', 'KEY'].join('_') + '=' + ['fixture', 'not', 'a', 'key'].join('-') + '\n');   // built: no literal reads as a key
  chmodSync(file, mode);
  return { home, file };
}

test('keysFileMode: loose for group- or world-readable, tight for owner-only, null when there is no file', () => {
  assert.equal(keysFileMode(homeWith(null).home), null);
  assert.equal(keysFileMode(homeWith(0o600).home).loose, false);
  assert.equal(keysFileMode(homeWith(0o400).home).loose, false);
  for (const mode of [0o644, 0o640, 0o604, 0o666, 0o660]) assert.equal(keysFileMode(homeWith(mode).home).loose, true, mode.toString(8));
  assert.equal(keysFileMode(homeWith(0o644).home).mode, 0o644);
});

test('doctor warns about a 0644 keys file, names it and the fix, exits 0 and leaves the mode alone', () => {
  const { home, file } = homeWith(0o644);
  const r = mm(['doctor'], { env: env(home) });
  assert.equal(r.status, 0, r.out);
  assert.match(r.stdout, /WARNING\s+keys/);
  assert.match(r.stdout, /644/);
  assert.match(r.stdout, /chmod 600 .*keys\.env/);
  assert.ok(!r.out.includes('fixture-not-a-key'), 'the file\'s contents are never printed');
  assert.equal(statSync(file).mode & 0o777, 0o644, 'doctor installs and changes nothing');
});

test('doctor is quiet about a 0600 keys file (ok) and about no keys file at all', () => {
  const tight = mm(['doctor'], { env: env(homeWith(0o600).home) });
  assert.equal(tight.status, 0, tight.out);
  assert.match(tight.stdout, /ok\s+keys/);
  assert.doesNotMatch(tight.stdout, /WARNING/);
  const none = mm(['doctor'], { env: env(homeWith(null).home) });
  assert.equal(none.status, 0, none.out);
  assert.doesNotMatch(none.stdout, /keys/);
});
