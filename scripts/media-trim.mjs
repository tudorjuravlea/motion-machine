#!/usr/bin/env node
// mm media trim <video> --from <s> --to <s> --name <n> [--piece <dir>]
// A fast cut by stream copy: no re-encode, every stream kept (-c copy), into <piece>/assets/<n>.<the
// source's extension>, with a record <n>.trim.json (the source's name and sha1, the span asked for, the
// span written). A stream copy can only start on a keyframe, so the cut starts at the keyframe at or
// before --from, and says so; for a frame-exact cut use mm media prep --trim.
// Exit 0 written, 1 ffmpeg failed (no partial file is left), 2 usage.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { isArgsError, usageText } from './lib/cli.mjs';
import { bin, runFfmpeg } from './lib/ffmpeg.mjs';

const fail = (message, exitCode) => Object.assign(new Error(message), { exitCode });
const ffprobe = (args) => {
  const r = spawnSync(bin('ffprobe'), ['-v', 'error', ...args], { encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.error || r.status !== 0) throw new Error(r.error?.message ?? r.stderr.trim().split('\n').pop());
  return r.stdout;
};
const num = (x) => Math.round(x * 1000) / 1000;
const sec = (x) => `${x.toFixed(3)} s`;

export async function trim({ file, from, to, name, piece = '.' }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(name))) throw fail('--name must be lowercase letters, digits and hyphens', 2);
  if (!Number.isFinite(from) || from < 0 || !Number.isFinite(to)) throw fail('--from and --to are seconds, --from at least 0', 2);
  if (!(to > from)) throw fail('--to must be after --from', 2);
  if (!existsSync(file)) throw fail(`no such file: ${file}`, 2);
  let duration, keys;
  try {
    duration = Number(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
    keys = ffprobe(['-skip_frame', 'nokey', '-select_streams', 'v:0', '-show_entries', 'frame=pts_time', '-of', 'csv=p=0', file])
      .split('\n').map((l) => Number(l.trim().split(',')[0])).filter((x) => l_ok(x)).sort((a, b) => a - b);
  } catch (e) { throw fail(`ffmpeg could not read ${basename(file)}: ${e.message}`, 1); }
  if (!keys.length) throw fail(`${basename(file)} has no video keyframes to cut on`, 2);
  if (!(duration > 0)) throw fail(`ffmpeg could not read the length of ${basename(file)}`, 1);
  if (from >= duration) throw fail(`--from ${from} is past the end of ${basename(file)} (${sec(duration)})`, 2);
  const start = [...keys].reverse().find((k) => k <= from + 1e-6) ?? keys[0];
  const end = Math.min(to, duration);
  const dir = join(resolve(piece), 'assets');
  mkdirSync(dir, { recursive: true });
  const ext = extname(file);
  const out = join(dir, `${name}${ext}`);
  const tmp = join(dir, `.${name}.partial${ext}`);
  try {
    await runFfmpeg(['-ss', String(start), '-i', file, '-t', String(end - start), '-map', '0', '-c', 'copy', '-avoid_negative_ts', 'make_zero', tmp]);
    const written = Number(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]).trim());
    renameSync(tmp, out);
    const note = start < from - 1e-6
      ? `starts at ${sec(start)}, the keyframe at or before ${sec(from)}; for a frame-exact cut use mm media prep --trim`
      : `starts at ${sec(start)}, on a keyframe`;
    const record = { kind: 'stream-copy trim', source: { file: basename(file), sha1: createHash('sha1').update(readFileSync(file)).digest('hex') },
      asked: { from: num(from), to: num(to) }, written: { from: num(start), to: num(start + written), duration: num(written), keyframe: num(start) }, note };
    writeFileSync(join(dir, `${name}.trim.json`), `${JSON.stringify(record, null, 2)}\n`);
    return { out, record };
  } catch (e) {
    rmSync(tmp, { force: true });
    if (e.exitCode) throw e;
    throw fail(`ffmpeg could not trim ${basename(file)}: ${String(e.message).trim().split('\n').slice(-2).join(' ')}`, 1);
  }
}
const l_ok = (x) => Number.isFinite(x);

export async function main(argv) {
  try {
    const { values: v, positionals: p } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      from: { type: 'string' }, to: { type: 'string' }, name: { type: 'string' }, piece: { type: 'string' } } });
    if (p.length !== 1 || v.from == null || v.to == null || !v.name) throw fail(usageText('media trim'), 2);
    const { out, record } = await trim({ file: p[0], from: Number(v.from), to: Number(v.to), name: v.name, piece: v.piece });
    console.log(`wrote ${out} (${sec(record.written.duration)}, every stream copied, not re-encoded) and ${basename(out, extname(out))}.trim.json; ${record.note}`);
    return 0;
  } catch (e) { console.error(isArgsError(e) ? `${e.message}\n${usageText('media trim')}` : e.message); return e.exitCode ?? 2; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
