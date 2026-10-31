#!/usr/bin/env node
// mm verify-export <mp4> [--piece <dir>]   (SPEC §8)
// Reads a finished MP4 back and checks it (scripts/lib/export-qa.mjs): a video stream, the story's duration,
// size and frame rate, sound where the piece has sound, no black frames, no frozen span while the
// schedule moves, no long silence, the encoded file's true peak and loudness against the style's targets,
// and every cut of a film for a black, duplicated or offset frame. It writes <piece>/out/export-qa.json
// and out/export-qa-seams-<format>.png beside it, prints a verdict per file, and exits 0 (all pass or
// skipped), 1 (a check failed) or 2 (usage, a missing file). `mm export` runs the same checks on what it
// has just written; this verb is for after `mm sound` muxes the mix, and for any MP4 on its own. The
// piece is the folder above the MP4's `out/` unless --piece names it; without a piece only what the file
// alone can say is checked, and the rest is reported SKIP.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError, runMain, usageText } from './lib/cli.mjs';
import { assertTools } from './lib/ffmpeg.mjs';
import { pieceOf, verdictLines, verifyExport } from './lib/export-qa.mjs';

/** The frame rate and walkthrough hold `mm export` recorded for `mp4`, if out/export.json is there. */
function recorded(dir, mp4) {
  try {
    const m = JSON.parse(readFileSync(join(dir, 'out', 'export.json'), 'utf8'));
    const f = (m.files ?? []).find((x) => resolve(x.file) === resolve(mp4));
    return { fps: f?.fps ?? m.walkthrough?.fps ?? null, walkHoldS: m.walkthrough?.holdS ?? undefined };
  } catch { return { fps: null }; }
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { piece: { type: 'string' } } });
  if (positionals.length !== 1) throw new UsageError(usageText('verify-export'), 2);
  const mp4 = resolve(positionals[0]);
  if (!existsSync(mp4)) throw new UsageError(`no such file: ${positionals[0]}`, 2);
  const dir = values.piece ? resolve(values.piece) : pieceOf(mp4);
  if (values.piece && !existsSync(join(dir, 'story.json'))) throw new UsageError(`--piece ${values.piece} holds no story.json`, 2);
  assertTools();
  if (!dir) {
    console.log('no piece (it is not in a piece\'s out/ and --piece was not given): only what the file alone can say is checked');
    const { verifyFile } = await import('./lib/export-qa.mjs');
    const f = await verifyFile(mp4, { phase: 'final' });
    for (const l of verdictLines({ files: [f] })) console.log(l);
    return f.ok ? 0 : 1;
  }
  const { fps, walkHoldS } = recorded(dir, mp4);
  const { ok, file, report } = await verifyExport(dir, [mp4], { phase: 'final', fps, walkHoldS, merge: true });
  for (const l of verdictLines(report)) console.log(l);
  console.log(`report: ${file}`);
  return ok ? 0 : 1;
});
