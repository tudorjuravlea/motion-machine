// Ingest hygiene for a recording (a Playwright session, a screen recorder). A WebM written while it
// streams cannot go back and write its duration, so it carries none or a wrong one; the length of the
// recording is then read from its video packets. And a recorder that starts before the page paints can
// open on black, which a film should know before it cuts the recording in.
//
// The distrust of the container's duration and the black-first-frame test are restated from OpenScreen
// (siddharthvaddem/openscreen, MIT, Copyright (c) 2025 Siddharth Vaddem; see NOTICE): scan the packets, use
// the scan when the container is not finite, not positive or more than 1.5 s off; luma from the weights
// 54, 183 and 19 over 256, visible if its largest value is above 24 or its mean above 4.
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { bin } from './ffmpeg.mjs';

/** How far the container's duration may be from the packets' before the packets win, in seconds. */
export const TOLERANCE_S = 1.5;

/** Which duration to believe: the container's if it is a positive number within TOLERANCE_S of the scan, else the scan. */
export function chooseDuration(container, scanned) {
  const sound = Number.isFinite(container) && container > 0;
  if (sound && (!(scanned > 0) || Math.abs(container - scanned) <= TOLERANCE_S)) return { seconds: container, source: 'container' };
  return { seconds: scanned > 0 ? scanned : 0, source: 'scan' };
}

/**
 * The duration of a recording, from its packets: the end of the last video packet (its time plus its
 * length, or the frame interval when the file gives none). `{ seconds, source: 'container'|'scan',
 * packets, container }`; throws, naming the file, if it has no video packet.
 */
export function scanDuration(file) {
  const probe = (args) => spawnSync(bin('ffprobe'), ['-v', 'error', ...args, file], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const pk = probe(['-select_streams', 'v:0', '-show_entries', 'packet=pts_time,duration_time', '-of', 'csv=p=0']);
  if (pk.status !== 0) throw new Error(`ffprobe could not read ${basename(file)}: ${String(pk.stderr).trim().split('\n').pop()}`);
  const rows = pk.stdout.trim().split('\n').filter(Boolean).map((l) => l.split(',').map(Number)).filter(([pts]) => Number.isFinite(pts));
  if (!rows.length) throw new Error(`${basename(file)} has no video packets to measure`);
  const first = Math.min(...rows.map((r) => r[0])), lastPts = Math.max(...rows.map((r) => r[0]));
  const interval = rows.length > 1 ? (lastPts - first) / (rows.length - 1) : 0;
  const end = Math.max(...rows.map(([pts, dur]) => pts + (Number.isFinite(dur) && dur > 0 ? dur : interval)));
  const f = probe(['-show_entries', 'format=duration', '-of', 'csv=p=0']);
  const container = Number(String(f.stdout).trim());
  return { ...chooseDuration(container, end), packets: rows.length, container: Number.isFinite(container) ? container : null, scanned: end };
}

/**
 * Whether a recording opens on black: its first frame, scaled to 64 by 64 (4096 px), judged by luma
 * (54 R + 183 G + 19 B) / 256. Not black when the largest luma is above 24 or the mean above 4.
 * `{ black, max, mean }`.
 */
export function firstFrame(file) {
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', 'scale=64:64', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 24 });
  if (r.status !== 0 || r.stdout.length < 64 * 64 * 3) throw new Error(`ffmpeg could not decode the first frame of ${basename(file)}: ${String(r.stderr).trim().split('\n').pop()}`);
  let max = 0, sum = 0;
  const px = 64 * 64;
  for (let i = 0; i < px; i++) {
    const y = (54 * r.stdout[i * 3] + 183 * r.stdout[i * 3 + 1] + 19 * r.stdout[i * 3 + 2]) >> 8;
    if (y > max) max = y;
    sum += y;
  }
  const mean = sum / px;
  return { black: !(max > 24 || mean > 4), max, mean: Math.round(mean * 100) / 100 };
}

/**
 * The sync flashes in the first `untilS` seconds of a recording: the time of the first frame of each
 * run of frames that are mostly red. A session shows red full-frame for a moment, three times, before
 * it starts, and when each reaches the video says where the video's own clock stands against the one the
 * script kept. Seconds, in order; none when the recording has no red run (or opens on one).
 */
export function findFlashes(file, untilS) {
  const w = 32, h = 20, px = w * h;
  const pk = spawnSync(bin('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', file], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const times = pk.stdout.trim().split('\n').map(Number).filter(Number.isFinite);
  const r = spawnSync(bin('ffmpeg'), ['-v', 'error', '-t', String(untilS), '-i', file, '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 26 });
  if (r.status !== 0) return [];
  const n = Math.floor(r.stdout.length / (px * 3)), starts = [];
  let on = false;
  for (let i = 0; i < n; i++) {
    let red = 0;
    for (let p = 0; p < px; p++) { const o = (i * px + p) * 3; if (r.stdout[o] > 200 && r.stdout[o + 1] < 70 && r.stdout[o + 2] < 70) red++; }
    const isRed = red >= px * 0.6;
    if (isRed && !on && i > 0 && Number.isFinite(times[i])) starts.push(times[i]);
    on = isRed;
  }
  return starts;
}
