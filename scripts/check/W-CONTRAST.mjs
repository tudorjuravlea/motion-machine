// W-CONTRAST (SPEC §7, provisional WCAG AA): at rests, body text below 4.5:1 against its sampled
// background, or display text below 3:1. Display text is set in the display face or at least the
// h2 size; everything else is body. ::before/::after text is included. A colour the gate
// cannot parse is not skipped silently: the rule reports SKIP (partial) naming it.
// The rendered background: the computed colour is not always what lies behind text (a
// gradient on a sibling, a picture under a caption), so for every text box with no background of
// its own the gate shoots the rest with every text transparent and reads the pixels under the box.
// The ratio is the lower of the computed one and the 5th percentile against those pixels (the
// darkest or lightest stretch, not one stray pixel).
import { rule } from '../lib/report.mjs';
import { decodePng } from './_pixels.mjs';
import { contrastRatio, parseColor, restInstants, round, texts } from './_lib.mjs';

export const scope = 'format';
export const BODY = 4.5;
export const DISPLAY = 3;
export const PERCENTILE = 0.05;

const HIDE = '.mm-stage *, .mm-stage *::before, .mm-stage *::after { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; -webkit-text-stroke-color: transparent !important; caret-color: transparent !important; }';

// The stage shot at the current seek with its text transparent, and the stage's page offset.
async function behindText(page) {
  const handle = await page.addStyleTag({ content: HIDE });
  try {
    const png = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
    const at = await page.evaluate(() => { const r = document.querySelector('.mm-stage').getBoundingClientRect(); return { x: r.x, y: r.y }; });
    return { img: decodePng(png), at };
  } finally { await handle.evaluate((n) => n.remove()); }
}

// The PERCENTILE-lowest contrast of fg against the rendered pixels inside the box (stage coordinates).
function renderedRatio(fg, box, { img, at }) {
  const x0 = Math.max(0, Math.floor(box.x + at.x)), y0 = Math.max(0, Math.floor(box.y + at.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + at.x + box.w)), y1 = Math.min(img.height, Math.ceil(box.y + at.y + box.h));
  const step = Math.max(1, Math.round(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  const ratios = [];
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * img.width + x) * 4;
    ratios.push(contrastRatio(fg, [img.data[i], img.data[i + 1], img.data[i + 2], 1]));
  }
  if (!ratios.length) return null;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(PERCENTILE * (ratios.length - 1))];
}

export default async function (ctx) {
  const display = ctx.style.type.display.family.toLowerCase();
  const h2 = ctx.style.scale.h2 * ctx.floors.base;
  const low = [], unread = [];
  for (const t of restInstants(ctx.schedule)) {
    const s = await ctx.sample(t);
    let shot = null;
    for (const e of texts(s)) {
      const fg = parseColor(e.color), bg = parseColor(e.bg);
      if (!fg || !bg) { unread.push({ instant: round(t), selector: e.selector, colors: `${e.color} on ${e.bg}` }); continue; }
      const isDisplay = e.fontFamily.toLowerCase().includes(display) || e.fontPx >= h2;
      const need = isDisplay ? DISPLAY : BODY;
      let r = contrastRatio(fg, bg), background = 'computed';
      if (!e.ownBg) {
        if (!shot) { await ctx.mm.seek(t); shot = await behindText(ctx.page); }
        const seen = renderedRatio(fg, e.box, shot);
        if (seen != null && seen < r) { r = seen; background = 'rendered'; }
      }
      if (r < need) low.push({ instant: round(t), selector: e.selector, measured: round(r, 2), threshold: need, background, colors: `${e.color} on ${background === 'rendered' ? 'the rendered gradient' : e.bg}` });
    }
  }
  if (low.length) return rule('W-CONTRAST', 'WARN', { ...low[0], reason: `contrast ${low[0].measured}:1 is under ${low[0].threshold}:1 (${low[0].colors})`, all: low.slice(0, 20) });
  if (unread.length) return rule('W-CONTRAST', 'SKIP', { partial: true, ...unread[0], reason: `partial: ${unread.length} text colour pair(s) could not be parsed, so their contrast was not measured (${unread[0].colors})`, all: unread.slice(0, 20) });
  return rule('W-CONTRAST', 'PASS', { body: BODY, display: DISPLAY });
}
