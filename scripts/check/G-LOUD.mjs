// G-LOUD (SPEC §7): when audio exists, integrated loudness within ±1 LU of the style's target
// (default -14 LUFS) and true peak ≤ -1 dBTP (provisional, platform norms). Measured with ffmpeg
// ebur128 on what ships: the story's muxed MP4s in out/, else out/mix.wav when no MP4 has been exported. No audio, no verdict (SKIP).
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { rule } from '../lib/report.mjs';
import { hasAudio, measureLoudness } from '../sound.mjs';

export const TOLERANCE_LU = 1;
export const TRUE_PEAK_MAX = -1;

export default async function (ctx) {
  const target = ctx.style?.sound?.loudnessLufs ?? -14;
  const out = join(ctx.dir, 'out');
  // the files the story ships: out/<story id>-<format>.mp4 for each format the story has; another id's
  // file, a format it does not ship, a staging file (`.partial.`), or a loop or walkthrough clip is not
  // what a viewer gets
  const names = new Set((ctx.story?.formats ?? []).map((x) => `${ctx.story.id}-${x}.mp4`));
  const shipped = (existsSync(out) ? readdirSync(out) : []).filter((f) => names.has(f)).sort().map((f) => join(out, f));
  const withAudio = [];
  for (const f of shipped) if (await hasAudio(f)) withAudio.push(f);
  // out/mix.wav stands in only when no shipped MP4 exists yet; next to a silent MP4 it would be a stale mix
  const files = withAudio.length ? withAudio : !shipped.length && existsSync(join(out, 'mix.wav')) ? [join(out, 'mix.wav')] : [];
  if (!files.length) {
    return rule('G-LOUD', 'SKIP', { reason: shipped.length ? 'no audio stream in the MP4s that ship (run `mm sound` to build and mux the mix)' : 'no audio built yet: no out/mix.wav and no MP4 with sound' });
  }
  const rows = [];
  for (const f of files) {
    const m = await measureLoudness(f);
    rows.push({ file: relative(ctx.dir, f), lufs: m.lufs, truePeak: m.truePeak });
  }
  const bad = rows.filter((r) => !(Math.abs(r.lufs - target) <= TOLERANCE_LU) || !(r.truePeak <= TRUE_PEAK_MAX));
  const worst = (bad[0] ?? rows[0]);
  return rule('G-LOUD', bad.length ? 'FAIL' : 'PASS', {
    file: worst.file, measured: Math.round(worst.lufs * 10) / 10, truePeak: Math.round(worst.truePeak * 10) / 10,
    threshold: `${target} LUFS ±${TOLERANCE_LU}, true peak ≤ ${TRUE_PEAK_MAX} dBTP`,
    ...(bad.length ? { reason: bad.map((r) => `${r.file}: ${r.lufs.toFixed(1)} LUFS, ${r.truePeak.toFixed(1)} dBTP`).join('; ') } : {}),
    files: rows,
  });
}
