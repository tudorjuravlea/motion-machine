// W-SUB (SPEC §2.8, §7): sub-frame blending is off by default. An export with --sub N > 1
// warns when any text element travels more than 4 px per frame, because ffmpeg tmix blends moving
// text into multi-exposure ghosts. Export-time: mm export calls subWarning(story, sub, { dir });
// mm check runs it only when given --sub, measuring in the page it already has open.
import { openPiece } from '../lib/browser.mjs';
import { rule } from '../lib/report.mjs';
import { round } from './_lib.mjs';

export const TRAVEL_PX = 4;
export const FPS = 30;

// In the page: seek every frame and track each visible text element's box; the largest move between
// two consecutive frames, per element.
function travel({ times }) {
  const stage = document.querySelector('.mm-stage');
  const els = [...stage.querySelectorAll('*')].filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
  const visible = (el) => { const cs = getComputedStyle(el); if (cs.visibility !== 'visible' || cs.display === 'none') return false; let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o >= 0.01; };
  const name = (el) => { const sc = el.closest('[data-scene]'); return el.dataset.slot && sc ? `[data-scene="${sc.dataset.scene}"] [data-slot="${el.dataset.slot}"]` : el.tagName.toLowerCase(); };
  let prev = null, best = { px: 0 };
  for (const t of times) {
    window.mm.seek(t);
    const now = els.map((el) => { if (!visible(el)) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    if (prev) now.forEach((p, i) => { if (p && prev[i]) { const d = Math.hypot(p[0] - prev[i][0], p[1] - prev[i][1]); if (d > best.px) best = { px: d, t, selector: name(els[i]) }; } });
    prev = now;
  }
  return best;
}

/**
 * The W-SUB row for exporting at `sub` subframes. opts: { dir } (the piece folder, opened in a fresh
 * page) or { page, schedule } (an open page), plus { fps, browser, server, format }.
 */
export async function subWarning(story, sub = 1, opts = {}) {
  if (!(sub > 1)) return rule('W-SUB', 'PASS', { measured: sub, reason: 'no sub-frame blending (--sub 1)' });
  if (story.kind === 'deck') return rule('W-SUB', 'SKIP', { measured: sub, reason: 'deck rests are stills; the walkthrough is not judged for blending' });
  const fps = opts.fps ?? FPS;
  let page = opts.page, piece = null;
  if (!page) {
    if (!opts.dir) return rule('W-SUB', 'SKIP', { measured: sub, partial: true, reason: 'text travel not measured: pass the piece folder (subWarning(story, sub, { dir }))' });
    piece = await openPiece(opts.dir, { format: opts.format, browser: opts.browser, server: opts.server });
    page = piece.page;
  }
  try {
    const duration = opts.schedule?.duration ?? (await page.evaluate(() => window.mm.duration));
    const times = Array.from({ length: Math.floor(duration * fps + 1e-6) + 1 }, (_, n) => Math.min(duration, n / fps));
    const best = await page.evaluate(travel, { times });
    const ev = { measured: round(best.px, 1), threshold: `${TRAVEL_PX} px per frame at ${fps} fps`, sub };
    if (best.px > TRAVEL_PX) return rule('W-SUB', 'WARN', { ...ev, instant: round(best.t), selector: best.selector, reason: `exporting with --sub ${sub} blends moving text into ghosts: ${best.selector} travels ${round(best.px, 1)} px in one frame; export with --sub 1` });
    return rule('W-SUB', 'PASS', ev);
  } finally {
    if (piece) await piece.close();
  }
}

export default async function (ctx) {
  if (ctx.sub == null) return rule('W-SUB', 'SKIP', { reason: 'export-time rule: runs when mm export (or mm check --sub N) names the subframe count' });
  return subWarning(ctx.story, ctx.sub, { page: ctx.page, schedule: ctx.schedule });
}
