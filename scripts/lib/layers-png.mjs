// PNG in and out for `mm media layers`. The encoder writes 8-bit RGBA or grey with no ancillary
// chunks (no gamma, no colour profile, no time), so a picture decodes to the same pixels in Node and
// in the browser and the same pixels always give the same bytes. Each row takes the PNG filter whose
// output has the smallest sum of magnitudes. Pictures that are not 8-bit PNGs are converted by ffmpeg.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { decodePng } from '../check/_pixels.mjs';

const CRC = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

/**
 * Encodes { width, height, data } (RGBA bytes) as a PNG. `channels: 1` writes grey from the red
 * channel; `channels: 4` (default) writes RGBA. Returns a Buffer.
 */
export function encodePng({ width, height, data }, { channels = 4 } = {}) {
  const ch = channels === 1 ? 1 : 4, stride = width * ch;
  const px = Buffer.alloc(stride * height);
  if (ch === 4) Buffer.from(data.buffer, data.byteOffset, width * height * 4).copy(px);
  else if (data.length === width * height) Buffer.from(data.buffer, data.byteOffset, width * height).copy(px);
  else for (let i = 0; i < width * height; i++) px[i] = data[i * 4];
  const raw = Buffer.alloc((stride + 1) * height), row = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const cur = y * stride, up = cur - stride;
    let best = 0, bestSum = Infinity, bestRow = null;
    for (let f = 0; f < 5; f++) {
      let sum = 0;
      for (let x = 0; x < stride; x++) {
        const a = x >= ch ? px[cur + x - ch] : 0, b = y ? px[up + x] : 0, c = x >= ch && y ? px[up + x - ch] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (px[cur + x] - pred) & 255;
        row[x] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) { bestSum = sum; best = f; bestRow = Buffer.from(row); }
    }
    raw[y * (stride + 1)] = best;
    bestRow.copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = ch === 4 ? 6 : 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * Reads a picture file to { width, height, data } (RGBA bytes). An 8-bit PNG is decoded here; any
 * other picture (a JPEG, a 16-bit or interlaced PNG, a WebP) is converted to RGBA by ffmpeg first.
 * Throws with a one-line message when neither can read it.
 */
export function readPicture(file) {
  const buf = readFileSync(file);
  try { return decodePng(buf); } catch { /* not a plain 8-bit PNG: let ffmpeg convert it */ }
  const dir = mkdtempSync(join(tmpdir(), 'mm-layers-'));
  try {
    const out = join(dir, 'p.png');
    const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-frames:v', '1', '-pix_fmt', 'rgba', out], { encoding: 'utf8' });
    if (r.error?.code === 'ENOENT') throw new Error(`ffmpeg not found on PATH: it reads pictures that are not 8-bit PNGs (${file})`);
    if (r.status !== 0) throw new Error(`could not read ${file} as a picture`);
    return decodePng(readFileSync(out));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
