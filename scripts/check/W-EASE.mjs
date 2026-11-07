// W-EASE (SPEC §7, §6, provisional, from the easing and spring maths of Motion, anime.js and GSAP): an ease the piece
// spells that the kit would not draw the way it reads. Every ease string the piece holds is read through the kit's own
// parser: the style's easings (enter, exit, move and the roles a brand added), the cascade ease of the style, and any
// beat param named `ease` or ending in `Ease` (in params, params.exit, params.emphasis, params.stagger, cutParams,
// moveParams, a screen action's params, a format variant, the brand's style.patterns). One warning per finding:
//   unknown      the name or arguments do not parse, so the cascade or pattern that asked falls back to its default
//                (a style easing that does not parse stops the kit)
//   curve        a custom curve (curve(...)) that is not a function of x: its path runs backwards in x, so the kit
//                drops the backward stretch, or ends where it starts
//   steps        steps(n) with an n that is not a whole number: the last step is partial, so the last frame, pinned to 1,
//                arrives early
//   ends         linear(...) stops that do not run from 0 to 1, which the kit pins to 0 and 1
// No ease at all in the piece: SKIP.
import { easeIssues } from '../../runtime/kit/ease.js';
import { rule } from '../lib/report.mjs';

const isEaseKey = (k) => k === 'ease' || /Ease$/.test(k);

/** Every ease string the piece spells, as [{ where, spec }]. */
export function easeSpecs(style, story) {
  const out = [];
  const walk = (o, where) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (isEaseKey(k) && typeof v === 'string') out.push({ where: `${where}.${k}`, spec: v });
      else if (v && typeof v === 'object') walk(v, `${where}.${k}`);
    }
  };
  for (const [role, spec] of Object.entries(style?.motion?.easings ?? {})) if (typeof spec === 'string') out.push({ where: `style.motion.easings.${role}`, spec });
  if (typeof style?.motion?.stagger?.ease === 'string') out.push({ where: 'style.motion.stagger.ease', spec: style.motion.stagger.ease });
  walk(style?.patterns, 'style.patterns');
  const scenes = (story?.scenes ?? []).flatMap((sc) => [sc, ...Object.values(sc.variants ?? {})].map((s) => ({ id: sc.id, s })));
  for (const { id, s } of scenes) {
    walk(s.cutParams, `scene ${id} cutParams`);
    walk(s.moveParams, `scene ${id} moveParams`);
    for (const b of s.beats ?? []) {
      const at = `[data-scene="${id}"] [data-slot="${b.slot}"]`;
      walk(b.params, `${at} params`);
      for (const a of b.screen ?? []) walk(a.params, `${at} ${a.do} params`);
    }
  }
  return out;
}

const KIND = { unknown: 'unknown', 'curve-backward': 'curve', 'curve-flat': 'curve', 'steps-last': 'steps', ends: 'ends' };

export default async function (ctx) {
  const specs = easeSpecs(ctx.style, ctx.story);
  if (!specs.length) return rule('W-EASE', 'SKIP', { reason: 'the piece spells no ease (style.motion.easings, beat params named ease)' });
  const hits = [];
  for (const { where, spec } of specs) {
    for (const issue of easeIssues(spec)) {
      const fallback = issue.kind === 'unknown' ? (where.startsWith('style.motion.easings') ? '; the kit stops when it draws it' : '; what asked for it falls back to its own default') : '';
      hits.push({ selector: where, ease: spec, kind: KIND[issue.kind] ?? issue.kind, reason: `${where}: "${spec}": ${issue.message}${fallback}` });
    }
  }
  if (!hits.length) return rule('W-EASE', 'PASS', { measured: specs.length });
  return rule('W-EASE', 'WARN', { selector: hits[0].selector, measured: hits.length, reason: hits.map((h) => h.reason).join('; '), all: hits });
}
