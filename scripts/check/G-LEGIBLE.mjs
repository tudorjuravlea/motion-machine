// G-LEGIBLE (SPEC §7, §12, AXIOM 10): at every rest each visible text element's rendered
// size (computed font-size times the scale its transforms give it on screen) is at least the
// format's body floor, or the micro floor when it carries data-micro, which may not carry a fact or the
// call to action. Read at rests and at the last instant of a film scene with no rest (text still arriving
// there is not measured for size). ::before/::after text counts.
// Measured at full scale; the phone sheet is for eyes, not for this rule.
//
// ::marker, ::first-letter and ::first-line are measured at their own
// size (the probe), and text the walk cannot read fails outright. Shadow roots are forbidden rather
// than pierced: a shadow tree hides its text from the probe, the kit's report and every DOM rule at
// once, and nothing in the kit or the patterns needs one, so the static half refuses `attachShadow`
// and declarative shadow roots, the recorder refuses `attachShadow`, and CDP (`pierce: true`) must
// find no open or closed shadow root in the stage. Canvas text (`fillText`, `strokeText`) is refused
// in piece code and in a pattern unless its module declares `canvasText: true`; the recorder sees a
// call reached by a computed name.
import { rule } from '../lib/report.mjs';
import { dirname, join, relative, sep } from 'node:path';
import { EPS, ROOT, auditInstants, cdpOf, hiddenTextOffenders, htmlParts, round, settledTexts, sources, stripJs, texts } from './_lib.mjs';
import { servedCalls } from './G-TIME.mjs';

export const scope = 'format';

const canvasTextAllowed = (ctx, ref) => ref != null && ctx.patterns?.[ref]?.canvasText === true;

/** Open and closed shadow roots under the stage (user-agent roots, as on <video>, are not counted). */
async function shadowRoots(ctx) {
  const cdp = await cdpOf(ctx);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const found = [];
  const walk = (n, inStage) => {
    const here = inStage || (n.attributes ?? []).some((v, i, a) => i % 2 === 0 && v === 'class' && /(^|\s)mm-stage(\s|$)/.test(a[i + 1]));
    for (const r of n.shadowRoots ?? []) { if (here && r.shadowRootType !== 'user-agent') found.push({ host: n.localName, type: r.shadowRootType }); walk(r, here); }
    for (const c of n.children ?? []) walk(c, here);
    if (n.contentDocument) walk(n.contentDocument, here);
  };
  walk(root, false);
  return found;
}

export default async function (ctx) {
  const { body, micro } = ctx.floors;
  const hidden = [];
  for (const s of sources(ctx)) {
    const scan = (text, line0 = 1) => {
      for (const h of hiddenTextOffenders(text)) {
        if (/^(fill|stroke)Text$/i.test(h.match) && s.owner === 'pattern' && canvasTextAllowed(ctx, s.ref)) continue;
        hidden.push({ file: s.rel, line: line0 + h.line - 1, measured: h.match });
      }
    };
    if (s.ext === '.js' || s.ext === '.mjs') scan(stripJs(s.text));
    if (s.ext === '.html') { scan(s.text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, ' '))); for (const sc of htmlParts(s.text).scripts) scan(stripJs(sc.text), sc.line); }
  }
  if (hidden.length) {
    const h = hidden[0];
    return rule('G-LEGIBLE', 'FAIL', { ...h, reason: `${h.measured} draws text the gate cannot measure (a shadow root or a canvas); text must be DOM text in the stage`, all: hidden.slice(0, 20) });
  }
  const small = [], carrying = [];
  const norm = (x) => String(x ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const shown = [['the call to action', ctx.story.cta?.text], ['the call to action', ctx.story.cta?.url], ...(ctx.story.facts ?? []).map((f) => [`fact ${f.id}`, f.text])]
    .map(([what, text]) => [what, norm(text)]).filter(([, text]) => text.length >= 3);
  for (const t of auditInstants(ctx.schedule)) {
    const s = await ctx.sample(t);
    for (const el of texts(s)) {   // data-micro lowers the floor, so it may not carry what the piece is for
      if (!el.micro) continue;
      const fact = el.microItem ? ctx.schedule.items.find((it) => it.selector === el.item)?.beat?.fact : null;
      const what = fact ? `fact ${fact}` : shown.find(([, text]) => norm(el.text).includes(text))?.[0];
      if (what) carrying.push({ instant: round(t), selector: el.selector, measured: `data-micro text carries ${what}`, text: el.text.slice(0, 80) });
    }
    for (const el of settledTexts(s)) {
      const floor = el.micro ? micro : body;
      const px = el.renderedPx ?? el.fontPx;
      if (px < floor - EPS) small.push({ instant: round(t), selector: el.selector, measured: round(px, 2), threshold: floor, micro: el.micro, computed: round(el.fontPx, 2), scale: round(el.scale ?? 1, 4) });
    }
  }
  const log = await ctx.page.evaluate(() => window.__mmTextLog ?? null);
  const origin = new URL(ctx.server.url).origin;
  const calls = log ? servedCalls(log, origin).filter((c) => {
    if (!/^canvas /.test(c.name)) return true;
    const ref = c.file && /\/pattern\.js$/.test(c.file) ? relative(ctx.patternsBase, dirname(join(ROOT, c.file))).split(sep).join('/') : null;
    return !canvasTextAllowed(ctx, ref);
  }) : [];
  if (calls.length) {
    const c = calls[0];
    return rule('G-LEGIBLE', 'FAIL', { file: c.file, line: c.line, measured: c.name, reason: `the page called ${[...new Set(calls.map((x) => x.name))].join(', ')}: text the gate cannot measure${c.file ? ` (${c.file}:${c.line})` : ''}`, calls: calls.slice(0, 10) });
  }
  if (carrying.length) return rule('G-LEGIBLE', 'FAIL', { ...carrying[0], reason: `${carrying[0].measured}: data-micro text may not carry a fact or the call to action, so it cannot be held to the micro floor`, all: carrying.slice(0, 20) });
  const shadows = await shadowRoots(ctx);
  if (shadows.length) return rule('G-LEGIBLE', 'FAIL', { measured: `${shadows[0].type} shadow root on <${shadows[0].host}>`, reason: 'a shadow root in the stage hides its text from the gate', all: shadows.slice(0, 10) });
  if (small.length) {
    const w = small.reduce((a, b) => (b.measured - b.threshold < a.measured - a.threshold ? b : a));
    return rule('G-LEGIBLE', 'FAIL', { ...w, format: ctx.format, reason: `${w.measured}px${w.scale !== 1 ? ` (computed ${w.computed}px × scale ${w.scale})` : ''} is under the ${w.micro ? 'micro' : 'body'} floor of ${w.threshold}px for ${ctx.kind} ${ctx.format}`, all: small.slice(0, 20) });
  }
  if (!log) return rule('G-LEGIBLE', 'SKIP', { partial: true, threshold: body, micro, reason: 'partial: the runtime recorder was not installed, so canvas text and shadow roots reached by a computed name were not watched' });
  return rule('G-LEGIBLE', 'PASS', { threshold: body, micro, rests: auditInstants(ctx.schedule).length });
}
