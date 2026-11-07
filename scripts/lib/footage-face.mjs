// Where the speaker's head is, read from the person matte, so graphics can keep clear of it (the face
// box of runtime/kit/speaker.js). Pure and in Node, like the rest of the matte clean-up.
//
// A matte is one byte per pixel, white where the person is. The head is the top of the person: from
// the first row that holds the person down to the row where the shoulders begin, which is the first row
// that is empty (a head with a gap under it) or that is wider than HEAD_JUMP times the widest row of
// the head so far. The head is never less than MIN_ROWS of the frame's height (a disc's first rows grow
// fast), and never more than MAX_SHARE of the person's visible height (a speaker close enough to fill
// the width has no shoulder step to find). Boxes are shares of the frame, [x0, y0, x1, y1].

/** A row counts as holding the person when this share of the frame's width is lit. */
export const ROW_MIN = 0.01;
/** The shoulders: a row this many times wider than the widest row of the head so far. */
export const HEAD_JUMP = 1.5;
/** The head is at least this share of the frame's height. */
export const MIN_ROWS = 0.05;
/** The head is at most this share of the person's visible height. */
export const MAX_SHARE = 0.6;

const r4 = (x) => Math.round(x * 10000) / 10000;

/** The head's box in shares of the frame, or null when the mask holds no person. */
export function headBox(mask, w, h) {
  const lit = 128, minRow = Math.max(2, Math.round(w * ROW_MIN));
  const count = new Int32Array(h), left = new Int32Array(h).fill(w), right = new Int32Array(h).fill(-1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (mask[y * w + x] >= lit) { count[y]++; if (x < left[y]) left[y] = x; right[y] = x; }
  }
  let top = -1, bottom = -1;
  for (let y = 0; y < h; y++) if (count[y] >= minRow) { if (top < 0) top = y; bottom = y; }
  if (top < 0) return null;
  const minRows = Math.round(h * MIN_ROWS), maxRows = Math.max(minRows, Math.round((bottom - top + 1) * MAX_SHARE));
  let end = top, widest = 0;
  for (let y = top; y <= bottom; y++) {
    const n = y - top;
    if (count[y] < minRow && n >= 1) break;
    if (n >= minRows && widest > 0 && count[y] > widest * HEAD_JUMP) break;
    if (n >= maxRows) break;
    widest = Math.max(widest, count[y]);
    end = y;
  }
  let x0 = w, x1 = -1;
  for (let y = top; y <= end; y++) if (count[y] > 0) { x0 = Math.min(x0, left[y]); x1 = Math.max(x1, right[y]); }
  return [r4(x0 / w), r4(top / h), r4((x1 + 1) / w), r4((end + 1) / h)];
}
