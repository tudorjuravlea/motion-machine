// W-DUR-LITERAL (SPEC §6, §7): a duration given as a number instead of a role: a beat's
// params.dur, or a data-dur attribute in the piece's or its layouts' markup.
import { rule } from '../lib/report.mjs';
import { sources } from './_lib.mjs';

const numeric = (v) => typeof v === 'number' || (typeof v === 'string' && /^\s*-?\d*\.?\d+\s*(ms|s)?\s*$/.test(v));

export default async function (ctx) {
  const hits = [];
  for (const sc of ctx.story.scenes) for (const b of sc.beats) if (b.params && numeric(b.params.dur)) hits.push({ selector: `[data-scene="${sc.id}"] [data-slot="${b.slot}"]`, measured: String(b.params.dur) });
  for (const s of sources(ctx)) {
    if (s.ext !== '.html') continue;
    for (const m of s.text.matchAll(/\bdata-dur\s*=\s*(["'])(.*?)\1/g)) if (numeric(m[2])) hits.push({ file: s.rel, line: s.text.slice(0, m.index).split('\n').length, measured: m[2] });
  }
  if (hits.length) return rule('W-DUR-LITERAL', 'WARN', { ...hits[0], reason: 'numeric duration; name a role (quick, standard, slow, hold)', all: hits });
  return rule('W-DUR-LITERAL', 'PASS', {});
}
