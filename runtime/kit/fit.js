// fit(el, targetPx, { max, min, line }): sets el's font-size so its widest line is targetPx wide
// (default: the element's own measure, clientWidth), clamped to [min, max] px. `line` optionally
// sets a unitless line-height. Lines are the element's explicit lines (<br> or newlines); call it
// after document.fonts.ready. Returns the font size in px.

const REF = 1000; // measuring size; offsetWidth rounding is then a thousandth of the result

export function fit(el, targetPx = el.clientWidth, { max = Infinity, min = 0, line = null } = {}) {
  if (line != null) el.style.lineHeight = String(line);
  const lines = (el.innerText || el.textContent || '').split('\n').filter((s) => s.trim() !== '');
  if (!lines.length || !(targetPx > 0)) return parseFloat(getComputedStyle(el).fontSize);
  const probe = el.ownerDocument.createElement('span');
  probe.style.cssText = `position:absolute;left:0;top:0;visibility:hidden;white-space:pre;font-size:${REF}px;`;
  el.appendChild(probe);
  let widest = 0;
  for (const s of lines) { probe.textContent = s; widest = Math.max(widest, probe.offsetWidth); }
  probe.remove();
  if (!widest) return parseFloat(getComputedStyle(el).fontSize);
  const px = Math.min(max, Math.max(min, (REF * targetPx) / widest));
  el.style.fontSize = `${px}px`;
  return px;
}
