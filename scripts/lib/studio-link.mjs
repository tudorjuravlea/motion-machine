// Where a piece's studio is. While `mm studio` serves a piece it notes its page's address in
// <piece>/out/studio/server.json (with its pid), and removes the note when it stops; `mm export` ends
// with that link when the studio answers, or with the command that starts one, so the timeline
// editor is always one step from a finished render.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** The note a serving studio keeps for its piece. */
export const serverFile = (dir) => join(dir, 'out', 'studio', 'server.json');

/** Notes that this process serves `dir`'s studio at `url`. */
export function noteStudio(dir, url) {
  mkdirSync(join(dir, 'out', 'studio'), { recursive: true });
  writeFileSync(serverFile(dir), `${JSON.stringify({ url, pid: process.pid })}\n`);
}

/** Removes the note, if it is this process's (another studio may have taken the piece since). */
export function forgetStudio(dir) {
  try {
    if (JSON.parse(readFileSync(serverFile(dir), 'utf8')).pid === process.pid) rmSync(serverFile(dir));
  } catch { /* none, or not readable: nothing to remove */ }
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** The URL of a studio serving `dir` now, or null: the note's process lives and its page answers. */
export async function liveStudio(dir, { timeoutMs = 800 } = {}) {
  let note;
  try { note = JSON.parse(readFileSync(serverFile(dir), 'utf8')); } catch { return null; }
  if (typeof note?.url !== 'string' || !Number.isInteger(note.pid) || !alive(note.pid)) return null;
  try {
    const res = await fetch(note.url, { signal: AbortSignal.timeout(timeoutMs) });
    await res.body?.cancel();
    return res.ok ? note.url : null;
  } catch { return null; }
}

/** The line `mm export` ends with: the live studio's link, or the command that opens one. */
export async function studioLine(dir, opts) {
  const url = await liveStudio(dir, opts);
  if (url) return `studio: ${url}`;
  const rel = relative(process.cwd(), dir) || '.';
  return `studio: mm studio ${/\s/.test(rel) ? JSON.stringify(rel) : rel} --open (the piece as a timeline; edit, then export from it)`;
}
