// transitions/push: both scenes travel, the outgoing one pushed off as the incoming one slides in
// behind it. Travel is one full frame (percent of the section), so --mm-travel is not applied: a
// shorter push would leave a seam.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const r3 = (x) => String(Math.round(x * 1000) / 1000);
const OWN = ['transform'];

const params = {
  direction: { type: 'enum(left|right|up|down)', default: 'left', meaning: 'where the content travels: left carries the outgoing scene off to the left' },
};
// Unit vector of the outgoing scene's travel.
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

function clear(el) {
  if (!el) return;
  for (const k of OWN) el.style.removeProperty(k);
  if (!el.getAttribute('style')) el.removeAttribute('style');
}

export default {
  name: 'push',
  group: 'transitions',
  dur: 'standard',
  params,
  at(incoming, p, ctx = {}) {
    const to = ctx.to ?? incoming;
    const from = ctx.from;
    clear(from); clear(to);
    if (p >= 1) return;
    const [vx, vy] = VEC[ctx.params?.direction ?? params.direction.default] ?? VEC.left;
    const q = clamp01(p);
    if (from && q > 0) from.style.transform = `translate(${r3(vx * q * 100)}%, ${r3(vy * q * 100)}%)`;
    to.style.transform = `translate(${r3(-vx * (1 - q) * 100)}%, ${r3(-vy * (1 - q) * 100)}%)`;
  },
};
