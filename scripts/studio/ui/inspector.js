// The inspector: the selected scene or beat as fields, each change one edit op. A pattern's
// params become controls from its own `params` schema (number, enum(a|b), string, boolean), each
// showing its default and a reset that removes the key so the default applies again. Read-only
// pieces get the same fields, disabled. Numbers are text fields with a decimal point in every locale
//. Enter saves a field and keeps the focus there; Escape goes back to the timeline.
// The lists come from the piece: cues from its patterns' sound folder, roles from its style.
import { forFormat } from '../../../runtime/kit/schedule.js';
import { rawAt } from './gestures.js';
import { h, num, parseNum } from './dom.js';

const choicesOf = (spec) => /^enum\((.*)\)$/.exec(String(spec?.type ?? ''))?.[1]?.split('|') ?? (spec?.type === 'enum' && Array.isArray(spec.values) ? spec.values : null);

export function createInspector(root, { engine, onEdit, onEscape }) {
  let seq = 0, rendered = Promise.resolve();
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); onEscape(); } });

  function field(label, control, { hint, id } = {}) {
    const wrap = h('div', 'field');
    const lab = h('label', 'field-label', { for: id }, label);
    wrap.append(lab, control);
    if (hint) wrap.append(h('span', 'field-hint', {}, hint));
    return wrap;
  }

  function select(id, options, value, onChange, { disabled } = {}) {
    const s = h('select', 'input', { id, 'data-field': id, disabled });
    for (const o of options) {
      const [v, text] = Array.isArray(o) ? o : [o, o];
      const opt = h('option', null, { value: v }, text);
      if (v === value) opt.selected = true;
      s.append(opt);
    }
    s.addEventListener('change', () => onChange(s.value));
    return s;
  }

  /** A text field (or a textarea with `rows`); `number` makes it a decimal field. Saves on change or Enter, once per value. */
  function input(id, type, value, onChange, { disabled, placeholder, rows } = {}) {
    const isNum = type === 'number';
    const el = rows ? h('textarea', 'input', { id, 'data-field': id, rows, disabled, placeholder })
      : h('input', `input${isNum ? ' num' : ''}`, { id, 'data-field': id, type: 'text', inputmode: isNum ? 'decimal' : null, disabled, placeholder, spellcheck: 'false', autocomplete: 'off' });
    el.value = value == null || value === '' ? '' : isNum ? num(value) : String(value);
    let last = el.value;
    const save = () => {
      if (el.value === last) return;
      last = el.value;
      if (isNum && el.value.trim() !== '' && parseNum(el.value) == null) { el.setCustomValidity('a number, like 0.5'); el.reportValidity(); return; }
      el.setCustomValidity('');
      onChange(isNum ? parseNum(el.value) : el.value);
    };
    el.addEventListener('change', save);
    if (!rows) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    return el;
  }

  /** Controls for a pattern's params; `set(key, value|null)` writes one. */
  function paramControls(meta, current, set, disabled, prefix) {
    const box = h('div', 'params');
    const entries = Object.entries(meta?.params ?? {});
    if (!entries.length) { box.append(h('p', 'muted', {}, meta ? 'No params.' : 'Its module did not load, so its params are unknown.')); return box; }
    for (const [k, spec] of entries) {
      const id = `${prefix}-${k}`, has = current != null && Object.hasOwn(current, k), v = has ? current[k] : spec.default;
      const choices = choicesOf(spec);
      let control;
      if (choices) control = select(id, choices, String(v), (x) => set(k, typeof spec.default === 'number' ? Number(x) : x), { disabled });
      else if (spec.type === 'boolean') {
        control = h('input', 'check', { id, type: 'checkbox', disabled });
        control.checked = !!v;
        control.addEventListener('change', () => set(k, control.checked));
      } else if (spec.type === 'number') control = input(id, 'number', v, (x) => set(k, x), { disabled });
      else control = input(id, 'text', v, (x) => set(k, x), { disabled });
      control.dataset.param = k;
      const reset = h('button', 'reset', { type: 'button', 'data-reset': k, disabled: disabled || !has, title: `Reset ${k} to its default (${JSON.stringify(spec.default)})`, 'aria-label': `Reset ${k} to its default` }, '↺');
      reset.addEventListener('click', () => set(k, null));
      const row = h('div', `param${has ? ' is-set' : ''}`);
      row.append(h('label', 'field-label', { for: id, title: spec.meaning ?? '' }, k), control, reset, h('span', 'field-hint', {}, `default ${JSON.stringify(spec.default)}`));
      box.append(row);
    }
    return box;
  }

  function render(args) { rendered = draw(args); return rendered; }

  async function draw({ story, format, selection, model, style, readOnly, offline, patterns }) {
    const my = ++seq;
    const focused = root.contains(document.activeElement) ? document.activeElement.id : null;
    const body = h('div', 'inspector-body');
    const dis = !!readOnly || !!offline;
    if (!selection) {
      body.append(h('p', 'empty', {}, readOnly
        ? 'Select a beat or a scene to see its timing and params: click it on the timeline or the stage, or Tab into the timeline and use the arrows. This piece is read-only here.'
        : 'Select a beat or a scene: click it on the timeline or the stage, or Tab into the timeline and use the arrows. Drag a clip to retime it, or its right edge to set when it leaves; press ? for the keys.'));
    } else if (/^\/scenes\/\d+$/.test(selection.path)) {
      const i = Number(selection.path.split('/')[2]);
      const raw = story.scenes[i], view = forFormat(story, format).scenes[i], ms = model.scenes[i];
      if (!raw) return;
      const id = raw.id;
      body.append(h('h2', 'insp-title', {}, `Scene ${id}`), h('p', 'insp-sub', {}, `${num(ms.start)} s to ${num(ms.end)} s`));
      body.append(field('Layout', h('output', 'value', { id: 'f-layout' }, view.layout)));
      body.append(field('Duration', input('f-duration', 'number', raw.duration, (x) => x != null && onEdit({ op: 'scene.duration', scene: id, value: x }, `${id} lasts ${x} s`), { disabled: dis }), { id: 'f-duration', hint: 's' }));
      // a scene with a position can always go back to arriving by it, even after an explicit cut
      const cuts = [...(raw.position ? [['', `by position (${raw.position})`]] : []), ...new Set([...(raw.cut ? [raw.cut] : []), ...(patterns.transitions ?? []).map((n) => `transitions/${n}`)])];
      body.append(field('Cut', select('f-cut', cuts, raw.cut ?? '', (x) => onEdit({ op: 'scene.cut', scene: id, pattern: x || null, params: null }, `${id} cut ${x}`), { disabled: dis }), { id: 'f-cut' }));
      const cutMeta = raw.cut ? await engine.module(raw.cut) : null;
      if (my !== seq) return;
      if (raw.cut) body.append(paramControls(cutMeta, raw.cutParams, (k, v) => onEdit({ op: 'scene.cut', scene: id, pattern: raw.cut, params: bagWith(raw.cutParams, k, v) }, `${id} cut ${k}`), dis, 'cut'));
      const moves = [['', 'none'], ...(patterns.moves ?? []).map((n) => `moves/${n}`)];
      body.append(field('Move', select('f-move', moves, view.move ?? '', (x) => onEdit({ op: 'scene.move', scene: id, pattern: x || null, params: null, format }, `${id} move ${x || 'none'}`), { disabled: dis }), { id: 'f-move' }));
      if (view.move) {
        const mm = await engine.module(view.move);
        if (my !== seq) return;
        body.append(paramControls(mm, view.moveParams, (k, v) => onEdit({ op: 'scene.move', scene: id, pattern: view.move, params: bagWith(view.moveParams, k, v), format }, `${id} move ${k}`), dis, 'move'));
      }
      body.append(field('Say', input('f-say', null, view.say ?? '', (x) => onEdit({ op: 'scene.say', scene: id, value: x, format }, `${id} narration`), { disabled: dis, rows: 3 }), { id: 'f-say' }));
    } else {
      const beat = rawAt(story, selection.path);
      const i = Number(selection.path.split('/')[2]), j = Number(selection.path.split('/').pop());
      const sc = story.scenes[i];
      if (!beat || !sc) return;
      const at = { scene: sc.id, beat: j, format };
      const set = (key) => (v) => onEdit({ op: 'beat.set', ...at, key, value: v === '' ? null : v }, `${beat.slot} ${key}`);
      body.append(h('h2', 'insp-title', {}, beat.text ? `“${String(beat.text).slice(0, 40)}${String(beat.text).length > 40 ? '…' : ''}”` : beat.slot), h('p', 'insp-sub', {}, `Beat ${j + 1} of ${sc.id}${selection.path.includes('/variants/') ? ` (${format} variant)` : ''}`));
      const layout = model.scenes[i]?.layout;
      const slots = [...new Set([beat.slot, ...(layout ? await engine.layoutSlots(layout) : [])])];
      if (my !== seq) return;
      body.append(field('Slot', select('f-slot', slots, beat.slot, set('slot'), { disabled: dis }), { id: 'f-slot' }));
      const group = beat.fx.startsWith('style:') ? 'entrances' : beat.fx.split('/')[0];
      const roles = Object.entries(style?.entrances ?? {}).filter(([, ref]) => typeof ref === 'string').map(([r, ref]) => [`style:${r}`, `style: ${r} (${ref.split('/').pop()})`]);
      const fxs = [...new Set([beat.fx, ...roles.map((r) => r[0]), ...(patterns[group] ?? []).map((n) => `${group}/${n}`)])].map((v) => roles.find((r) => r[0] === v) ?? v);
      body.append(field('Entrance', select('f-fx', fxs, beat.fx, set('fx'), { disabled: dis }), { id: 'f-fx' }));
      body.append(field('Text', input('f-text', null, beat.text ?? '', set('text'), { disabled: dis, rows: 2 }), { id: 'f-text' }));
      const times = h('div', 'span-inputs');
      times.append(
        input('f-at', 'number', beat.at, (x) => x != null && onEdit({ op: 'beat.at', ...at, value: x }, `${beat.slot} at ${x} s`), { disabled: dis }),
        h('span', 'field-hint', { 'aria-hidden': 'true' }, 'to'),
        input('f-out', 'number', beat.out ?? '', (x) => onEdit({ op: 'beat.out', ...at, value: x }, `${beat.slot} out ${x ?? 'none'}`), { disabled: dis, placeholder: 'end' }),
      );
      times.firstChild.setAttribute('aria-label', 'At, in seconds into the scene');
      times.lastChild.setAttribute('aria-label', 'Out, in seconds into the scene; empty stays to the scene end');
      body.append(field('Time', times, { id: 'f-at', hint: 's' }));
      const cues = [...new Set([...(beat.cue ? [beat.cue] : []), ...(patterns.sound ?? [])])];
      body.append(field('Cue', select('f-cue', [['', 'none'], ...cues], beat.cue ?? '', set('cue'), { disabled: dis }), { id: 'f-cue' }));
      body.append(field('Emphasis', select('f-emphasis', [['', 'none'], ...(patterns.emphasis ?? []).map((n) => `emphasis/${n}`)], beat.emphasis ?? '', set('emphasis'), { disabled: dis }), { id: 'f-emphasis' }));
      const ref = beat.fx.startsWith('style:') ? style?.entrances?.[beat.fx.slice(6)] : beat.fx;
      const meta = ref ? await engine.module(ref) : null;
      if (my !== seq) return;
      const sec = h('section', 'insp-section');
      sec.append(h('h3', 'insp-h3', {}, `Params of ${ref ?? beat.fx}`));
      sec.append(paramControls(meta, beat.params, (k, v) => onEdit({ op: 'beat.param', ...at, key: k, value: v }, `${beat.slot} ${k}`), dis, 'p'));
      body.append(sec);
    }
    if (my !== seq) return;
    root.replaceChildren(body);
    if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
  }

  return {
    render,
    /** Focuses the first field that can be changed, once the current render is done. */
    async focusFirst() {
      await rendered;
      const el = root.querySelector('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? root.querySelector('input, select, textarea');
      if (el) el.focus(); else { root.tabIndex = -1; root.focus(); }
    },
  };
}

/** A params bag with `k` set to `v`, or removed when `v` is null; null when nothing is left. */
function bagWith(bag, k, v) {
  const out = { ...(bag ?? {}) };
  if (v == null) delete out[k]; else out[k] = v;
  return Object.keys(out).length ? out : null;
}
