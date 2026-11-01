// Frame rates, exactly. A broadcast rate is a fraction (30000/1001), not a rounded decimal (29.97): a file
// written at 29.97 drifts from one written at 30000/1001 by a frame every 33 minutes, so the export writes
// the fraction and the read-back tells the two apart. Library only; Node.
//
//   exactFps(x)          { value, arg, name }: the exact value, the string ffmpeg takes, the name of the rate
//   nameOfRate(v)        "29.97" for 30000/1001, "30" for 30, null for a rate off the list
//   snapRate(v)          { num, den, name } of the common rate within 0.04% of v, or null
//   fractionOf("n/d")    { num, den, value } (null for 0/0 and anything else)
//   sameRate(a, b)       equal to within a part in a billion
//   detectRate(times)    { fps, snapped, constant, packets } from packet times in seconds (null for fewer than two distinct)
//
// The detector reads at most the first 256 packet times, sorts them, takes the 5th-percentile gap as a first
// period, and refines it by a least-squares fit of every time to a whole number of periods; the stream is
// constant when every gap is one period (to a fiftieth of it: a dropped
// frame is a gap of two).

/** The rates a file is expected to have, [numerator, denominator]; the broadcast ones are over 1001. */
export const COMMON_RATES = [[12, 1], [15, 1], [20, 1], [24000, 1001], [24, 1], [25, 1], [30000, 1001], [30, 1], [48000, 1001], [48, 1], [50, 1], [60000, 1001], [60, 1], [100, 1], [120000, 1001], [120, 1], [144, 1], [240, 1]];

/** The names people give the broadcast rates, by their numerator over 1001. */
const NTSC_NAMES = { 24000: '23.976', 30000: '29.97', 48000: '47.952', 60000: '59.94', 120000: '119.88' };
/** How far a typed rate may be from a broadcast rate and still mean it (23.976 is 0.00002 away; 24 is 0.024 away). */
const NTSC_TYPED_TOLERANCE = 0.005;
/** How far a measured rate may be from a common rate, relative: 30 and 29.97 are 0.1% apart. */
const SNAP_TOLERANCE = 0.0004;
const MAX_PACKETS = 256;

const nameOf = (num, den) => (den === 1001 ? NTSC_NAMES[num] ?? `${num}/${den}` : den === 1 ? String(num) : `${num}/${den}`);

/** Whether two rates are the same one: relative difference under a part in a billion. */
export const sameRate = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b));

/** { value, arg, name } for a rate asked for: 23.976, 29.97 and 59.94 (and 30000/1001 itself) become their fractions. */
export function exactFps(x) {
  for (const [num, den] of COMMON_RATES) {
    if (den !== 1001) continue;
    const v = num / den;
    if (Math.abs(x - v) < NTSC_TYPED_TOLERANCE) return { value: v, arg: `${num}/${den}`, name: NTSC_NAMES[num] };
  }
  return { value: x, arg: String(x), name: nameOfRate(x) ?? String(x) };
}

/** { num, den, name } of the common rate within 0.04% of `v`, else null. */
export function snapRate(v) {
  if (!(v > 0)) return null;
  let best = null;
  for (const [num, den] of COMMON_RATES) {
    const off = Math.abs(v - num / den) / (num / den);
    if (off <= SNAP_TOLERANCE && (!best || off < best.off)) best = { num, den, off };
  }
  return best ? { num: best.num, den: best.den, name: nameOf(best.num, best.den) } : null;
}

/** The name of a rate on the common list ("29.97"), or null when `v` is not one of them. */
export function nameOfRate(v) {
  for (const [num, den] of COMMON_RATES) if (sameRate(v, num / den)) return nameOf(num, den);
  return null;
}

/** ffprobe's "30000/1001" as { num, den, value }; null for 0/0, a missing denominator or text. */
export function fractionOf(text) {
  const m = /^(\d+)\/(\d+)$/.exec(String(text).trim());
  if (!m) return null;
  const num = Number(m[1]), den = Number(m[2]);
  return num > 0 && den > 0 ? { num, den, value: num / den } : null;
}

/** The rate packet times (seconds) describe, and whether it is constant: { fps, snapped, constant, packets }; null when there are fewer than two distinct times. */
export function detectRate(times) {
  const t = [...times].filter(Number.isFinite).sort((a, b) => a - b).slice(0, MAX_PACKETS);
  const uniq = t.filter((x, i) => i === 0 || x - t[i - 1] > 1e-9);
  if (uniq.length < 2) return null;
  const gaps = uniq.slice(1).map((x, i) => x - uniq[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  let period = sorted[Math.floor(0.05 * (sorted.length - 1))];
  const t0 = uniq[0];
  for (let round = 0; round < 6; round++) {
    let num = 0, den = 0;
    for (const x of uniq) { const k = Math.round((x - t0) / period); num += k * (x - t0); den += k * k; }
    if (!den) break;
    const next = num / den;
    if (Math.abs(next - period) < period * 1e-12) { period = next; break; }
    period = next;
  }
  const constant = gaps.every((g) => Math.abs(g - period) <= period * 0.02);
  const fps = 1 / period;
  return { fps, snapped: snapRate(fps), constant, packets: uniq.length };
}
