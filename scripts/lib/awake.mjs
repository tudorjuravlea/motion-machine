// Keeps a Mac from sleeping while a long job runs: `caffeinate -i -w <pid>` holds the idle-sleep
// assertion until `release()` kills it, and `-w` makes caffeinate leave by itself if this process dies.
// Anywhere else, or without caffeinate, it does nothing and says nothing.
import { spawn } from 'node:child_process';

/** Returns release(); `platform` and `spawnFn` are injectable for tests. */
export function stayAwake({ platform = process.platform, spawnFn = spawn, pid = process.pid } = {}) {
  if (platform !== 'darwin') return () => {};
  let child;
  try {
    child = spawnFn('caffeinate', ['-i', '-w', String(pid)], { stdio: 'ignore' });
    child.on?.('error', () => {});   // no caffeinate on this machine: carry on
    child.unref?.();
  } catch { return () => {}; }
  return () => { try { child.kill(); } catch { /* already gone */ } };
}
