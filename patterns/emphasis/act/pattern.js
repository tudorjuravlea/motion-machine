// emphasis/act: the mascot drawn by entrances/character acts a change of mood. Its eyes squeeze
// shut into the key, the face swaps while they are shut (so no frame ever shows two faces), a take
// sized by the new mood pops it up and stretches it, and its pose and idle blend into the new
// mood's with a small overshoot that has landed 0.4 s after the key. The window is fixed in seconds
// (runtime/kit/rig.js ACT) because weight lives in seconds, whatever the style's durations. After
// the window entrances/character keeps the new mood. On a slot without that entrance it draws nothing.
// Extra parts (ears, a tail, an antenna) follow through on the take.
import { resolveMascot, characterPose, draw, ACT, MOODS } from '../../../runtime/kit/rig.js';
import { optionsOf } from '../../entrances/character/pattern.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { const t = clamp01(x); return t * t * (3 - 2 * t); };

const params = {
  mood: { type: 'enum(calm|happy|excited|sad|surprised|worried|sleepy|proud)', default: 'calm', meaning: 'the mood it starts from: the entrance\'s mood' },
  to: { type: 'enum(none|calm|happy|excited|sad|surprised|worried|sleepy|proud)', default: 'none', meaning: 'the mood it changes to; give it among the beat\'s own params so the entrance keeps it after the act' },
  amount: { type: 'number', default: 1, meaning: 'scales the take, 0 (a plain swap under shut eyes) to 1.5; each mood sets its own take (a surprise is bigger than a yawn)' },
  view: { type: 'enum(front|threeQuarter|side|back)', default: 'front', meaning: 'as the entrance' },
  facing: { type: 'enum(right|left)', default: 'right', meaning: 'as the entrance' },
  look: { type: 'enum(center|left|right|up|down)', default: 'center', meaning: 'as the entrance' },
  idle: { type: 'number', default: 1, meaning: 'as the entrance' },
  bpm: { type: 'number', default: 0, meaning: 'as the entrance' },
  offset: { type: 'number', default: 0, meaning: 'as the entrance' },
  who: { type: 'string', default: '', meaning: 'as the entrance: a character of the brand\'s cast by name' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));

export default {
  name: 'act',
  group: 'emphasis',
  dur: ACT.dur,
  params,
  at(el, p, ctx) {
    if (el.getAttribute('data-fx') !== 'entrances/character') return;
    const prm = { ...DEFAULTS, ...ctx.params };
    if (!MOODS.includes(prm.to)) return;
    const m = resolveMascot(ctx.style, prm.who || undefined);
    const o = optionsOf(prm, ctx);
    const u = Number.isFinite(ctx.u) ? ctx.u : clamp01(p) * ACT.dur;   // seconds into the window, which opens as the entrance lands
    const seed = ctx.random();
    const pose = characterPose({
      ...o, mascot: m, mood: prm.mood, seed, idleWeight: o.deck ? 0 : smooth(u / 0.4),
      act: { from: prm.mood, to: prm.to, a: u - ACT.key, amt: Math.min(1.5, Math.max(0, Number(prm.amount))) },
    });
    draw(el, m, pose, { id: `mmrig${Math.floor(seed * 1e9).toString(36)}` });
  },
};
