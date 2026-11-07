// The cut audit page: one self-contained HTML string from plain data, no browser and no file access.
// Kept time is drawn in the canvas colour and cut time in the accent, on one timeline over the source,
// with the edit beside it; clicking a cut plays the removed span from the source with a second of
// context either side, and moves the edit to the join. The 20 largest removals are listed with their
// reasons. Every string from the words or cuts files goes through `esc`/`attr`, the data travels as
// JSON with `<` escaped, a colour through `hexOf`; the page loads nothing from the network.
import { attr, esc, hexOf } from './brand-sheet-page.mjs';
import { mergeSpans } from './footage.mjs';

/** Seconds of the source heard either side of a removed span. */
export const CONTEXT_S = 1;
/** How many removals the page lists. */
export const LARGEST = 20;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
const ROLES = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];
const NEUTRAL = { canvas: '#F6F6F4', ink: '#1D1D1B', muted: '#6B6B66', surface: '#FFFFFF', line: '#D6D6D0', accent: '#D9480F', accentInk: '#FFFFFF' };

/**
 * The page's model from a cuts document ({ cuts: [...], duration }). `approvedFile` says the document is the
 * director's: only `approved: true` cuts are removed, the rest are shown as declined. A proposed document
 * shows every cut as removed ("if all were approved").
 */
export function auditModel(doc, { duration = null, approvedFile = false } = {}) {
  const list = Array.isArray(doc) ? doc : doc.cuts ?? [];
  const total = duration ?? doc.duration ?? Math.max(0, ...list.map((c) => c.end));
  const cuts = list.map((c, i) => ({
    id: String(c.id ?? `c${i + 1}`), kind: String(c.kind ?? 'cut'), start: c.start, end: c.end, words: (c.words ?? []).map(String),
    reason: String(c.reason ?? ''), confidence: c.confidence ?? null, note: c.note ? String(c.note) : '',
    state: approvedFile ? (c.approved === true ? 'cut' : 'declined') : 'proposed',
  })).sort((a, b) => a.start - b.start);
  const active = cuts.filter((c) => c.state !== 'declined');
  const merged = mergeSpans(active.map((c) => ({ s: c.start, e: c.end })));
  const removed = merged.reduce((n, m) => n + (m.e - m.s), 0);
  // each cut's join on the edit's clock: its start less every merged span removed before it
  for (const c of cuts) c.join = r3(c.start - merged.filter((m) => m.e <= c.start + 1e-9).reduce((n, m) => n + (m.e - m.s), 0));
  const largest = [...active].sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, LARGEST).map((c) => c.id);
  return { duration: r3(total), edit: r3(total - removed), removed: r3(removed), cuts, largest, approvedFile };
}

const LS = new RegExp(String.fromCharCode(0x2028), 'g'), PS = new RegExp(String.fromCharCode(0x2029), 'g');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(LS, '\\u2028').replace(PS, '\\u2029');

const CSS = (c) => `
:root { --canvas:${c.canvas}; --ink:${c.ink}; --muted:${c.muted}; --surface:${c.surface}; --line:${c.line}; --accent:${c.accent}; --accent-ink:${c.accentInk}; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 24px 64px; background: var(--surface); color: var(--ink); font: 400 15px/1.5 system-ui, sans-serif; }
main { max-width: 1100px; margin: 0 auto; }
h1 { margin: 0 0 4px; font-size: 28px; line-height: 1.2; }
h2 { margin: 32px 0 12px; font-size: 18px; }
.sub, .hint { color: var(--muted); }
.row { display: flex; align-items: center; gap: 12px; margin: 10px 0; }
.row .label { flex: 0 0 56px; color: var(--muted); font-size: 13px; }
.bar { position: relative; flex: 1; height: 36px; background: var(--canvas); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.bar.edit { flex: none; }
.cut { position: absolute; top: 0; bottom: 0; min-width: 3px; padding: 0; border: 0; background: var(--accent); cursor: pointer; }
.cut.declined { background: transparent; outline: 2px dashed var(--accent); outline-offset: -2px; }
.cut:focus-visible, .cut.on { outline: 3px solid var(--ink); outline-offset: -3px; z-index: 1; }
.join { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); }
.players { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; }
.players figure { margin: 0; }
.players video { width: 100%; max-height: 360px; background: var(--ink); border-radius: 6px; }
.players .none { display: grid; place-items: center; height: 120px; border: 1px dashed var(--line); border-radius: 6px; color: var(--muted); padding: 8px; text-align: center; }
figcaption { color: var(--muted); font-size: 13px; margin-top: 4px; }
#detail { min-height: 4.5em; margin-top: 12px; padding: 12px 16px; border: 1px solid var(--line); border-radius: 6px; background: var(--canvas); }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-weight: 600; }
tr.pick { cursor: pointer; }
tr.pick:hover td, tr.pick.on td { background: var(--canvas); }
.chip { display: inline-block; padding: 0 8px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-size: 12px; }
.num { font-variant-numeric: tabular-nums; white-space: nowrap; }
@media (max-width: 700px) { .players { grid-template-columns: 1fr; } .row .label { flex-basis: 44px; } }
`;

const SCRIPT = `
(() => {
  const model = JSON.parse(document.getElementById('audit-data').textContent);
  const byId = new Map(model.cuts.map((c) => [c.id, c]));
  const src = document.getElementById('source-video'), edit = document.getElementById('edit-video');
  const root = document.documentElement, detail = document.getElementById('detail');
  let stopAt = null;
  const seek = (v, t) => { if (!v) return; try { v.currentTime = Math.max(0, t); } catch (e) { /* metadata not loaded yet */ } };
  if (src) src.addEventListener('timeupdate', () => { if (stopAt != null && src.currentTime >= stopAt) { src.pause(); stopAt = null; } });
  function pick(id, play) {
    const c = byId.get(id); if (!c) return;
    document.querySelectorAll('.on').forEach((e) => e.classList.remove('on'));
    document.querySelectorAll('[data-id="' + id + '"]').forEach((e) => e.classList.add('on'));
    const a = Math.max(0, c.start - model.context), b = Math.min(model.duration, c.end + model.context);
    root.dataset.playing = a.toFixed(2) + '-' + b.toFixed(2);
    detail.textContent = '';
    const head = document.createElement('strong'); head.textContent = c.kind + '  ' + c.start.toFixed(2) + '-' + c.end.toFixed(2) + ' s  (' + (c.end - c.start).toFixed(2) + ' s)';
    const why = document.createElement('div'); why.textContent = c.reason;
    const said = document.createElement('div'); said.className = 'hint'; said.textContent = c.words.length ? 'removed: ' + c.words.join(' ') : 'no words in it';
    detail.append(head, why, said);
    if (c.note) { const n = document.createElement('div'); n.textContent = 'note: ' + c.note; detail.append(n); }
    if (c.state === 'declined') { const n = document.createElement('div'); n.className = 'hint'; n.textContent = 'declined: it stays in the edit'; detail.append(n); }
    seek(edit, c.join - model.context);
    if (src && play) { seek(src, a); stopAt = b; src.play().catch(() => {}); }
  }
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-id]'); if (t) pick(t.dataset.id, true); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && src) src.pause(); });
})();
`;

/** The audit page for `model`. `opts`: { source, edit } media paths relative to the page, { colors } palette roles. */
export function auditPage(model, { source = null, edit = null, colors = {}, title = 'Cut audit' } = {}) {
  const c = Object.fromEntries(ROLES.map((r) => [r, hexOf(colors[r] ?? NEUTRAL[r])]));
  const pct = (t) => `${(100 * t) / (model.duration || 1)}%`;
  const editShare = model.duration ? model.edit / model.duration : 1;
  const byId = new Map(model.cuts.map((x) => [x.id, x]));
  const spans = model.cuts.map((x) => `<button class="cut ${x.state === 'declined' ? 'declined' : ''}" data-id="${attr(x.id)}" style="left:${pct(x.start)};width:${pct(x.end - x.start)}" title="${attr(`${x.kind} ${clock(x.start)}`)}" aria-label="${attr(`${x.kind} at ${clock(x.start)}, ${r2(x.end - x.start)} s`)}"></button>`).join('');
  const joins = model.cuts.filter((x) => x.state !== 'declined').map((x) => `<span class="join" style="left:${(100 * x.join) / (model.edit || 1)}%"></span>`).join('');
  const rows = model.largest.map((id) => {
    const x = byId.get(id);
    return `<tr class="pick" data-id="${attr(id)}"><td><span class="chip">${esc(x.kind)}</span></td><td class="num">${esc(clock(x.start))}</td><td class="num">${r2(x.end - x.start)} s</td><td>${esc(x.reason)}${x.words.length ? `<div class="hint">${esc(x.words.join(' '))}</div>` : ''}</td></tr>`;
  }).join('');
  const player = (id, label, path, what) => (path
    ? `<figure><video id="${id}" src="${attr(path)}" controls preload="metadata"></video><figcaption>${esc(label)}</figcaption></figure>`
    : `<figure><div class="none">no ${esc(what)} given: pass ${esc(what === 'source' ? '--source <video>' : '--edit <edit.mp4>')} to play it here</div><figcaption>${esc(label)}</figcaption></figure>`);
  const state = model.approvedFile ? 'the approved cuts' : 'every proposed cut, as if all were approved';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS(c)}</style></head>
<body><main>
<h1>${esc(title)}</h1>
<p class="sub">${esc(clock(model.duration))} of source, ${esc(clock(model.edit))} kept, ${esc(clock(model.removed))} removed in ${model.cuts.filter((x) => x.state !== 'declined').length} cuts (${esc(state)}).</p>
<h2>Timeline</h2>
<div class="row"><span class="label">source</span><div class="bar" role="group" aria-label="source timeline">${spans}</div></div>
<div class="row"><span class="label">edit</span><div class="bar edit" style="width:calc((100% - 68px) * ${editShare})" role="img" aria-label="edit timeline, joins marked">${joins}</div></div>
<p class="hint">Click a cut to play what was removed, with ${CONTEXT_S} s either side.${model.approvedFile ? ' Dashed outlines are declined cuts: they stay in.' : ''}</p>
<div class="players">${player('source-video', 'source', source, 'source')}${player('edit-video', 'edit (moves to the join)', edit, 'edit')}</div>
<div id="detail" aria-live="polite"><span class="hint">Pick a cut.</span></div>
<h2>The ${model.largest.length} largest removals</h2>
<table><thead><tr><th>kind</th><th>at</th><th>length</th><th>why</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="hint">nothing is removed</td></tr>'}</tbody></table>
</main>
<script type="application/json" id="audit-data">${json({ ...model, context: CONTEXT_S })}</script>
<script>${SCRIPT}</script>
</body></html>
`;
}
