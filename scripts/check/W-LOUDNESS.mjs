// W-LOUDNESS (SPEC §7): when audio exists, integrated loudness within ±1 LU of the style's target
// (default -14 LUFS; provisional, platform norms). A warning: platforms normalise overall loudness and a
// quiet or loud mix is a choice; clipping is G-PEAK's. Measured with ffmpeg ebur128 on the story's muxed
// MP4s in out/, else out/mix.wav; no audio, no verdict (SKIP).
import { rule } from '../lib/report.mjs';
import { TOLERANCE_LU, shippedLoudness } from './_loudness.mjs';

export default async function (ctx) {
  const m = await shippedLoudness(ctx);
  if (m.skip) return rule('W-LOUDNESS', 'SKIP', { reason: m.skip });
  const bad = m.rows.filter((r) => !(Math.abs(r.lufs - m.target) <= TOLERANCE_LU));
  const worst = bad[0] ?? m.rows[0];
  return rule('W-LOUDNESS', bad.length ? 'WARN' : 'PASS', {
    file: worst.file, measured: Math.round(worst.lufs * 10) / 10, threshold: `${m.target} LUFS ±${TOLERANCE_LU}`,
    ...(bad.length ? { reason: bad.map((r) => `${r.file}: ${r.lufs.toFixed(1)} LUFS`).join('; ') } : {}),
    files: m.rows,
  });
}
