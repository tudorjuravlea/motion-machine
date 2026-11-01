// text/code: a block of code whose steps are edits. The beat's text is the first code; `steps` lists what
// happens to it (edit, append, prepend, insert, remove, replace, select, call: see runtime/kit/code.js).
// A change morphs by token: what stays slides to its new place on a running cursor, the old text fades out
// over the first 0.4 of the morph, nothing shows from 0.4 to 0.6, the new text fades in over the last 0.4;
// a selection dims the rest to 0.2; a call puts a box on an exact range with a label. Every token is
// coloured by one of eight roles the brand maps to its palette (a role, or a tint of one), never a theme.
// The code is lexed once when the story's model is built; a frame only places spans on a character grid
// (columns in ch, rows in line heights), so it is a function of the second and nothing else.
// Writes spans, boxes and one label inside the slot; at the end the last state stays on the grid.
import { buildModel, stepTimes, frameAt, tintOf, TOKEN_ROLES } from '../../../runtime/kit/code.js';
import { safeArea } from '../../../runtime/kit/room.js';

const params = {
  steps: { type: 'string', default: '', meaning: 'the steps, blocks separated by a line of ---: edit, append, prepend, insert L3, remove "text", replace "old" => "new", select "text" or L2-3 or none, call "text" | label or none; add @seconds to pin a start' },
  lang: { type: 'enum(js|py|sh|json)', default: 'js', meaning: 'which keywords the lexer knows (ts and jsx are js)' },
  tab: { type: 'number', default: 2, meaning: 'the tab stop in columns; tabs in the code are expanded to it' },
  size: { type: 'enum(body|h2)', default: 'body', meaning: 'the type size role the code is set at, before it is fitted to the width' },
  leading: { type: 'number', default: 1.5, meaning: 'the line height, in times the type size' },
  frame: { type: 'enum(panel|bare)', default: 'panel', meaning: 'panel: on a surface plate with a hairline; bare: straight on the canvas' },
  italic: { type: 'boolean', default: true, meaning: 'comments in italics' },
  keyword: { type: 'string', default: 'accent', meaning: 'the role of keywords: ink, muted, accent or line, with an optional tint (accent/70)' },
  name: { type: 'string', default: 'ink', meaning: 'the role of names: calls, variables, properties' },
  type: { type: 'string', default: 'ink', meaning: 'the role of type names' },
  string: { type: 'string', default: 'ink/75', meaning: 'the role of strings' },
  number: { type: 'string', default: 'accent', meaning: 'the role of numbers' },
  atom: { type: 'string', default: 'accent', meaning: 'the role of true, false, null and the like' },
  comment: { type: 'string', default: 'muted', meaning: 'the role of comments' },
  punct: { type: 'string', default: 'muted', meaning: 'the role of brackets, commas and operators' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const flag = (v) => v === true || v === 'true' || v === 1 || v === '1';
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

// The model is a function of its inputs: lexing and diffing happen the first time a story's code is seen.
const MODELS = new Map();
function modelFor(code, steps, lang, tab) {
  const key = JSON.stringify([code, steps, lang, tab]);
  if (!MODELS.has(key)) MODELS.set(key, buildModel(code, steps, { lang, tab }));
  return MODELS.get(key);
}

const rootPx = (el, name) => parseFloat(el.ownerDocument.defaultView.getComputedStyle(el.ownerDocument.documentElement).getPropertyValue(name)) || 0;

export default {
  name: 'code',
  group: 'text',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const doc = el.ownerDocument;
    const code = String(el.textContent || '').replace(/\s+$/, '');
    if (!code.trim()) return;
    let model;
    try { model = modelFor(code, String(prm.steps), String(prm.lang), num(prm.tab, 2)); } catch (e) { throw new Error(`text/code: ${e.message}`); }
    const motion = ctx.style.motion;
    const d = ctx.d > 0 ? ctx.d : motion.durations.hold / 1000;
    const u = Math.min(d, ctx.u != null ? ctx.u : Math.max(0, Math.min(1, p)) * d);
    const standard = motion.durations.standard / 1000;
    const intro = Math.min(standard, d * 0.3);
    const times = stepTimes(model, d, { intro, morph: standard });
    const f = frameAt(model, u, times, { ease: (n, x) => ctx.ease(n, x), intro });

    const roles = Object.fromEntries(TOKEN_ROLES.map((r) => [r, tintOf(prm[r]) ?? tintOf(DEFAULTS[r])]));
    const lh = num(prm.leading, 1.5);
    const bare = prm.frame === 'bare';
    const hasCall = model.states.some((s) => s.call);

    el.textContent = '';
    const wrap = doc.createElement('div');
    wrap.className = `mm-code mm-code--${bare ? 'bare' : 'panel'}`;
    wrap.setAttribute('role', 'img');
    wrap.setAttribute('aria-label', model.states.at(-1).code);
    const body = doc.createElement('div');
    body.className = 'mm-code__body';
    wrap.append(body);
    el.append(wrap);

    // the size: the type role, shrunk so the widest line of any state fits the room the slot's parent gives
    const probe = doc.createElement('span');
    probe.className = 'mm-code__probe';
    probe.textContent = '0'.repeat(20);
    body.append(probe);
    const base = rootPx(el, `--mm-size-${prm.size}`) || rootPx(el, '--mm-size-body');
    wrap.style.fontSize = '100px';
    const adv = probe.offsetWidth / 2000;   // one column, in em
    probe.remove();
    const safe = safeArea(el);
    const room = Math.min(safe ? safe.x1 - safe.x0 : Infinity, el.parentElement?.clientWidth || Infinity);
    const pad = bare ? 0 : rootPx(el, '--mm-space-3');
    const fit = adv > 0 && Number.isFinite(room) ? (room - 2 * pad) / (model.cols * adv) : base;
    wrap.style.fontSize = `${Math.min(base, fit)}px`;
    wrap.style.setProperty('--mm-code-lh', `${lh}em`);
    body.style.width = `${model.cols}ch`;
    body.style.height = `calc(${model.rows} * var(--mm-code-lh))`;

    for (const c of f.cells) {
      const s = doc.createElement('span');
      s.className = `mm-code__t mm-code__t--${c.role}`;
      s.textContent = c.text;
      s.style.left = `${c.col.toFixed(3)}ch`;
      s.style.top = `calc(${c.row.toFixed(3)} * var(--mm-code-lh))`;
      s.style.color = roles[c.role];
      if (c.alpha < 1) s.style.opacity = c.alpha.toFixed(3);
      if (c.role === 'comment' && flag(prm.italic)) s.style.fontStyle = 'italic';
      body.append(s);
    }
    for (const call of f.calls) {
      for (const b of call.boxes) {
        const x = doc.createElement('div');
        x.className = 'mm-code__box';
        x.style.left = `${b.from}ch`;
        x.style.width = `${b.to - b.from}ch`;
        x.style.top = `calc(${b.row} * var(--mm-code-lh))`;
        if (call.alpha < 1) x.style.opacity = call.alpha.toFixed(3);
        body.prepend(x);
      }
    }
    if (hasCall) {
      const foot = doc.createElement('div');
      foot.className = 'mm-code__foot';
      for (const call of f.calls) {
        if (!call.label) continue;
        const l = doc.createElement('span');
        l.className = 'mm-code__label';
        l.textContent = call.label;
        if (call.alpha < 1) l.style.opacity = call.alpha.toFixed(3);
        foot.append(l);
      }
      wrap.append(foot);
    }
  },
};
