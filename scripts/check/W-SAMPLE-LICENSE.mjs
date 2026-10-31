// W-SAMPLE-LICENSE (SPEC §7, §9): every sound file a style (`sound.samples`) or a story (`audio.samples`) maps to a
// cue has a record beside it, assets/sounds/x.json for assets/sounds/x.wav, naming its source, licence and author
// (contracts/sound-sample.schema.json). A missing file, a missing record, a record that is not JSON or does
// not validate, each warns. A sound whose terms are not written down is not a sound the piece can ship.
// Nothing mapped: SKIP.
import { rule } from '../lib/report.mjs';
import { sampleMap, sampleProblems } from '../lib/sound-sample.mjs';

export default async function (ctx) {
  const map = sampleMap(ctx.story, ctx.style, ctx.dir);
  const entries = Object.entries(map);
  if (!entries.length) return rule('W-SAMPLE-LICENSE', 'SKIP', { reason: 'no cue is mapped to a sample (sound.samples, audio.samples)' });
  const bad = entries.flatMap(([cue, e]) => sampleProblems(e).map((p) => ({ cue, file: e.rel, from: e.from, problem: p })));
  if (!bad.length) return rule('W-SAMPLE-LICENSE', 'PASS', { measured: entries.length, files: entries.map(([cue, e]) => ({ cue, file: e.rel })) });
  return rule('W-SAMPLE-LICENSE', 'WARN', {
    file: bad[0].file, measured: bad.length, selector: bad[0].cue,
    reason: bad.map((b) => `${b.file} (cue ${b.cue}): ${b.problem}`).join('; '), samples: bad,
  });
}
