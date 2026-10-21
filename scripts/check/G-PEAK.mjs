// G-PEAK (SPEC §7): when audio exists, the true peak of what ships is at most -1 dBTP (platform norms).
// Above it the mix clips: it distorts on every platform, so this fails. Overall loudness is a mix
// choice and warns as W-LOUDNESS. Measured with ffmpeg ebur128 on the story's muxed MP4s in out/, else
// out/mix.wav; no audio, no verdict (SKIP).
import { rule } from '../lib/report.mjs';
import { TRUE_PEAK_MAX, shippedLoudness } from './_loudness.mjs';

export default async function (ctx) {
  const m = await shippedLoudness(ctx);
  if (m.skip) return rule('G-PEAK', 'SKIP', { reason: m.skip });
  const bad = m.rows.filter((r) => !(r.truePeak <= TRUE_PEAK_MAX));
  const worst = [...(bad.length ? bad : m.rows)].sort((a, b) => b.truePeak - a.truePeak)[0];
  const peak = Math.round(worst.truePeak * 10) / 10;
  return rule('G-PEAK', bad.length ? 'FAIL' : 'PASS', {
    file: worst.file, measured: peak, truePeak: peak, threshold: `true peak ≤ ${TRUE_PEAK_MAX} dBTP`,
    ...(bad.length ? { reason: bad.map((r) => `${r.file}: ${r.truePeak.toFixed(1)} dBTP`).join('; ') } : {}),
    files: m.rows,
  });
}
