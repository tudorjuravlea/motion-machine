// G-TIME (SPEC §2.3, §2.4, AXIOM 1): every frame is a function of t. Static half: the forbidden
// names in the piece's JS, inline scripts and the referenced patterns' pattern.js (comments
// ignored), and autoplaying media in markup. Runtime half: (1) the recorder openPiece installs for
// the gate (lib/browser.mjs TIME_TRAP) saw no call to a timer, a frame callback, Date,
// performance.now, Math.random or crypto.getRandomValues/randomUUID from any file the page served,
// however it was reached, from page load through every seek the gate made; (2) no element's
// computed transition-duration or animation-name is live at the three schedule instants.
// The static half also refuses a task scheduler with a delay
// (`postTask`), threads (`Worker`, `SharedWorker`, `serviceWorker`), new realms (`<iframe>`, `<frame>`)
// and SVG SMIL animation (`<animate>`, `<set>`, `<animateTransform>`, `<animateMotion>`) in piece and
// pattern code, shipped SVGs and SVG data: URIs, per-load entropy names (`timeOrigin`, `timeStamp`,
// `createObjectURL`), and any transition or animation whose timing comes through a custom property;
// the recorder refuses and records realms and threads, and the page must hold no child realm.
import { rule } from '../lib/report.mjs';
import { autoplayOffenders, cssTimeOffenders, htmlParts, markupOffenders, round, sources, svgDataUris, threeInstants, timeOffenders } from './_lib.mjs';

export const scope = 'format';

function liveTimers() {
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const dur = cs.transitionDuration.split(',').map((x) => parseFloat(x) || 0);
    const anim = cs.animationName.split(',').map((x) => x.trim()).filter((x) => x && x !== 'none');
    if (dur.some((d) => d > 0) || anim.length) {
      const sc = el.closest('[data-scene]');
      const sel = el.dataset.slot && sc ? `[data-scene="${sc.dataset.scene}"] [data-slot="${el.dataset.slot}"]`
        : `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
      out.push({ selector: sel, transitionDuration: cs.transitionDuration, animationName: cs.animationName });
    }
  }
  return out;
}

/**
 * The recorder's calls made by code the page served (not by the gate's own evaluate calls). A record
 * marked `always` (a refused realm or thread, an element removed on insertion) counts with or without
 * a served frame on its stack.
 */
export function servedCalls(log, origin) {
  const out = [];
  for (const { name, stack, always } of log) {
    const frames = stack.split('\n').slice(1).filter((l) => l.includes(origin));
    const caller = frames.find((l) => !/TIME_TRAP|__mmTimeLog/.test(l));
    if (!caller) { if (always) out.push({ name, file: null, line: null }); continue; }
    const m = /(https?:\/\/[^\s)]+):(\d+):(\d+)/.exec(caller);
    out.push({ name, file: m ? new URL(m[1]).pathname.replace(/^\//, '') : caller.trim(), line: m ? Number(m[2]) : null });
  }
  return out;
}

export default async function (ctx) {
  const hits = [];
  for (const s of sources(ctx)) {
    if (s.ext === '.js' || s.ext === '.mjs') for (const h of [...timeOffenders(s.text), ...markupOffenders(s.text)]) hits.push({ file: s.rel, ...h });
    if (s.ext === '.svg') for (const h of markupOffenders(s.text)) hits.push({ file: s.rel, ...h });
    if (s.ext === '.css') for (const h of cssTimeOffenders(s.text)) hits.push({ file: s.rel, ...h });
    if (s.ext === '.css' || s.ext === '.html') {
      for (const d of svgDataUris(s.text)) for (const h of markupOffenders(d.svg)) hits.push({ file: s.rel, line: s.text.slice(0, d.offset).split('\n').length, match: h.match });
    }
    if (s.ext === '.html') {
      for (const h of [...autoplayOffenders(s.text), ...markupOffenders(s.text)]) hits.push({ file: s.rel, ...h });
      const parts = htmlParts(s.text);
      for (const sc of parts.scripts) for (const h of timeOffenders(sc.text)) hits.push({ file: s.rel, line: sc.line + h.line - 1, match: h.match });
      for (const p of [...parts.styles, ...parts.attrs]) for (const h of cssTimeOffenders(p.text)) hits.push({ file: s.rel, line: p.line + h.line - 1, match: h.match });
    }
  }
  if (hits.length) {
    const h = hits[0];
    return rule('G-TIME', 'FAIL', { file: h.file, line: h.line, measured: h.match, reason: `forbidden in piece and pattern code: ${[...new Set(hits.map((x) => x.match))].join(', ')}`, hits });
  }
  const at = threeInstants(ctx.schedule);
  for (const [name, t] of Object.entries(at)) {
    await ctx.mm.seek(t);
    const live = await ctx.page.evaluate(liveTimers);
    if (live.length) {
      return rule('G-TIME', 'FAIL', { instant: round(t), selector: live[0].selector, measured: `transition-duration ${live[0].transitionDuration}, animation-name ${live[0].animationName}`,
        reason: `a CSS transition or animation is live in render mode at the ${name} instant`, live: live.slice(0, 10) });
    }
  }
  const { log, frames } = await ctx.page.evaluate(() => ({ log: window.__mmTimeLog ?? null, frames: window.length }));
  if (!log) return rule('G-TIME', 'SKIP', { partial: true, reason: 'partial: the runtime recorder was not installed (open the piece with openPiece({ trap: true }))' });
  const calls = servedCalls(log, new URL(ctx.server.url).origin);
  if (frames > 0) calls.push({ name: `${frames} child realm${frames === 1 ? '' : 's'} (window.length)`, file: null, line: null });
  if (calls.length) {
    const c = calls[0];
    return rule('G-TIME', 'FAIL', { file: c.file, line: c.line, measured: c.name, reason: `the page called ${[...new Set(calls.map((x) => x.name))].join(', ')} at run time${c.file ? ` (${c.file}:${c.line})` : ''}`, calls: calls.slice(0, 10) });
  }
  return rule('G-TIME', 'PASS', { instants: Object.values(at).map((t) => round(t)), recorded: log.length, fromServedFiles: 0 });
}
