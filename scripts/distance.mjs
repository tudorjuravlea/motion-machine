// `mm distance <piece> --against <piece>` (SPEC §8): how far apart two films are on six axes (structure, opening,
// signature shot, camera path, score shape, ending). Exit 0 when at least four differ, 1 when fewer do.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError, resolvePiece, runMain } from './lib/cli.mjs';
import { filmDistance, MIN_DIFFERING } from './lib/film-distance.mjs';

const load = (dir) => ({ dir, story: JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8')), style: JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8')) });

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ options: { against: { type: 'string' } }, allowPositionals: true });
  if (positionals.length !== 1 || !values.against) throw new UsageError('give a piece and --against <piece>');
  const a = load(resolvePiece(positionals[0])), b = load(resolvePiece(values.against));
  const d = filmDistance(a, b);
  console.log(`distance ${a.story.id} vs ${b.story.id}`);
  for (const x of d.axes) console.log(`  ${x.axis.padEnd(10)} ${x.same ? 'same     ' : 'different'}  ${x.reason}`);
  console.log(`${d.differing} of ${d.axes.length} axes differ (${MIN_DIFFERING} needed)${d.close ? ': too close, a lookalike' : ''}`);
  return d.close ? 1 : 0;
});
