// entrances/bounce: an object drops onto its place and bounces, each hop lower, then settles: closed-form
// physics (runtime/kit/bounce.js). `material` sets how elastic it is (rigid, wood, plastic, rubber: an
// elastic one bounces more and squashes on each contact), `weight` how heavy (light, medium, heavy: a heavy
// one bounces less), so two objects in one frame bounce as their make says. The entrance lasts until its
// last contact, and a beat `cue` sounds on every contact, each a little quieter (the schedule reads
// contactsOf). Objects only: a beat that sets type falls and stops at its first contact (type never
// bounces). Writes translate, scale (the squash, from the bottom edge) and opacity; nothing at p = 1.
import { roomAbove } from '../../../runtime/kit/room.js';
import { bounceOf, bounceAt, bounceLength, contacts, contactLevelDb } from '../../../runtime/kit/bounce.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  material: { type: 'enum(rigid|wood|plastic|rubber)', default: 'plastic', meaning: 'how elastic the object is: rigid (glass, metal, a phone) keeps 30 % of its speed at a contact, wood 42 %, plastic 55 %, rubber 78 %; plastic and rubber squash a little on each contact' },
  weight: { type: 'enum(light|medium|heavy)', default: 'medium', meaning: 'how heavy it is: a heavy object keeps 35 % less of its bounce than a light one of the same material, and squashes half as much' },
  d: { type: 'number', default: 4, meaning: 'drop height as a multiple of the format base size (ctx.unit), before the style multiplier; capped by the free room above the element' },
  fall: { type: 'number', default: 0.42, meaning: 'seconds the first fall takes (up to 2); every hop after it is timed from it' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const settings = (prm = {}) => bounceOf({ ...DEFAULTS, ...prm });

export default {
  name: 'bounce',
  group: 'entrances',
  params,
  /** The entrance's length: its last contact (and that contact's squash). */
  durationOf: (prm) => bounceLength(settings(prm)),
  /** Each contact: its time from the start, its number, and its sound's level against the first. */
  contactsOf: (prm) => contacts(settings(prm)).map((c, n) => ({ t: c.t, n, levelDb: contactLevelDb(c.speed) })),
  at(el, pRaw, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const b = settings(prm);
    const t = Math.max(0, Number(ctx.u) || 0);
    const done = pRaw >= 1;
    // type never bounces: it falls and stops at its first contact
    const st = ctx.type ? { lift: t < b.fall ? 1 - (t / b.fall) ** 2 : 0, squash: 0 } : bounceAt(t, b);
    const height = Math.min(Number(prm.d) * ctx.unit * ctx.style.motion.travel, roomAbove(el) ?? Infinity);
    const o = clamp01((t / b.fall) * 4);
    el.style.opacity = done || o >= 1 ? '' : String(o);
    el.style.translate = done || st.lift <= 0 ? 'none' : `0 ${(-height * st.lift).toFixed(3)}px`;
    if (!done && st.squash > 0) {
      el.style.transformOrigin = '50% 100%';
      el.style.scale = `${(1 + st.squash * 0.5).toFixed(4)} ${(1 - st.squash).toFixed(4)}`;
    } else el.style.scale = 'none';
  },
};
