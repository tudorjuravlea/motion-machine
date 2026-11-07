// W-SAMEBOX (SPEC §7): the anti-template check. At each scene's rest the rule takes the boxes of
// the content the viewer reads (text, and anything painted: a card, a picture, a device), as a share of
// the frame, quantised to QUANT (5 %), and calls the sorted list the scene's box signature. It warns when
//   - more than SHARE of a piece's scenes carry one signature (cardification: every scene is the same
//     card, and only the words change), judged from MIN_SCENES scenes up; or
//   - two scenes that follow each other use the same layout and the same signature: they differ in text only.
// A scene of fewer than MIN_BOXES boxes is a title, not a card, and takes no part in either test. Left
// out of every signature: stage scenery (a box over MAX_AREA of the frame), hairlines (under MIN_AREA),
// decoration (`data-decor`), browser chrome (`data-chrome`), captions (`data-caption`), and anything still arriving
// at the rest. A film is read at each scene's settle rest, a deck at each scene's last rest. A style's
// `gate.sameBox` sets { share, minScenes, quant }.
import { rule } from '../lib/rule.mjs';
import { restInstants, round } from './_lib.mjs';

export const scope = 'format';
export const QUANT = 0.05;
export const SHARE = 0.5;
export const MIN_SCENES = 4;
export const MIN_BOXES = 3;
export const MAX_AREA = 0.9;
export const MIN_AREA = 0.005;

/** A box as a share of the frame, each side snapped to `quant`: "x,y,w,h" in steps. */
export function boxKey(box, frame, quant = QUANT) {
  const q = (v, of) => Math.round(v / of / quant);
  return [q(box.x, frame.w), q(box.y, frame.h), q(box.w, frame.w), q(box.h, frame.h)].join(',');
}

/** The content elements of one scene at a rest: the probe's elements that carry text or paint, in place and not scenery. */
export function contentOf(elements, scene, frame) {
  return elements.filter((e) => e.scene === scene && !e.pseudo && !e.structural && !e.moving && !e.decor && !e.chrome && !e.caption && e.box
    && (e.text || e.painted) && e.box.w * e.box.h >= MIN_AREA * frame.w * frame.h && e.box.w * e.box.h <= MAX_AREA * frame.w * frame.h);
}

/** The scene's signature: its boxes, quantised, sorted, each kind once. */
export const signatureOf = (elements, scene, frame, quant = QUANT) => [...new Set(contentOf(elements, scene, frame).map((e) => boxKey(e.box, frame, quant)))].sort();

/**
 * @param {{scene: string, layout: string|null, signature: string[]}[]} scenes  in story order
 * @returns {{shared: null | {signature: string[], scenes: string[], of: number}, pairs: {a: string, b: string, layout: string|null}[], counted: number}}
 */
export function judge(scenes, { share = SHARE, minScenes = MIN_SCENES, minBoxes = MIN_BOXES } = {}) {
  const counted = scenes.filter((s) => s.signature.length >= minBoxes);
  const groups = new Map();
  for (const s of counted) groups.set(s.signature.join(' '), [...(groups.get(s.signature.join(' ')) ?? []), s]);
  const top = [...groups.values()].sort((a, b) => b.length - a.length)[0];
  const shared = scenes.length >= minScenes && top && top.length > scenes.length * share
    ? { signature: top[0].signature, scenes: top.map((s) => s.scene), of: scenes.length } : null;
  const pairs = [];
  for (let i = 0; i + 1 < scenes.length; i++) {
    const a = scenes[i], b = scenes[i + 1];
    if (a.signature.length >= minBoxes && a.layout && a.layout === b.layout && a.signature.join(' ') === b.signature.join(' ')) pairs.push({ a: a.scene, b: b.scene, layout: a.layout });
  }
  return { shared, pairs, counted: counted.length };
}

export default async function (ctx) {
  const tune = ctx.style?.gate?.sameBox ?? {};
  const quant = tune.quant ?? QUANT, share = tune.share ?? SHARE, minScenes = tune.minScenes ?? MIN_SCENES;
  const sch = ctx.schedule;
  const rests = sch.kind === 'deck'
    ? sch.scenes.map((s) => ({ scene: s.id, t: sch.rests[s.end] }))
    : sch.holds.map((h) => ({ scene: h.scene, t: h.from }));
  const layoutOf = new Map(ctx.story.scenes.map((s) => [s.id, s.layout ?? null]));
  const scenes = [];
  for (const { scene, t } of rests) {
    if (t == null) continue;
    const s = await ctx.sample(t);
    scenes.push({ scene, layout: layoutOf.get(scene), signature: signatureOf(s.probe.elements, scene, s.probe.frame, quant) });
  }
  const threshold = `no signature on more than ${Math.round(share * 100)} % of ${minScenes}+ scenes; no two neighbours of one layout with one signature (boxes quantised to ${quant * 100} %)`;
  if (scenes.length < minScenes) return rule('W-SAMEBOX', 'SKIP', { reason: `${scenes.length} scene${scenes.length === 1 ? '' : 's'} at a rest; the check reads ${minScenes} or more` });
  const j = judge(scenes, { share, minScenes });
  if (!j.counted) return rule('W-SAMEBOX', 'SKIP', { reason: `no scene has ${MIN_BOXES} or more content boxes at its rest: nothing to compare` });
  const signatures = scenes.map((s) => ({ scene: s.scene, boxes: s.signature.length }));
  if (j.shared) {
    return rule('W-SAMEBOX', 'WARN', { scenes: j.shared.scenes, measured: round(j.shared.scenes.length / j.shared.of, 2), threshold, signature: j.shared.signature, signatures,
      reason: `${j.shared.scenes.length} of ${j.shared.of} scenes (${j.shared.scenes.join(', ')}) put their content in the same boxes: a template, not a film; give some scenes another layout or another position` });
  }
  if (j.pairs.length) {
    const p = j.pairs[0];
    return rule('W-SAMEBOX', 'WARN', { scenes: [p.a, p.b], measured: j.pairs.length, threshold, pairs: j.pairs.slice(0, 10), signatures,
      reason: `${p.a} and ${p.b} use ${p.layout} with every box in the same place and differ only in text; change the layout, the position or the shot` });
  }
  return rule('W-SAMEBOX', 'PASS', { measured: round(Math.max(...[...scenes.reduce((m, s) => m.set(s.signature.join(' '), (m.get(s.signature.join(' ')) ?? 0) + 1), new Map()).values()]) / scenes.length, 2), threshold, scenes: scenes.length, signatures });
}
