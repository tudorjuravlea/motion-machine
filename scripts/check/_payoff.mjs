// W-SOUND-SHAPE's payoff (SPEC §7, §9): a mix with a bed or a track earns its loudest moment by leaving room before it. Of the
// two seconds before the loudest 100 ms, at least 0.4 s lie at or under -40 dBFS. Read from the mix as the sum of its stems.
// Levels are RMS over 20 ms windows of both channels; the loudest 100 ms is the 100 ms window of highest RMS. Pure; no Node built-in.

export const QUIET_S = 0.4;
export const FLOOR_DB = -40;
export const WINDOW_S = 2;
const LOUD_S = 0.1;
const STEP_S = 0.02;

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);

/** { loudestAtS, loudestDb, quietS, windowFromS } for stereo channels summed to a mix, or null for a silent mix. `opts`: { quietFloorDb, windowS }. */
export function payoffOf(channels, sr, { floorDb = FLOOR_DB, windowS = WINDOW_S } = {}) {
  const n = channels[0].length, step = Math.max(1, Math.round(STEP_S * sr)), per = Math.round(LOUD_S / STEP_S);
  const blocks = Math.floor(n / step);
  if (blocks < per) return null;
  const power = new Float64Array(blocks);   // mean square of each 20 ms block, channels averaged
  for (let b = 0; b < blocks; b++) {
    let sum = 0;
    for (const ch of channels) for (let i = b * step; i < (b + 1) * step; i++) sum += ch[i] * ch[i];
    power[b] = sum / (step * channels.length);
  }
  let best = -1, bestSum = 0;
  let run = 0;
  for (let b = 0; b < blocks; b++) {
    run += power[b];
    if (b >= per) run -= power[b - per];
    if (b >= per - 1 && run > bestSum) { bestSum = run; best = b - per + 1; }
  }
  if (best < 0 || bestSum <= 0) return null;
  const from = Math.max(0, best - Math.round(windowS / STEP_S));
  let quiet = 0;
  for (let b = from; b < best; b++) if (db(Math.sqrt(power[b])) <= floorDb) quiet++;
  return { loudestAtS: best * STEP_S, loudestDb: db(Math.sqrt(bestSum / per)), quietS: Math.round(quiet * STEP_S * 1000) / 1000, windowFromS: from * STEP_S };
}
