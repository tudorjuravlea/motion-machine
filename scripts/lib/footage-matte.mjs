// The person matte's clean-up, pure and in Node so the same masks give the same bytes on every run.
// A segmenter decides frame by frame, so its edge wanders a pixel or two and now and then a whole limb
// drops out for one frame: on a cut-out that reads as a flickering halo. Two steps answer it:
//   1. a temporal median of each frame with the one before and the one after (the first and last
//      frames stand in for their missing neighbour), which removes a one-frame drop-out or a one-frame
//      blot and keeps an edge that moves steadily;
//   2. a feather: a box blur of the given radius run twice in each direction (close to a Gaussian),
//      with integer rounding, which turns the hard edge into a short ramp so the cut-out sits in the
//      new background instead of being pasted on it.
// Masks are one byte per pixel, white (255) where the person is. grayPng writes them as 8-bit grey PNG.
import { crc32, deflateSync } from 'node:zlib';

/** The per-pixel median of three masks of the same size. */
export function median3(a, b, c) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i], z = c[i];
    const lo = x < y ? x : y, hi = x < y ? y : x;
    out[i] = z < lo ? lo : z > hi ? hi : z;
  }
  return out;
}

// one box pass of radius r along rows (step 1, count w per line) or columns, edges clamped
function boxPass(src, w, h, r, alongRows) {
  const out = new Uint8Array(src.length), n = 2 * r + 1, half = n >> 1;
  const lines = alongRows ? h : w, len = alongRows ? w : h;
  const at = alongRows ? (line, k) => line * w + k : (line, k) => k * w + line;
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[at(line, Math.min(len - 1, Math.max(0, k)))];
    for (let k = 0; k < len; k++) {
      out[at(line, k)] = Math.floor((sum + half) / n);
      sum += src[at(line, Math.min(len - 1, k + r + 1))] - src[at(line, Math.max(0, k - r))];
    }
  }
  return out;
}

/** A soft edge: two box passes of radius r (whole px) across and down. Radius 0 returns a copy. */
export function feather(mask, w, h, r) {
  r = Math.max(0, Math.round(r));
  if (!r) return Uint8Array.from(mask);
  let m = mask;
  for (let pass = 0; pass < 2; pass++) { m = boxPass(m, w, h, r, true); m = boxPass(m, w, h, r, false); }
  return m;
}

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
};

/** An 8-bit grey PNG of the mask (each row filtered by its left neighbour, deflate level 9). */
export function grayPng(mask, w, h) {
  const raw = Buffer.alloc(h * (w + 1));
  for (let y = 0; y < h; y++) {
    const o = y * (w + 1), row = y * w;
    raw[o] = 1;   // Sub: a mask is long flat runs, so the left difference is mostly zero
    for (let x = 0; x < w; x++) raw[o + 1 + x] = (mask[row + x] - (x ? mask[row + x - 1] : 0)) & 255;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * matteSmoother(w, h, r, emit): push the raw masks in frame order, then end(); emit(i, mask) receives
 * each frame's median with its neighbours, feathered by r, in order. Holds at most three frames.
 */
export function matteSmoother(w, h, r, emit) {
  let prev = null, cur = null, i = 0;
  const out = (a, b, c) => emit(i++, feather(median3(a, b, c), w, h, r));
  return {
    push(mask) {
      if (mask.length !== w * h) throw new Error(`a mask holds ${mask.length} pixels, not ${w}x${h}`);
      if (cur === null) { cur = mask; return; }
      out(prev ?? cur, cur, mask);
      prev = cur; cur = mask;
    },
    end() { if (cur !== null) out(prev ?? cur, cur, cur); prev = cur = null; },
  };
}
