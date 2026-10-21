// G-PATTERN-CARD (SPEC §5, AXIOM 4): every pattern the piece references passes the pattern lint's
// folder, card and demo checks. Fixture stubs (a patterns base under fixtures/) are not library
// patterns and are SKIPped; `mm pattern lint` governs patterns/.
import { relative } from 'node:path';
import { rule } from '../lib/report.mjs';
import { lintPattern } from '../pattern-lint.mjs';
import { ROOT, isWithin, refsOf, resolvesPattern } from './_lib.mjs';
import { join } from 'node:path';

export function lintReferenced(ctx, id) {
  if (isWithin(ctx.patternsBase, join(ROOT, 'fixtures'))) {
    return rule(id, 'SKIP', { reason: `the piece mounts fixture stubs from ${relative(ROOT, ctx.patternsBase)}, not library patterns; mm pattern lint covers patterns/` });
  }
  ctx.cache.lint ??= [...new Set(refsOf(ctx.story).map((r) => r.ref))]
    .filter((ref) => resolvesPattern(ctx.patternsBase, ref))
    .map((ref) => lintPattern(join(ctx.patternsBase, ref)));
  const fails = ctx.cache.lint.flatMap((l) => l.rules.filter((r) => r.id === id && r.status === 'FAIL').map((r) => ({ ref: l.ref, ...r.evidence })));
  if (fails.length) return rule(id, 'FAIL', { file: fails[0].file, measured: fails[0].ref, reason: `${fails[0].ref}: ${fails[0].reason}`, all: fails.slice(0, 20) });
  return rule(id, 'PASS', { patterns: ctx.cache.lint.length });
}

export default async function (ctx) { return lintReferenced(ctx, 'G-PATTERN-CARD'); }
