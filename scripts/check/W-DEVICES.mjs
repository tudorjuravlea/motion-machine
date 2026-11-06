// W-DEVICES (SPEC §7, provisional): a device budget. A hero device is an impact
// used once to land a moment; in a film of 30 s or less, more than two scenes using one kind of them warn. The kinds are
// the one-shot impacts among the emphasis and transition patterns:
//   slam       emphasis/stamp                                    (a verdict struck onto the frame)
//   crash-zoom transitions/impact, transitions/zoom-through      (a punch or a dive at the cut)
//   flash      transitions/light-leak                            (the frame washed with light)
// Not counted: entrances/slam, which a style may give to every headline (a default, not a hero choice), and moves/shake,
// the jolt that follows a slam. A use is a scene that holds a pattern of the kind as a beat's emphasis, entrance or exit,
// as its cut or as its move, so two stamps in one scene are one use. A count and a warning only. A style's
// `gate.deviceMax` sets the budget.
import { rule } from '../lib/rule.mjs';
import { round } from './_pure.mjs';

export const DEVICE_MAX = 2;
export const FILM_MAX_S = 30;
export const KINDS = {
  slam: ['emphasis/stamp'],
  'crash-zoom': ['transitions/impact', 'transitions/zoom-through'],
  flash: ['transitions/light-leak'],
};

/** The device kind a pattern id belongs to, or null. */
export const kindOf = (ref) => Object.keys(KINDS).find((k) => KINDS[k].includes(ref)) ?? null;

export default async function (ctx) {
  if (ctx.story.kind === 'deck') return rule('W-DEVICES', 'SKIP', { reason: 'a deck is paced by the presenter; the device budget is a film rule' });
  const duration = ctx.schedule.duration;
  if (duration > FILM_MAX_S) return rule('W-DEVICES', 'SKIP', { reason: `the film lasts ${round(duration, 1)} s; the device budget is for a film of ${FILM_MAX_S} s or less` });
  const max = ctx.style?.gate?.deviceMax ?? DEVICE_MAX;
  const uses = Object.fromEntries(Object.keys(KINDS).map((k) => [k, []]));
  for (const sc of ctx.story.scenes) {
    const refs = [sc.cut, sc.move, ...sc.beats.flatMap((b) => [b.fx, b.exit, b.emphasis])];
    for (const kind of new Set(refs.map((r) => kindOf(r)).filter(Boolean))) uses[kind].push(sc.id);
  }
  const counts = Object.fromEntries(Object.entries(uses).filter(([, v]) => v.length).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return rule('W-DEVICES', 'SKIP', { reason: 'no slam, crash-zoom or flash pattern is used: nothing to count' });
  const over = Object.keys(counts).filter((k) => counts[k] > max).sort((a, b) => counts[b] - counts[a]);
  if (over.length) {
    const kind = over[0];
    return rule('W-DEVICES', 'WARN', { kind, measured: counts[kind], threshold: max, scenes: uses[kind], counts, reason: `${counts[kind]} scenes use the ${kind} device (${uses[kind].join(', ')}) in a film of ${round(duration, 1)} s; keep it to ${max}` });
  }
  return rule('W-DEVICES', 'PASS', { uses: total, threshold: max, counts });
}
