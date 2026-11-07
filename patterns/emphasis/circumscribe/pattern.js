// emphasis/circumscribe: an outline draws itself around the element, then is wiped away from where
// it started. Around the text when the element is a bare text block, around the box when it is a
// plate (it has a fill, an image or a border). The outline is one SVG rect with pathLength 1, in
// real pixels, so its length is a fraction and the dash maths is the progress. Writes a child inside
// the element (a seek restores the markup) and sets position when the element is static. Nothing is
// left at p = 1.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const NS = 'http://www.w3.org/2000/svg';
const DRAW = 0.5;
const HOLD = 0.6;

// The rectangle to outline, in the element's own unscaled pixels, relative to its padding box.
function frame(el, pad) {
  const cs = getComputedStyle(el);
  const filled = cs.backgroundImage !== 'none' || !/^(transparent|rgba\(.*,\s*0\))$/.test(cs.backgroundColor) || parseFloat(cs.borderTopWidth) > 0;
  const box = el.getBoundingClientRect();
  const k = el.offsetWidth ? box.width / el.offsetWidth : 1;
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const t = range.getBoundingClientRect();
  if (filled || !(t.width > 0)) return { x: -pad, y: -pad, w: el.offsetWidth + 2 * pad, h: el.offsetHeight + 2 * pad };
  return { x: (t.left - box.left) / k - pad, y: (t.top - box.top) / k - pad, w: t.width / k + 2 * pad, h: t.height / k + 2 * pad };
}

function outline(el, pad) {
  const doc = el.ownerDocument;
  const f = frame(el, pad);
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'mm-circumscribe');
  svg.setAttribute('viewBox', `0 0 ${f.w.toFixed(3)} ${f.h.toFixed(3)}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.style.left = `${f.x.toFixed(3)}px`;
  svg.style.top = `${f.y.toFixed(3)}px`;
  svg.style.width = `${f.w.toFixed(3)}px`;
  svg.style.height = `${f.h.toFixed(3)}px`;
  const rect = doc.createElementNS(NS, 'rect');
  rect.setAttribute('x', '0');
  rect.setAttribute('y', '0');
  rect.setAttribute('width', f.w.toFixed(3));
  rect.setAttribute('height', f.h.toFixed(3));
  rect.setAttribute('pathLength', '1');
  svg.append(rect);
  el.append(svg);
  return rect;
}

export default {
  name: 'circumscribe',
  group: 'emphasis',
  dur: 'slow',
  params: {},
  at(el, p) {
    const q = clamp01(p);
    const head = clamp01(q / DRAW);
    const tail = clamp01((q - HOLD) / (1 - HOLD));
    const len = head - tail;
    if (!(len > 1e-4) || q >= 1) return;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const pad = parseFloat(getComputedStyle(el).getPropertyValue('--mm-space-3')) || 0;
    const rect = el.querySelector(':scope > .mm-circumscribe rect') ?? outline(el, pad);
    rect.style.strokeDasharray = `${len.toFixed(5)} 2`;
    rect.style.strokeDashoffset = (-tail).toFixed(5);
  },
};
