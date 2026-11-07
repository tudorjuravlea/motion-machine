// Export: a panel under the Export button. Pick the formats: every film format is listed and none is
// ticked when the panel opens (only the sound mix is pre-checked), so a run renders exactly what was just ticked. A format ticked
// that the story does not ship yet joins it (`addFormats`, one undoable edit)
// just before the run starts, since the gate checks and export renders the story's formats; and, when `mm sound`
// has something to mix (the server says so, by mm sound's own predicate), whether to mix it;
// Export runs the gate, then renders an MP4 per format, through POST /api/export, and follows its
// `export` events on the server's stream. A failing gate lists its rules, each with its format (a row
// switches to that format and seeks), and offers to export anyway, stamped UNCHECKED; a
// finished export shows each MP4 playing inline, with its path, and what the gate measured: with
// sound the gate runs again on the mix. Not modal, but while a run is in flight edits are
// paused (`onBusy`): the story the gate checked is the story that is rendered. The page
// matches the server's last export on every (re)connect and on opening.
import { cancelExport, getExport, postExport } from './api.js';
import { h } from './dom.js';
import { FORMAT_ORDER, formatInfo, formatShort, frameGlyph } from './formats.js';

const FINAL = new Set(['done', 'failed', 'cancelled']);
const STEPS = [['check', 'Check the gate'], ['export', 'Render'], ['sound', 'Mix the sound'], ['recheck', 'Check the mix']];
const STATUS = { check: 'Checking the gate on every format…', export: 'Rendering…', sound: 'Mixing the sound…', recheck: 'Checking the gate again, on the mix…' };
const CANCELLED = {
  check: 'Export cancelled during the gate. Nothing was written: out/ is as it was.',
  export: 'Export cancelled during the render. No MP4 was replaced; out/check.json holds the gate\'s new report.',
  sound: 'Export cancelled during the mix. These MP4s were rendered by this run; some may not carry the mix.',
  recheck: 'Export cancelled while the gate ran again on the mix: these MP4s are rendered and mixed, but the mix was not checked.',
};
const RESTARTED = 'The studio server restarted during the export, which stopped it. out/ keeps the files it had; export again.';
const mb = (n) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export function createExport({ panel, button, getStory, getMixable, onGo, toast, onBusy, getReadOnly = () => null, addFormats = async () => false }) {
  let run = null;               // { id, formats, sound, force, state, line, ev } of the run this page follows
  const chosen = new Set();     // the formats ticked since the panel opened; emptied on every opening
  let dismissed = null;         // the final event the owner closed (Back, Export again): not shown again
  let busy = false;

  const body = h('div', 'ex-body');
  const head = h('div', 'ex-head');
  const closeBtn = h('button', 'icon-btn', { type: 'button', 'aria-label': 'Close (Esc)', title: 'Close (Esc)' }, '×');
  head.append(h('h2', 'ex-title', { id: 'export-h' }, 'Export'), closeBtn);
  panel.replaceChildren(head, body);
  closeBtn.addEventListener('click', () => close());

  /** Redraws, and tells the page whether a run is in flight (edits pause while one is). */
  function changed() {
    const on = Boolean(run && !FINAL.has(run.state));
    if (on !== busy) { busy = on; onBusy?.(on); }
    render();
  }

  function open() {
    chosen.clear();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    render();
    (panel.querySelector('[data-export-run], [data-export-cancel], video, button:not(.icon-btn)') ?? closeBtn).focus({ preventScroll: true });
    reconcile();
  }
  function close() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    for (const v of panel.querySelectorAll('video')) v.pause();
    button.focus({ preventScroll: true });
  }
  const toggle = () => (panel.hidden ? open() : close());

  /** Matches the page to the server's last export: follows a run started elsewhere, shows a final one not
   *  yet seen, and drops a run the server does not know (it restarted). */
  async function reconcile() {
    let r;
    try { r = await getExport(); } catch { return; }
    if (r.status !== 200) return;
    const last = r.body;
    if (run && !FINAL.has(run.state)) {
      if (!run.id) return;   // this page's POST is not answered yet
      if (!last || last.id !== run.id) { run = { ...run, state: 'failed', ev: { state: 'failed', reason: RESTARTED } }; return changed(); }
      return onEvent(last, { quiet: true });
    }
    if (!run && last && JSON.stringify(last) !== dismissed) onEvent(last, { quiet: true });
  }

  // ---- the form ----------------------------------------------------------------------------
  function form() {
    const story = getStory(), shipped = story.formats, deck = story.kind === 'deck';
    const formats = deck ? shipped : FORMAT_ORDER, ro = getReadOnly();
    const wanted = () => formats.filter((f) => chosen.has(f));
    const list = h('fieldset', 'ex-formats');
    list.append(h('legend', 'ex-label', {}, 'Formats'));
    for (const f of formats) {
      const info = formatInfo(f);
      const isNew = !shipped.includes(f), locked = Boolean(isNew && ro);   // a read-only story cannot gain a format
      const row = h('label', `ex-format${locked ? ' is-locked' : ''}`, { title: locked ? `Not in this piece, and it cannot be added: ${ro}` : null });
      if (locked) chosen.delete(f);
      const box = h('input', null, { type: 'checkbox', name: 'format', value: f, checked: chosen.has(f), disabled: locked });
      box.addEventListener('change', () => {
        if (box.checked) chosen.add(f); else chosen.delete(f);
        go.disabled = !wanted().length;
        go.title = go.disabled ? 'Tick at least one format' : '';
      });
      const text = h('span', 'ex-format-text');
      text.append(h('span', 'ex-format-name', {}, `${info.name} `), h('span', 'ex-dim', {}, formatShort(f)), h('span', 'ex-where', {}, info.where));
      row.append(box, frameGlyph(f), text, h('span', 'ex-size', {}, info.size));
      list.append(row);
    }
    const sound = getMixable() && !deck ? h('input', null, { type: 'checkbox', name: 'sound', checked: true }) : null;
    const extras = [];
    if (sound) {
      const l = h('label', 'ex-option');
      l.append(sound, h('span', null, {}, 'Mix the sound (cues and track) into the MP4s, then check the mix'));
      extras.push(l);
    }
    const note = h('p', 'ex-note', {}, deck
      ? 'Export runs the gate, then writes the deck folder, handout.pdf and a walkthrough MP4 to out/.'
      : `Export runs the gate (mm check), then renders one MP4 per format into out/${sound ? ', then mixes the sound and runs the gate again on the mix' : ''}. A failing gate stops it before rendering. Edits pause while it runs. A format the piece does not ship yet is added to the piece when you export it.`);
    const go = h('button', 'btn btn-primary', { type: 'button', 'data-export-run': true, disabled: !wanted().length || null, title: wanted().length ? null : 'Tick at least one format' }, 'Export');
    go.addEventListener('click', () => start({ formats: wanted(), sound: Boolean(sound?.checked), force: false }));
    const actions = h('div', 'ex-actions');
    actions.append(go);
    return [list, ...extras, note, actions];
  }

  // ---- a run ---------------------------------------------------------------------------------
  async function start(opts) {
    // the gate checks, and export renders, the story's formats: a new one joins the story first
    const shipped = getStory().formats, more = opts.formats.filter((f) => !shipped.includes(f));
    if (more.length) {
      const list = FORMAT_ORDER.filter((f) => shipped.includes(f) || more.includes(f));
      if (!(await addFormats(list))) return;   // refused or not saved: the page has said why
    }
    run = { ...opts, state: 'check', line: '', ev: null };
    changed();
    let r;
    try { r = await postExport(opts); } catch { r = { status: 0, body: { reason: 'the studio server is not answering' } }; }
    if (r.status === 202) { if (run && !run.id) run.id = r.body?.id; return; }
    if (r.status === 409 && r.body?.error === 'busy') { toast(`Not started: ${r.body.reason ?? 'an export of this piece is running'}.`, 'error'); }
    run = { ...run, state: 'failed', ev: { state: 'failed', reason: r.body?.reason ?? `status ${r.status}` } };
    changed();
  }

  /** An `export` event from the server's stream (or its last one, on reconcile). */
  function onEvent(ev, { quiet = false } = {}) {
    const same = run && (!run.id || run.id === ev.id) && run.state === ev.state;
    const progressOnly = same && !FINAL.has(ev.state) && ev.line;
    run = { id: ev.id, formats: ev.formats, sound: Boolean(ev.sound), force: Boolean(ev.force), state: ev.state,
      line: ev.line ?? (same ? run.line : ''), ev: FINAL.has(ev.state) ? ev : null };   // a new step starts with no line
    if (progressOnly && panel.querySelector('.ex-line')) { panel.querySelector('.ex-line').textContent = ev.line; return; }
    changed();
    if (!quiet && FINAL.has(ev.state) && panel.hidden) toast(ev.state === 'done' ? 'Export finished: open Export to watch the MP4s.' : ev.state === 'failed' ? 'Export stopped: open Export to see why.' : 'Export cancelled.', ev.state === 'failed' ? 'error' : 'info');
  }

  function progress() {
    const order = STEPS.filter(([k]) => run.sound || (k !== 'sound' && k !== 'recheck')).map(([k]) => k);
    const at = order.indexOf(run.state);
    const ol = h('ol', 'ex-steps');
    for (const k of order) {
      const label = STEPS.find(([x]) => x === k)[1];
      const i = order.indexOf(k), st = at < 0 ? 'done' : i < at ? 'done' : i === at ? 'running' : 'todo';
      const li = h('li', `ex-step ${st}`, { 'aria-current': st === 'running' ? 'step' : null });
      li.append(h('span', 'ex-step-mark', { 'aria-hidden': 'true' }), h('span', null, {}, k === 'export' ? `${label} ${run.formats.map(formatShort).join(', ')}` : label));
      ol.append(li);
    }
    const line = h('p', 'ex-line', { 'aria-live': 'off' }, run.line || 'Starting…');
    const cancel = h('button', 'btn', { type: 'button', 'data-export-cancel': true }, 'Cancel');
    cancel.addEventListener('click', async () => {
      cancel.disabled = true; cancel.textContent = 'Cancelling…';
      try {
        const r = await cancelExport();
        if (r.status === 409) reconcile();   // nothing runs there (a restart): the page catches up
      } catch { toast('The studio server is not answering.', 'error'); cancel.disabled = false; cancel.textContent = 'Cancel'; }
    });
    const actions = h('div', 'ex-actions');
    actions.append(cancel);
    return [h('p', 'ex-status', { role: 'status' }, STATUS[run.state] ?? 'Working…'), ol, line, actions];
  }

  /** The failing rows: each names its format, and switches to it before seeking. */
  function ruleRows(rules) {
    const rows = h('div', 'ex-rules');
    for (const r of rules) {
      const evd = r.evidence ?? {};
      const b = h('button', 'gate-row fail', { type: 'button', 'data-rule': r.id, 'data-format': evd.format ?? null, title: evd.format ? `Show it on the timeline, in ${formatShort(evd.format)}` : 'Show it on the timeline' });
      b.append(h('span', 'dot fail', { 'aria-hidden': 'true' }), h('span', 'rule-id', {}, evd.format ? `${r.id} · ${formatShort(evd.format)}` : r.id), h('span', 'rule-why', {}, evd.reason ?? 'fails'), h('span', 'rule-at', {}, typeof evd.instant === 'number' ? `${evd.instant} s` : ''));
      b.addEventListener('click', () => onGo({ instant: evd.instant, selector: evd.selector ?? null, id: r.id, format: evd.format ?? null }));
      rows.append(b);
    }
    return rows;
  }

  function failedView(ev) {
    if (ev.failed?.length) {
      const out = [h('p', 'ex-status fail', { role: 'alert' }, `The gate failed on ${plural(ev.failed.length, 'rule')}; nothing was rendered.`)];
      out.push(ruleRows(ev.rules ?? ev.failed.map((id) => ({ id, status: 'FAIL' }))));
      const force = h('button', 'btn', { type: 'button', 'data-export-force': true }, 'Export anyway (stamped UNCHECKED)');
      force.addEventListener('click', () => start({ formats: run.formats, sound: run.sound, force: true }));
      const actions = againActions('Back');
      actions.append(force);
      out.push(actions);
      return out;
    }
    if (ev.soundFailed) {
      return [h('p', 'ex-status fail', { role: 'alert' }, 'The sound mix failed, so the export stopped there.'), h('p', 'ex-line', {}, ev.reason ?? 'no reason given'),
        h('p', 'ex-warn', {}, `The ${ev.files?.length === 1 ? 'MP4 below was' : 'MP4s below were'} rendered by this run, without the mix.`), fileList(ev), againActions('Try again')];
    }
    return [h('p', 'ex-status fail', { role: 'alert' }, 'The export stopped.'), h('p', 'ex-line', {}, ev.reason ?? 'no reason given'), againActions('Try again')];
  }

  function againActions(label) {
    const again = h('button', 'btn', { type: 'button' }, label);
    again.addEventListener('click', () => { dismissed = run?.ev ? JSON.stringify(run.ev) : dismissed; run = null; changed(); panel.querySelector('[data-export-run]')?.focus(); });
    const actions = h('div', 'ex-actions');
    actions.append(again);
    return actions;
  }

  function fileList(ev) {
    const list = h('div', 'ex-files');
    for (const f of ev.files ?? []) {
      const item = h('figure', 'ex-file');
      const v = h('video', null, { controls: true, preload: 'metadata', playsinline: true, src: f.url, poster: f === ev.files[0] && ev.poster ? ev.poster : null });
      v.style.aspectRatio = f.format.replace('x', ' / ');
      const cap = h('figcaption', 'ex-cap');
      const path = h('code', 'ex-path', { title: f.path }, f.path);
      const copy = h('button', 'btn btn-small', { type: 'button', 'data-copy-path': true }, 'Copy path');
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(f.path); toast(`Copied ${f.path}`); } catch { toast('The clipboard is not available here.', 'error'); }
      });
      const meta = h('span', 'ex-meta', {}, `${formatShort(f.format)} · ${formatInfo(f.format).size} · ${mb(f.bytes)}`);
      cap.append(meta, path, copy);
      item.append(v, cap);
      list.append(item);
    }
    return list;
  }

  /** What the gate measured, said as it is: "gate passed" only covers what it checked. */
  function doneView(ev) {
    const n = plural(ev.files.length, 'file');
    const mixFailed = ev.sound && ev.mixChecked && ev.failed?.length;
    const status = ev.unchecked ? `Exported ${n}, stamped UNCHECKED.`
      : ev.stale ? `Exported ${n}; story.json changed meanwhile.`
        : !ev.sound ? `Exported ${n}, gate passed.`
          : mixFailed ? `Exported ${n} with sound, but the gate failed on the mix.`
            : ev.mixChecked ? `Exported ${n} with sound; the gate passed, on the mix too.`
              : `Exported ${n} with sound; the gate passed before the mix and could not run on it.`;
    const out = [h('p', `ex-status ${mixFailed ? 'fail' : ev.unchecked || ev.stale ? '' : 'pass'}`, { role: 'status' }, status)];
    if (ev.unchecked) out.push(h('p', 'ex-warn', {}, 'Stamped UNCHECKED: the gate failed, so the MP4s carry that in their metadata.'));
    if (ev.stale) out.push(h('p', 'ex-warn', {}, 'story.json was written outside the studio during the export, so these files may not match it. Export again.'));
    if (mixFailed) out.push(ruleRows(ev.rules ?? []));
    if (ev.sound && !ev.mixChecked && ev.recheckReason) out.push(h('p', 'ex-warn', {}, `The gate could not run on the mix: ${ev.recheckReason}`));
    out.push(fileList(ev), againActions('Export again'));
    return out;
  }

  function render() {
    if (panel.hidden) return;
    const ev = run?.ev;
    const parts = !run ? form()
      : !FINAL.has(run.state) ? progress()
        : ev?.state === 'done' ? doneView(ev)
          : ev?.state === 'cancelled' ? [h('p', 'ex-status', { role: 'status' }, CANCELLED[ev.stage] ?? 'Export cancelled.'), ...(ev.files?.length ? [fileList(ev)] : []), againActions('Back')]
            : failedView(ev ?? { reason: 'unknown' });
    body.replaceChildren(...parts);
  }

  button.addEventListener('click', toggle);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } });
  return { open, close, toggle, onEvent, reconcile, refresh: () => { if (!run) render(); }, get isOpen() { return !panel.hidden; }, get running() { return busy; } };
}
