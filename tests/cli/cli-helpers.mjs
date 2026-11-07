// Shared by the CLI tests: work copies of fixtures/kit-smoke, the router, small readers.
// A work copy lives at <repo>/.tmp-cli-<name>-<pid>/kit-smoke so that the fixture's relative
// imports (../../../runtime/kit/kit.js) resolve exactly as in fixtures/kit-smoke; it is removed
// by `cleanup()`. (Delete `.tmp-cli-*` by hand if a run is killed.) The fixture's git-ignored out/
// folders are not copied: a copy starts with no gate report and no export.
import { spawnSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT } from '../../scripts/lib/browser.mjs';
import { versionOf } from '../../scripts/lib/story-version.mjs';

export { ROOT };
export const MM = join(ROOT, 'scripts', 'mm.mjs');

export function workCopy(name) {
  const dir = join(ROOT, `.tmp-cli-${name}-${process.pid}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  cpSync(join(ROOT, 'fixtures', 'kit-smoke'), join(dir, 'kit-smoke'), { recursive: true, filter: (src) => basename(src) !== 'out' });
  return { dir, film: join(dir, 'kit-smoke', 'film'), deck: join(dir, 'kit-smoke', 'deck'), patterns: join(dir, 'kit-smoke', 'patterns'), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Writes a finished out/check.json of the story as it is now, over `formats` (the story's by default), as the gate would. */
export function stampChecked(pieceDir, status = 'PASS', formats = null) {
  mkdirSync(join(pieceDir, 'out'), { recursive: true });
  const text = readFileSync(join(pieceDir, 'story.json'), 'utf8');
  writeFileSync(join(pieceDir, 'out', 'check.json'), JSON.stringify({ spec: '0.11', version: versionOf(text), formats: formats ?? JSON.parse(text).formats, complete: true, rules: [{ id: 'G-TEST', status, evidence: {} }] }));
}

export function mm(args, { env, timeout = 170_000, cwd } = {}) {
  const r = spawnSync(process.execPath, [MM, ...args], { encoding: 'utf8', env: { ...process.env, ...env }, timeout, maxBuffer: 32 << 20, cwd });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** ffprobe's first video stream as an object, plus the container tags. */
export function probeVideo(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,pix_fmt,color_space,color_range,color_transfer,color_primaries,nb_read_frames,duration:format_tags=comment', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  return { ...j.streams[0], comment: j.format?.tags?.comment ?? null };
}

/** A solid-colour PNG, built here so the sheet tests need no fixtures. */
export function solidPng(width, height, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); data.copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: width }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
