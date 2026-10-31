// text/lower-third: a name and a role line in the lower band of an overlay area. The slot's text is
// "Name | Role" (the role is optional). One module, eight mechanisms: how the plate arrives is the
// mechanism, and a brand picks it once (style.patterns["text/lower-third"]).
//
// The whole motion is one number, `s`, how much of the lower third is shown (0 to 1): the entrance
// plays s from 0 to 1 over the beat's entrance, and exits/lower-third plays it back from 1 to 0, so
// the way in and the way out are one drawing. `pose(mechanism, s, leaving, ease)` is a pure function
// from s to the amounts each part is drawn at; `render` turns them into styles. The markup is built
// once per seek from the slot's text and reused by the exit (which draws after the entrance, on the
// same seek). At s = 1 every amount is exactly 1: nothing is mid-motion, no caret, no ring.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (s, a, b) => clamp01((s - a) / (b - a));
const r4 = (x) => String(Math.round(x * 10000) / 10000);

export const MECHANISMS = ['bar-wipe', 'bracket', 'flip', 'tab', 'stamp', 'typed', 'strip', 'pill'];

const params = {
  mechanism: { type: 'enum(bar-wipe|bracket|flip|tab|stamp|typed|strip|pill)', default: 'bar-wipe', meaning: 'how the plate arrives: bar-wipe (an accent bar wipes up, the text rides out of it), bracket (corner brackets draw, text fades up inside), flip (the plate flips in on Y), tab (a tab slides in from the frame edge and unfolds), stamp (the plate lands with a small overshoot and settles), typed (the name types with a caret, the role fades after), strip (a thin now-playing strip with a progress hairline), pill (a chapter pill grows into a bar)' },
  side: { type: 'enum(left|right)', default: 'left', meaning: 'the side of the overlay area the lower third stands on; give the side the speaker is not on' },
  tone: { type: 'enum(accent|ink|muted)', default: 'accent', meaning: 'the palette role of the mark (bar, tab, brackets, outline, dot, hairline)' },
  plate: { type: 'boolean', default: true, meaning: 'the text sits on a surface plate; false leaves it bare, for footage that is calm enough under the text' },
  stroke: { type: 'number', default: 0.5, meaning: 'weight of the lines as a share of the frame\'s short side, in percent (0.1 is a hairline, 1.2 is bold); a bar is three of it, a tab nine' },
  progress: { type: 'number', default: 0.4, meaning: 'strip only: where the progress hairline stands at rest, 0 to 1' },
  caret: { type: 'boolean', default: true, meaning: 'typed only: show the caret while the name types' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const truthy = (v) => v !== false && v !== 'false' && v !== 0 && v !== '0';

/**
 * How much of each part is drawn at show-amount `s` (0 to 1), for a mechanism. `leaving` is the
 * exit (the stamp does not bounce backwards: it lifts and fades). `e` is the style's easing, applied
 * per phase. At s >= 1 every field is at rest: 1 (or 0 for `flip` and `lift`).
 * Fields: mark (the bar, tab or dot drawn), plate (the plate revealed from the mark's side), slide
 * (plate still to travel, bar-wipe), text and role (opacity), typed (share of the name typed), arm
 * (bracket arm drawn), flip (share still to turn), hair (hairline drawn), scale and fade (stamp), lift.
 */
export function pose(mechanism, s, leaving = false, e = (x) => x) {
  s = clamp01(s);
  const o = { mark: 1, plate: 1, slide: 0, text: 1, role: 1, typed: 1, arm: 1, flip: 0, hair: 1, scale: 1, fade: 1, lift: 0 };
  if (s >= 1) return o;
  switch (mechanism) {
    case 'bar-wipe':
      o.mark = e(seg(s, 0, 0.4)); o.plate = e(seg(s, 0.25, 0.8)); o.slide = 1 - o.plate; o.text = seg(s, 0.4, 0.8);
      break;
    case 'bracket':
      o.arm = e(seg(s, 0, 0.55)); o.plate = 1; o.text = e(seg(s, 0.4, 0.9)); o.lift = 1 - o.text;
      break;
    case 'flip':
      o.flip = 1 - e(seg(s, 0, 0.8)); o.text = seg(s, 0.3, 0.7);
      break;
    case 'tab':
      o.mark = e(seg(s, 0, 0.4)); o.plate = e(seg(s, 0.3, 0.9)); o.text = seg(s, 0.55, 0.95);
      break;
    case 'stamp':
      if (leaving) { o.scale = 1 + 0.12 * (1 - s); o.fade = s; break; }
      if (s < 0.35) {
        const f = seg(s, 0, 0.35);
        o.scale = 1.3 - 0.34 * f * f * f; o.fade = Math.min(1, f * 2.5);
      } else {
        const tau = (s - 0.35) / 0.65;
        o.scale = 1 - 0.04 * Math.exp(-5 * tau) * Math.cos(10 * tau);
      }
      break;
    case 'typed':
      o.plate = seg(s, 0, 0.1); o.typed = seg(s, 0.1, 0.65); o.role = e(seg(s, 0.65, 0.9)); o.lift = 1 - o.role;
      break;
    case 'strip':
      o.plate = e(seg(s, 0, 0.5)); o.mark = e(seg(s, 0.3, 0.6)); o.text = seg(s, 0.3, 0.8); o.hair = e(seg(s, 0.4, 1));
      break;
    case 'pill':
      o.plate = e(seg(s, 0, 0.75)); o.text = seg(s, 0.35, 0.8);
      break;
    default:
  }
  return o;
}

const TONES = { accent: 'accent', ink: 'ink', muted: 'muted' };

function build(el, text, prm) {
  const doc = el.ownerDocument;
  const [name, ...rest] = String(text).split('|').map((x) => x.replace(/\s+/g, ' ').trim());
  const role = rest.join(' | ');
  const root = doc.createElement('div');
  root.className = 'mm-lt';
  root.innerHTML = '<span class="mm-lt__mark"></span>'
    + '<span class="mm-lt__corner mm-lt__corner--tl"></span><span class="mm-lt__corner mm-lt__corner--tr"></span>'
    + '<span class="mm-lt__corner mm-lt__corner--bl"></span><span class="mm-lt__corner mm-lt__corner--br"></span>'
    + '<span class="mm-lt__plate"><span class="mm-lt__dot"></span>'
    + '<span class="mm-lt__text"><span class="mm-lt__name"><span class="mm-lt__typed"></span><span class="mm-lt__caret"></span><span class="mm-lt__rest"></span></span>'
    + '<span class="mm-lt__role"></span></span><span class="mm-lt__hair"></span></span>';
  root.querySelector('.mm-lt__name').dataset.full = name;
  root.querySelector('.mm-lt__role').textContent = role;
  if (!role) root.querySelector('.mm-lt__role').hidden = true;
  el.replaceChildren(root);
  return root;
}

/** Draws the lower third at show-amount `s` in `el` (built from the slot's text the first time). */
export function render(el, prm, s, { leaving = false, ease } = {}) {
  let root = el.querySelector(':scope > .mm-lt');
  if (!root) root = build(el, el.textContent || '', prm);
  const mech = MECHANISMS.includes(prm.mechanism) ? prm.mechanism : DEFAULTS.mechanism;
  const side = prm.side === 'right' ? 'right' : 'left';
  const dir = side === 'right' ? -1 : 1;
  const stroke = Math.min(3, Math.max(0.05, Number(prm.stroke) || DEFAULTS.stroke));
  root.dataset.mechanism = mech;
  root.dataset.side = side;
  root.dataset.tone = TONES[prm.tone] ?? 'accent';
  root.dataset.plate = truthy(prm.plate) ? 'true' : 'false';
  root.style.setProperty('--mm-lt-stroke', `calc(min(var(--mm-frame-w), var(--mm-frame-h)) * ${r4(stroke / 100)})`);
  const q = (sel) => root.querySelector(sel);
  const mark = q('.mm-lt__mark'), plate = q('.mm-lt__plate'), text = q('.mm-lt__text'), name = q('.mm-lt__name'), role = q('.mm-lt__role');
  const a = pose(mech, s, leaving, ease);

  // the part that wipes in from the mark's side: a clip that reveals the share `c` of the plate
  const reveal = (c, h = 0, wide = plate.offsetWidth) => {
    const cut = (1 - c) * 100;
    return h ? `inset(0 ${side === 'left' ? r4((wide - h) * (1 - c)) : 0}px 0 ${side === 'right' ? r4((wide - h) * (1 - c)) : 0}px round ${r4(h / 2)}px)`
      : `inset(0 ${side === 'left' ? r4(cut) : 0}% 0 ${side === 'right' ? r4(cut) : 0}%)`;
  };

  if (mech === 'bar-wipe') {
    mark.style.clipPath = `inset(${r4((1 - a.mark) * 100)}% 0 0 0)`;
    plate.style.clipPath = reveal(a.plate);
    plate.style.translate = `${r4(-dir * a.slide * 40)}% 0`;
  } else if (mech === 'tab') {
    mark.style.translate = `calc((var(--mm-safe) + 100%) * ${r4(-dir * (1 - a.mark))}) 0`;
    plate.style.clipPath = reveal(a.plate);
    text.style.opacity = r4(a.text);
  } else if (mech === 'bracket') {
    text.style.opacity = r4(a.text);
    plate.style.opacity = r4(a.text);
    text.style.translate = `0 calc(var(--mm-space-3) * ${r4(a.lift)})`;
    for (const c of root.querySelectorAll('.mm-lt__corner')) {
      c.style.width = c.style.height = `calc(var(--mm-space-5) * ${r4(a.arm)})`;
    }
  } else if (mech === 'flip') {
    root.style.perspective = 'calc(var(--mm-size-display) * 6)';
    plate.style.transformOrigin = `${side} center`;
    plate.style.rotate = a.flip > 0 ? `y ${r4(-dir * a.flip * 90)}deg` : '';
  } else if (mech === 'stamp') {
    plate.style.transformOrigin = `${side} bottom`;
    plate.style.scale = a.scale === 1 ? '' : r4(a.scale);
    plate.style.opacity = a.fade < 1 ? r4(a.fade) : '';
  } else if (mech === 'typed') {
    plate.style.opacity = r4(a.plate);
    const full = Array.from(name.dataset.full), k = Math.floor(a.typed * full.length + 1e-9);
    q('.mm-lt__typed').textContent = full.slice(0, k).join('');
    q('.mm-lt__rest').textContent = full.slice(k).join('');
    q('.mm-lt__caret').hidden = !(truthy(prm.caret) && a.typed < 1 && s > 0.1);
    role.style.opacity = r4(a.role);
    role.style.translate = `0 calc(var(--mm-space-2) * ${r4(a.lift)})`;
  } else if (mech === 'strip') {
    plate.style.clipPath = reveal(a.plate);
    text.style.opacity = r4(a.text);
    q('.mm-lt__dot').style.scale = r4(a.mark);
    const at = Math.min(1, Math.max(0, Number(prm.progress) || 0));
    plate.style.setProperty('--mm-lt-hair', `${r4(at * a.hair * 100)}%`);
  } else if (mech === 'pill') {
    const h = plate.offsetHeight, dot = q('.mm-lt__dot');
    plate.style[side === 'left' ? 'paddingLeft' : 'paddingRight'] = `${r4((h - dot.offsetWidth) / 2)}px`;   // the dot sits in the middle of the capsule's round end
    plate.style.clipPath = reveal(a.plate, h);
    text.style.opacity = r4(a.text);
  }
  if (mech !== 'typed') {
    q('.mm-lt__typed').textContent = name.dataset.full;
    q('.mm-lt__rest').textContent = '';
    q('.mm-lt__caret').hidden = true;
  }
  return root;
}

export default {
  name: 'lower-third',
  group: 'text',
  dur: 'standard',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const lin = ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    render(el, prm, lin, { ease: (x) => ctx.ease('enter', x) });
  },
};
