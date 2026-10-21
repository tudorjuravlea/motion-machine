// The studio page's one DOM helper and its number format. Times and numbers always read and
// parse with a decimal point, whatever the browser's locale.

/** An element: h('div', 'cls', { attr: value }, 'text'); null and false attributes are left out. */
export function h(tag, cls, attrs = {}, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v === true ? '' : String(v));
  if (text != null) el.textContent = text;
  return el;
}

/** "0.5", "1.25": up to two decimals, a point, no trailing zeros. */
export const num = (t) => String(Math.round(t * 100) / 100);

/** "0.50": two decimals, for times beside each other. */
export const fixed = (t) => (Math.round(t * 100) / 100).toFixed(2);

/** A typed number: "0,8" and "0.8" both read 0.8; '' and junk read null. */
export function parseNum(text) {
  const s = String(text ?? '').trim().replace(',', '.');
  if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return Number(s);
}
