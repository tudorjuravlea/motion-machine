// transitions/whip-pan: a fast pan with a directional blur. Both scenes travel one frame, like
// push, and a one-axis blur swells and falls with the speed. The blur is an SVG filter written
// once into the page (parsed from markup, so it needs no namespace string); its strength is the
// unitless `amount` param times --mm-travel times one space step, shaped by a half sine of p.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['transform', 'filter'];
const FILTER_ID = 'mm-tx-whip';
const HOST_ID = 'mm-tx-whip-host';

const params = {
  direction: { type: 'enum(left|right|up|down)', default: 'left', meaning: 'where the content travels: left carries the outgoing scene off to the left' },
  amount: { type: 'number', default: 1, meaning: 'blur strength as a multiple of one space step, before --mm-travel' },
};
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

function filterNode(doc) {
  let host = doc.getElementById(HOST_ID);
  if (!host) {
    host = doc.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('data-mm-overlay', '');   // the kit removes it on every seek
    host.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none';
    host.innerHTML = `<svg width="0" height="0"><filter id="${FILTER_ID}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0 0"/></filter></svg>`;
    doc.body.append(host);
  }
  return host.querySelector('feGaussianBlur');
}

export default {
  name: 'whip-pan',
  group: 'transitions',
  dur: 'quick',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    const doc = to.ownerDocument;
    if (p >= 1) { doc.getElementById(HOST_ID)?.remove(); return; }
    const prm = { ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default])), ...ctx.params };
    const [vx, vy] = VEC[prm.direction] ?? VEC.left;
    const q = clamp01(p);
    const space = ctx.style?.space?.[4] ?? 0;
    const travel = ctx.style?.motion?.travel ?? 1;
    const sigma = Number(prm.amount) * travel * space * Math.sin(Math.PI * q);
    if (sigma > 0.01) {
      filterNode(doc).setAttribute('stdDeviation', `${r3(Math.abs(vx) * sigma)} ${r3(Math.abs(vy) * sigma)}`);
      if (from) from.style.filter = `url(#${FILTER_ID})`;
      to.style.filter = `url(#${FILTER_ID})`;
    }
    if (from && q > 0) from.style.transform = `translate(${r3(vx * q * 100)}%, ${r3(vy * q * 100)}%)`;
    to.style.transform = `translate(${r3(-vx * (1 - q) * 100)}%, ${r3(-vy * (1 - q) * 100)}%)`;
  },
};
