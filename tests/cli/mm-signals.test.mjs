// The verb router passes a stop signal on to the verb it runs: `kill <mm pid>` must also stop
// a verb that runs until killed, such as `mm studio`, and mm exits with the child's code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

const urlOf = (child) => new Promise((resolve, reject) => {
  let out = '';
  const timer = setTimeout(() => reject(new Error(`no URL printed: ${out}`)), 15000);
  child.stdout.on('data', (b) => { out += b; const m = out.match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
});

const exited = (child) => new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));

test('SIGTERM to mm stops `mm studio` too, and mm exits', async () => {
  const mm = spawn(process.execPath, [join(ROOT, 'scripts', 'mm.mjs'), 'studio', 'pieces/golden-film-kinetic'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const done = exited(mm);
  try {
    const url = await urlOf(mm);
    assert.equal((await fetch(`${url}/api/piece`)).status, 200);
    mm.kill('SIGTERM');
    const r = await Promise.race([done, new Promise((res) => setTimeout(() => res('timeout'), 5000))]);
    assert.notEqual(r, 'timeout', 'mm did not exit after SIGTERM');
    await assert.rejects(fetch(`${url}/api/piece`), 'the studio server is still answering after mm was stopped');
  } finally { mm.kill('SIGKILL'); }
});
