// data/bar-to-line: up to eight bars grow from the baseline in turn, then each bar draws in to a dot
// at its own top while a line is drawn through the dots, left to right: the same numbers, read
// first as amounts and then as a trend. Values come from the `values` param ("40,70,55"); height is
// value / max. The focus point's value counts up and rides above it. p is clamped: no bar or dot
// passes its fact. At p = 1 the slot is the finished line chart.
import { count } from '../../../runtime/kit/count.js';

const NS = 'http://www.w3.org/2000/svg';
const MAX = 8, GROW = 0.45, MORPH = [0.45, 0.7], DRAW = [0.55, 1];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const num = (v, d) => { const n = Number(v); return v !== '' && v != null && Number.isFinite(n) ? n : d; };
const f3 = (x) => x.toFixed(3);

const params = {
  values: { type: 'string', default: '', meaning: 'comma list of up to eight numbers' },
  labels: { type: 'string', default: '', meaning: 'comma list of names under the points' },
  max: { type: 'number', default: 0, meaning: 'the value that fills the chart; 0 uses the largest value' },
  focus: { type: 'number', default: 0, meaning: 'one-based point whose value is shown; 0 shows the last' },
  fix: { type: 'number', default: 0, meaning: 'decimal places in the value' },
  prefix: { type: 'string', default: '', meaning: 'text before the value' },
  suffix: { type: 'string', default: '', meaning: 'text after the value' },
};

export default {
  name: 'bar-to-line',
  group: 'data',
  dur: 'slow',
  params,
  at(el, p, ctx) {
    const prm = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default])), ...ctx.params };
    const doc = el.ownerDocument;
    const vals = String(prm.values || el.dataset.pValues || '').split(',').map((s) => s.trim()).filter((s) => s !== '').map(Number).filter(Number.isFinite).slice(0, MAX);
    const names = String(prm.labels || '').split(',').map((s) => s.trim());
    const n = vals.length;
    el.replaceChildren();
    if (!n) return;
    const root = doc.createElement('div');   // the class lives on a wrapper rebuilt each frame (the kit restores a slot's html, not its classes)
    root.className = 'mm-b2l';
    el.append(root);
    // the phases run on the beat's own clock (the kit eases p; each phase eases itself)
    const q = p >= 1 ? 1 : ctx.u != null && ctx.d > 0 ? clamp01(ctx.u / ctx.d) : clamp01(p);
    const max = num(prm.max, 0) > 0 ? num(prm.max, 0) : Math.max(...vals, 0) || 1;
    const focus = Math.min(n, Math.max(1, Math.round(num(prm.focus, 0)) || n)) - 1;
    const fix = Math.min(4, Math.max(0, Math.round(num(prm.fix, 0))));
    const gap = n > 1 ? 0.4 / (n - 1) : 0;          // bars start in turn over the first 40 % of the grow
    const m = clamp01(ctx.ease('move', clamp01((q - MORPH[0]) / (MORPH[1] - MORPH[0]))));
    const draw = clamp01((q - DRAW[0]) / (DRAW[1] - DRAW[0]));
    const chart = doc.createElement('div');
    chart.className = 'mm-b2l__chart';
    const hs = vals.map((v, i) => clamp01(Math.max(v, 0) / max) * clamp01(ctx.ease('enter', clamp01((q / GROW - i * gap) / (1 - gap * (n - 1))))) * 100);
    vals.forEach((v, i) => {
      const col = doc.createElement('div');
      col.className = 'mm-b2l__col';
      const well = doc.createElement('div');
      well.className = 'mm-b2l__well';
      const bar = doc.createElement('div');
      bar.className = `mm-b2l__bar${i === focus ? ' mm-b2l__bar--focus' : ''}`;
      // a bar (full width, its height) becomes a dot (0.5 em) centred on its top
      bar.style.width = `calc(${f3(1 - m)} * 100% + ${f3(m)} * 0.5em)`;
      bar.style.height = `calc(${f3((1 - m) * hs[i])}% + ${f3(m)} * 0.5em)`;
      bar.style.bottom = `calc(${f3(m * hs[i])}% - ${f3(m)} * 0.25em)`;
      bar.style.borderRadius = m > 0 ? `${f3(m * 0.25 + (1 - m) * 0.08)}em` : '';
      well.append(bar);
      if (i === focus) {
        const val = doc.createElement('div');
        val.className = 'mm-b2l__value';
        val.style.bottom = `calc(${f3(hs[i])}% + 0.4em)`;
        count(val, 0, v, clamp01(q / GROW), { fix, prefix: String(prm.prefix ?? ''), suffix: String(prm.suffix ?? '') });
        well.append(val);
      }
      col.append(well);
      if (names.some(Boolean)) { const lab = doc.createElement('div'); lab.className = 'mm-b2l__label'; lab.textContent = names[i] || '\u00a0'; col.append(lab); }   // one row for all, so the wells match
      chart.append(col);
    });
    root.append(chart);
    // the line is drawn in the wells' own pixels (measured once laid out), so its stroke and its
    // dash are true lengths; x is each column's centre, y each bar's top
    const well = chart.querySelector('.mm-b2l__well');
    const W = chart.offsetWidth, H = well.offsetHeight;
    const svg = doc.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'mm-b2l__line');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.setAttribute('aria-hidden', 'true');
    const line = doc.createElementNS(NS, 'polyline');
    line.setAttribute('points', hs.map((h, i) => `${f3(((i + 0.5) / n) * W)},${f3(H * (1 - h / 100))}`).join(' '));
    line.setAttribute('pathLength', '1');
    line.style.strokeDasharray = '1 1';
    line.style.strokeDashoffset = f3(1 - draw);
    svg.append(line);
    chart.append(svg);
  },
};
