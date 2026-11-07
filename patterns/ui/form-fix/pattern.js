// ui/form-fix: a field is filled wrongly, its error appears in a lane held back under it, the value is
// corrected and the error clears, then the button confirms on itself. Every part sits at its final
// geometry from the first frame; only opacity and transform change.
import { arrive, bar, cursorAt, drawCursor, elapsed, panel, part, pointIn, pressAt, scaleOf, timeline } from '../../../runtime/kit/ui.js';
import { glass } from '../../../runtime/kit/surface.js';

const TL = timeline([
  ['open', 0.4], ['reach', 0.6], ['type', 0.9, { after: 0.15 }], ['error', 0.3, { after: 0.3 }], ['read', 1.2],
  ['fix', 0.8], ['pause', 0.5], ['press', 0.3], ['swap', 0.35, { after: -0.15 }], ['hold', 0.6],
]);
const r3 = (x) => Math.round(x * 1000) / 1000;

export default {
  name: 'form-fix',
  group: 'ui',
  dur: TL.total,
  steps: ['type', 'error', 'fix', 'swap'].map(TL.start),
  params: {
    label: { type: 'string', default: 'Email', meaning: 'the field\'s name, shown above it' },
    wrong: { type: 'string', default: '', meaning: 'the value typed first, which the form refuses' },
    error: { type: 'string', default: '', meaning: 'what the form says is wrong, in words, one line' },
    right: { type: 'string', default: '', meaning: 'the corrected value' },
    button: { type: 'string', default: 'Save', meaning: 'the button\'s label before it is pressed' },
    done: { type: 'string', default: 'Saved', meaning: 'the label it crossfades to, in place' },
    surface: { type: 'enum(flat|glass)', default: 'flat', meaning: 'flat: the surface role; glass: the brand\'s glass surface' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx) * (TL.total / ctx.d);
    const prm = ctx.params;
    const wrong = String(prm.wrong ?? ''), right = String(prm.right ?? '');
    const root = panel(el, 'mm-ui-form-fix');
    glass(root, prm.surface);

    part(root, 'mm-ui-form-fix__label mm-ui__muted', prm.label);
    const field = part(root, 'mm-ui__field mm-ui-form-fix__input');
    const typed = part(field, 'mm-ui-form-fix__typed');
    const ring = part(field, 'mm-ui-form-fix__ring');
    const lane = part(root, 'mm-ui-form-fix__lane');
    part(lane, 'mm-ui-form-fix__mark');
    const msg = part(lane, 'mm-ui-form-fix__msg', prm.error);
    const fill = part(root, 'mm-ui-form-fix__fill');
    bar(fill, 9); bar(fill, 6);
    const row = part(root, 'mm-ui-form-fix__row');
    const button = part(row, 'mm-ui__button mm-ui-form-fix__button');
    const before = part(button, '', prm.button);
    const after = part(button, '', prm.done);

    // the field: focus on the click, the wrong value typed, then taken out and the right one put in
    const focused = t >= TL.end('reach') && t < TL.start('press');
    const tf = TL.at('fix', t);
    const typing = TL.at('type', t);
    let shown;
    if (tf <= 0) shown = wrong.slice(0, Math.round(wrong.length * typing));
    else if (tf < 0.4) shown = wrong.slice(0, Math.round(wrong.length * (1 - tf / 0.4)));
    else shown = right.slice(0, Math.round(right.length * ((tf - 0.4) / 0.6)));
    typed.textContent = shown;
    if (focused) part(typed, 'mm-ui__caret');
    ring.style.opacity = String(focused ? 1 : 0);

    // the error: in from its start, away as the fix begins
    const inn = ctx.ease('enter', TL.at('error', t));
    const out = Math.min(1, Math.max(0, (t - TL.start('fix')) / 0.25));
    lane.style.opacity = String(r3(inn * (1 - out)));
    lane.style.transform = `translateY(${Math.round((1 - inn) * ctx.unit * 0.06 * 10) / 10}px)`;
    ring.style.borderColor = `color-mix(in srgb, var(--mm-color-alert) ${Math.round(100 * inn * (1 - out))}%, var(--mm-color-accent))`;   // the field says it with the error

    // the button: its two labels share one cell, so the width never changes
    const sw = TL.at('swap', t);
    before.style.opacity = String(r3(1 - sw));
    after.style.opacity = String(r3(sw));
    button.style.scale = String(r3(pressAt(t, TL.start('press'), 0.9)));

    arrive(root, TL.at('open', t), ctx);

    // the cursor: in from outside the panel, to the field, to the button, then away from the result
    const k = scaleOf(root), W = root.offsetWidth;
    const fp = pointIn(field, root, 0.92, 0.5), bp = pointIn(button, root, 0.5, 0.5);
    const away = pointIn(row, root, 0.12, 0.5);
    const off = { x: W + 3 * 15 * k, y: fp.y + 2 * 15 * k };
    const pos = cursorAt(t, [
      { x: off.x, y: off.y, at: 0 },
      { x: fp.x, y: fp.y, at: TL.end('reach') },
      { x: fp.x, y: fp.y, at: TL.end('fix') },
      { x: bp.x, y: bp.y, at: TL.start('press') },
      { x: bp.x, y: bp.y, at: TL.start('press') + 0.35 },
      { x: away.x, y: away.y, at: TL.start('press') + 0.85 },
    ], k);
    drawCursor(root, pos, { press: Math.min(pressAt(t, TL.end('reach') - 0.15), pressAt(t, TL.start('press'))) });
  },
};
