// One export of a piece at a time, across processes: <piece>/out/export.lock, created with
// O_EXCL, holds { pid, by, at, nonce }. `mm export` and `mm sound` take it for their run; the studio
// takes it for a whole Export (gate, render, mix, gate again) and hands it to the verbs it runs with
// MM_EXPORT_LOCK=<nonce>, so they run inside it. A second exporter is refused with ExportBusy. A lock
// whose pid is gone (a killed process) is broken by the next taker; a live one is never broken, since
// an export takes minutes. While the lock is held, story-edit refuses every write.
import { randomBytes } from 'node:crypto';
import { closeSync, linkSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';

/** Another export of the piece is running: nothing was done. */
export class ExportBusy extends Error {
  constructor(holder) {
    super(`an export of this piece is running (${holder?.by ?? 'another process'}, pid ${holder?.pid ?? '?'}); wait for it to end, or stop it`);
    this.name = 'ExportBusy'; this.holder = holder;
  }
}

const lockFile = (dir) => join(dir, 'out', 'export.lock');
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
/** The lock's text and holder; null when there is none. A lock being written (empty) reads as held by an unknown pid. */
function read(file) {
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { return null; }
  try { return { text, holder: JSON.parse(text) }; } catch { return { text, holder: { pid: null } }; }
}

/** The live holder ({ pid, by, at, nonce }) of the piece's export lock, or null. A dead holder's lock is removed. */
export function exportHolder(dir) {
  const file = lockFile(dir), got = read(file);
  if (!got) return null;
  if (!(Number.isInteger(got.holder.pid) && !alive(got.holder.pid))) return got.holder;
  // the holder is gone: set its lock aside; if another taker replaced it meanwhile, put that one back
  const aside = `${file}.${process.pid}-${randomBytes(4).toString('hex')}.stale`;
  try { renameSync(file, aside); } catch { return exportHolder(dir); }
  try { if (readFileSync(aside, 'utf8') !== got.text) linkSync(aside, file); } catch { /* a third taker holds it now */ }
  rmSync(aside, { force: true });
  return read(file)?.holder ?? null;
}

/**
 * Takes the piece's export lock for this process: { nonce, release }. With MM_EXPORT_LOCK naming the
 * lock's nonce, the caller runs inside a holder's run (the studio's) and takes nothing. Throws
 * ExportBusy while another live process holds it. The lock is released on release() or at exit.
 */
export function takeExportLock(dir, { by = 'mm', env = process.env } = {}) {
  const file = lockFile(dir);
  if (env.MM_EXPORT_LOCK && read(file)?.holder.nonce === env.MM_EXPORT_LOCK) return { nonce: env.MM_EXPORT_LOCK, inherited: true, release: () => {} };
  mkdirSync(join(dir, 'out'), { recursive: true });
  const nonce = randomBytes(6).toString('hex');
  const text = JSON.stringify({ pid: process.pid, by, at: new Date().toISOString(), nonce });
  for (let tries = 0; tries < 3; tries++) {
    try {
      const fd = openSync(file, 'wx');
      try { writeSync(fd, text); } finally { closeSync(fd); }
      const release = () => {
        process.off('exit', release);
        try { if (readFileSync(file, 'utf8') === text) rmSync(file); } catch { /* gone already */ }
      };
      process.on('exit', release);
      return { nonce, inherited: false, release };
    } catch (e) { if (e.code !== 'EEXIST') throw e; }
    const holder = exportHolder(dir);   // breaks a dead holder's lock
    if (holder) throw new ExportBusy(holder);
  }
  throw new ExportBusy(read(file)?.holder);
}
