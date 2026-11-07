// count(el, from, to, p, opts): writes the number at eased progress p with tabular digits.
// p is clamped to [0, 1] so a spring's overshoot never shows a number the fact does not carry.
// opts: pad (minimum integer digits, zero-filled), fix (decimals), prefix, suffix, hold, compact.
// compact: true writes a scaled unit after the number (14K, 1.2M, 3B, 2T): `fix` is the decimals of the
// scaled number, and a value that rounds up to 1000 of a unit moves to the next one.
// hold: true keeps the prefix and suffix in place but invisible until the number lands (p = 1), so
// a unit never reads against a number the fact does not carry ("1 rules") and the
// figure's box does not change when the unit appears.

const UNITS = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/** A number scaled to its unit for `compact`: { value, unit }, the value rounded to `fix` decimals. */
export function compactParts(v, fix = 0) {
  const a = Math.abs(v), k = 10 ** fix;
  let i = UNITS.findIndex(([m]) => a >= m);
  const scaled = (j) => (j < 0 ? a : a / UNITS[j][0]);
  // a value that rounds up to 1000 of its unit belongs to the next unit up
  if (Math.round(scaled(i) * k) / k >= 1000 && i !== 0) i = i < 0 ? UNITS.length - 1 : i - 1;
  return { value: Math.sign(v) * scaled(i), unit: i < 0 ? '' : UNITS[i][1] };
}

export function formatNumber(v, { pad = 0, fix = 0, prefix = '', suffix = '', compact = false } = {}) {
  const c = compact ? compactParts(v, fix) : { value: v, unit: '' };
  const abs = Math.abs(c.value).toFixed(fix);
  const [int, frac] = abs.split('.');
  const sign = c.value < 0 && Number(abs) !== 0 ? '-' : '';
  return `${prefix}${sign}${int.padStart(pad, '0')}${frac != null ? `.${frac}` : ''}${c.unit}${suffix}`;
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
