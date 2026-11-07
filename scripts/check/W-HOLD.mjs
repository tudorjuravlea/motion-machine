// W-HOLD (SPEC §3, §7, provisional, from the motion style): a film rest shorter than the motion
// style's pacing.holdMinS. A scene still arriving when it ends has a rest of 0 s.
import { rule } from '../lib/rule.mjs';
import { EPS, round } from './_pure.mjs';

export default async function (ctx) {
  if (ctx.story.kind === 'deck') return rule('W-HOLD', 'SKIP', { reason: 'a deck rest is held by the presenter' });
  const min = ctx.style.pacing?.holdMinS;
  if (min == null) return rule('W-HOLD', 'SKIP', { reason: 'the style has no pacing.holdMinS' });
  const holds = ctx.schedule.scenes.map((sc) => {
    const h = ctx.schedule.holds.find((x) => x.scene === sc.id);
    return { scene: sc.id, from: h ? h.from : sc.end, length: h ? h.to - h.from : 0 };
  });
  const short = holds.filter((h) => h.length < min - EPS);
  if (short.length) return rule('W-HOLD', 'WARN', { selector: `[data-scene="${short[0].scene}"]`, instant: round(short[0].from), measured: round(short[0].length), threshold: min, reason: `scene ${short[0].scene} rests ${round(short[0].length)}s; the style asks for ${min}s`, all: short });
  return rule('W-HOLD', 'PASS', { threshold: min, measured: round(Math.min(...holds.map((h) => h.length))) });
}
