// count(el, from, to, p, opts): writes the number at eased progress p with tabular digits.
// p is clamped to [0, 1] so a spring's overshoot never shows a number the fact does not carry.
// opts: pad (minimum integer digits, zero-filled), fix (decimals), prefix, suffix, hold.
// hold: true keeps the prefix and suffix in place but invisible until the number lands (p = 1), so
// a unit never reads against a number the fact does not carry ("1 rules") and the
// figure's box does not change when the unit appears.

export function formatNumber(v, { pad = 0, fix = 0, prefix = '', suffix = '' } = {}) {
  const abs = Math.abs(v).toFixed(fix);
  const [int, frac] = abs.split('.');
  const sign = v < 0 && Number(abs) !== 0 ? '-' : '';
  return `${prefix}${sign}${int.padStart(pad, '0')}${frac != null ? `.${frac}` : ''}${suffix}`;
}

function held(doc, text) {
  const s = doc.createElement('span');
  s.className = 'mm-unit';
  s.style.visibility = 'hidden';
  s.textContent = text;
  return s;
}

export function count(el, from, to, p, opts = {}) {
  const q = p < 0 ? 0 : p > 1 ? 1 : p;
  const { hold = false, ...fmt } = opts;
  const v = from + (to - from) * q;
  const text = formatNumber(v, fmt);
  if (hold && q < 1 && (fmt.prefix || fmt.suffix) && el.ownerDocument) {
    el.textContent = '';
    if (fmt.prefix) el.append(held(el.ownerDocument, fmt.prefix));
    el.append(formatNumber(v, { ...fmt, prefix: '', suffix: '' }));
    if (fmt.suffix) el.append(held(el.ownerDocument, fmt.suffix));
  } else {
    el.textContent = text;
  }
  el.style.fontVariantNumeric = 'tabular-nums';
  return text;
}
