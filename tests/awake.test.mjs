// stayAwake: on macOS one `caffeinate -i -w <pid>` for the length of a job, released at the end; nothing elsewhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { stayAwake } from '../scripts/lib/awake.mjs';

test('on darwin it spawns caffeinate -i -w <pid>, ignoring stdio, and release() kills it', () => {
  const calls = []; let killed = 0, unref = 0;
  const spawnFn = (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { on() {}, unref: () => unref++, kill: () => killed++ }; };
  const release = stayAwake({ platform: 'darwin', spawnFn, pid: 4242 });
  assert.deepEqual(calls, [{ cmd: 'caffeinate', args: ['-i', '-w', '4242'], opts: { stdio: 'ignore' } }]);
  assert.equal(unref, 1);
  release();
  assert.equal(killed, 1);
});

test('on another platform it spawns nothing', () => {
  let n = 0;
  const release = stayAwake({ platform: 'linux', spawnFn: () => { n++; } });
  release();
  assert.equal(n, 0);
});

test('a missing caffeinate is silent', () => {
  const release = stayAwake({ platform: 'darwin', spawnFn: () => { throw new Error('ENOENT'); } });
  assert.doesNotThrow(release);
});

test('with the real caffeinate, release() ends the child', { skip: process.platform !== 'darwin' || spawnSync('which', ['caffeinate']).status !== 0 }, async () => {
  let child;
  const { spawn } = await import('node:child_process');
  const release = stayAwake({ platform: 'darwin', pid: process.pid, spawnFn: (...a) => (child = spawn(...a)) });
  assert.equal(child.exitCode, null);
  const exited = new Promise((r) => child.on('exit', r));
  release();
  await exited;
  assert.ok(child.killed);
});
