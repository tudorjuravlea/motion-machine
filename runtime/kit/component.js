// Any UI component drawn from a script of its states. A component's CSS says what each state looks like
// (state attributes and variables, the way component libraries write them), and a motion spec in that CSS,
// `--mm-motion`, written in the grammar of `transition`, says how each property moves when its state
// changes. This module plays the script at t: for every property it finds the last change, the value the
// property had when that change came, and how far the change has run. Nothing runs on a clock: the CSS never
// declares `transition`, so no transition is live in render mode (G-TIME), and every frame is a function of t.
//
// A part is { el, follow, states, leave }: `states` are { at, attrs, vars } in time order (the first is when
// the part enters), `leave` the time it starts to leave or null, `follow` its descendants whose look also
// follows its state. The browser computes each state's look; this module only reads it, the way CSS
// transitions do:
//   - a change takes the timing of the state it changes to (`--mm-motion` read in that state);
//   - a property whose value a change leaves alone keeps running as it was;
//   - a change that comes while a property is moving starts from where the property is;
//   - an entering part starts from its look with `data-starting-style`, a leaving part moves to its look with
//     `data-ending-style` and is gone once its longest motion has run.
// Numbers and lengths are interpolated token by token, colours mixed in Oklab, anything else switches halfway.
// Idea from the presence protocol of UI SDK (Apache-2.0), restated in our own code; see PROVENANCE.md.
import { parseEasing } from './ease.js';

export const STARTING = 'data-starting-style';
export const ENDING = 'data-ending-style';

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const COLOURS = new Set(['color', 'background-color', 'border-color', 'outline-color', 'fill', 'stroke', 'caret-color']);
const KEYWORD_EASE = /^(ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end)$/;
const r4 = (x) => Math.round(x * 1e4) / 1e4;

// the items of a comma list, and the words of an item, outside parentheses
function split(text, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && (sep === ' ' ? /\s/.test(ch) : ch === sep)) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * A motion spec, the text of a computed `--mm-motion` (`opacity 250ms ease-out, translate 500ms
 * cubic-bezier(…) 50ms`), as a map from property to { d, delay } in seconds and { ease }, the easing as CSS
 * writes it. `none`, or no spec, moves nothing. A time is a whole `ms` or `s`; the first is the duration, the
 * second the delay, as in `transition`.
 */
export function motionOf(text) {
  const out = new Map();
  for (const item of split(String(text ?? '').trim(), ',')) {
    if (item === 'none') continue;
    let prop = null, ease = 'ease';
    const times = [];
    for (const w of split(item, ' ')) {
      if (/^-?[\d.]+m?s$/.test(w)) times.push(w.endsWith('ms') ? parseFloat(w) / 1000 : parseFloat(w));
      else if (KEYWORD_EASE.test(w) || /^(cubic-bezier|steps|linear)\(/.test(w)) ease = w;
      else prop = w;
    }
    if (prop) out.set(prop, { d: Math.max(0, times[0] ?? 0), delay: times[1] ?? 0, ease });
  }
  return out;
}

// a computed value in a form two of them can be interpolated in
function normal(prop, v) {
  const s = String(v ?? '').trim();
  if (prop === 'translate') { if (s === 'none' || s === '') return '0px 0px'; if (split(s, ' ').length === 1) return `${s} 0px`; }
  if (prop === 'scale' && (s === 'none' || s === '')) return '1';
  if (prop === 'rotate' && (s === 'none' || s === '')) return '0deg';
  return s;
}

/**
 * The value of `prop` a share `q` of the way from computed value `a` to `b`: numbers token by token when the
 * two have the same shape (`0px 12px`, `0.95`, `rgb(…)` in a shadow), colours as `color-mix(in oklab, …)`,
 * anything else `a` before halfway and `b` from it. `q` may leave 0..1 for an easing that overshoots.
 */
export function mix(prop, a, b, q) {
  if (q === 0) return a;
  if (q === 1) return b;
  if (COLOURS.has(prop)) { const k = Math.min(1, Math.max(0, q)); return k === 0 ? a : k === 1 ? b : `color-mix(in oklab, ${b} ${r4(k * 100)}%, ${a})`; }
  const A = normal(prop, a), B = normal(prop, b);
  const na = A.match(NUM) ?? [], nb = B.match(NUM) ?? [];
  if (na.length && na.length === nb.length && A.replace(NUM, '#') === B.replace(NUM, '#')) {
    let i = 0;
    return A.replace(NUM, () => { const x = Number(na[i]) + (Number(nb[i]) - Number(na[i])) * q; i++; return String(r4(x)); });
  }
  return q < 0.5 ? a : b;
}

const easeOf = (() => { const cache = new Map(); return (e) => { if (!cache.has(e)) cache.set(e, parseEasing(e)); return cache.get(e); }; })();

/** The state a part is in at t: the last state at or before t (the first before it enters). */
export function stateAt(states, t) {
  let s = states[0];
  for (const x of states) if (x.at <= t) s = x;
  return s;
}

/**
 * Draws every part at t: a part not yet entered, or gone after leaving, is hidden; the rest are put in the
 * state they are in at t and their moving properties written inline. Each part's own probes run before
 * anything of it is written inline, so a probe reads the browser's look of the state alone.
 */
export function playParts(parts, t) {
  for (const part of parts) playPart(part, t);
}

function playPart(part, t) {
  const el = part.el, els = [el, ...(part.follow ?? [])];
  const states = [...part.states].sort((a, b) => a.at - b.at);
  if (!states.length) throw new Error('component: a part needs at least one state');
  const enter = states[0].at, leave = part.leave ?? null;
  const live = leave == null ? states : states.filter((s, i) => i === 0 || s.at < leave);

  // every attribute and variable a state sets is cleared before the next is applied
  const attrNames = new Set([STARTING, ENDING]), varNames = new Set();
  for (const s of states) { for (const k of Object.keys(s.attrs ?? {})) attrNames.add(k); for (const k of Object.keys(s.vars ?? {})) varNames.add(k); }
  const apply = (s, extra) => {
    for (const n of attrNames) el.removeAttribute(n);
    for (const n of varNames) el.style.removeProperty(n);
    for (const [k, v] of Object.entries(s.attrs ?? {})) if (v !== false && v != null) el.setAttribute(k, v === true ? '' : String(v));
    for (const [k, v] of Object.entries(s.vars ?? {})) el.style.setProperty(k, String(v));
    if (extra) el.setAttribute(extra, '');
  };

  // the probes: the starting look, each state's look, and the ending look of a part that leaves
  const probes = [{ at: enter, s: live[0], extra: STARTING, start: true }, ...live.map((s) => ({ at: s.at, s }))];
  if (leave != null) probes.push({ at: leave, s: stateAt(live, leave), extra: ENDING });
  const view = el.ownerDocument.defaultView;
  for (const p of probes) { apply(p.s, p.extra); p.motion = els.map((e) => motionOf(view.getComputedStyle(e).getPropertyValue('--mm-motion'))); }
  const props = els.map((_, j) => [...new Set(probes.flatMap((p) => [...p.motion[j].keys()]))]);
  for (const p of probes) { apply(p.s, p.extra); const cs = els.map((e) => view.getComputedStyle(e)); p.values = els.map((_, j) => Object.fromEntries(props[j].map((k) => [k, cs[j].getPropertyValue(k)]))); }

  // each property's changes: a probe whose value equals the one before changes nothing, and keeps it moving
  const chains = els.map((_, j) => props[j].map((prop) => {
    const changes = [];
    for (const p of probes.slice(1)) {
      const target = p.values[j][prop];
      if (changes.length && changes.at(-1).target === target) continue;
      changes.push({ at: p.at, target, timing: p.motion[j].get(prop) ?? null });
    }
    return { prop, changes, start: probes[0].values[j][prop] };
  }));

  // presence: a leaving part is gone once the longest motion its leaving started has run
  const longest = leave == null ? 0 : Math.max(0, ...chains.flat().map(({ changes }) => {
    const c = changes.at(-1);
    return c.at === leave && c.timing ? c.timing.d + Math.max(0, c.timing.delay) : 0;
  }));
  if (t < enter || (leave != null && t >= leave + longest)) { apply(stateAt(live, t)); el.style.display = 'none'; return; }
  el.style.removeProperty('display');
  apply(stateAt(live, t), leave != null && t >= leave ? ENDING : null);

  // each property of each element: its value at t
  els.forEach((e, j) => {
    for (const { prop, changes, start } of chains[j]) {
      const memo = new Map();
      // the value a chain of changes 0..i gives at time x (x at or after change i)
      const valueAt = (i, x) => {
        const c = changes[i];
        let from;
        if (i === 0) from = start;
        else { if (!memo.has(i)) memo.set(i, valueAt(i - 1, c.at)); from = memo.get(i); }
        if (!c.timing || c.timing.d <= 0) return x >= c.at + Math.max(0, c.timing?.delay ?? 0) ? c.target : from;
        const raw = (x - c.at - c.timing.delay) / c.timing.d;
        if (raw <= 0) return from;
        if (raw >= 1) return c.target;
        return mix(prop, from, c.target, easeOf(c.timing.ease)(raw));
      };
      let k = 0;
      for (let i = 0; i < changes.length; i++) if (changes[i].at <= t) k = i;
      e.style.setProperty(prop, valueAt(k, t));
    }
  });
}
