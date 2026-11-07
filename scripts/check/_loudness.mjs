// Shared by G-PEAK and W-LOUDNESS (not a rule): what ships, measured once per gate run with ffmpeg
// ebur128 (integrated loudness and true peak). The story's muxed MP4s in out/, else out/mix.wav when no
// MP4 has been exported. No audio, no verdict.
import { existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { hasAudio, measureLoudness } from '../sound.mjs';

export const TARGET_LUFS = -14;
export const TOLERANCE_LU = 1;
export const TRUE_PEAK_MAX = -1;

/** { target, rows: [{ file, lufs, truePeak }] } or { skip: reason }. */
export async function shippedLoudness(ctx) {
  const cache = (ctx.cache ??= {});
  if (cache.loudness) return cache.loudness;
  const target = ctx.style?.sound?.loudnessLufs ?? TARGET_LUFS;
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
    return (cache.loudness = { skip: shipped.length ? 'no audio stream in the MP4s that ship (run `mm sound` to build and mux the mix)' : 'no audio built yet: no out/mix.wav and no MP4 with sound' });
  }
  const rows = [];
  for (const f of files) {
    const m = await measureLoudness(f);
    rows.push({ file: relative(ctx.dir, f), lufs: m.lufs, truePeak: m.truePeak });
  }
  return (cache.loudness = { target, rows });
}
