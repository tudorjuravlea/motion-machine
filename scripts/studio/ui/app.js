// The studio page: a lens and a pen on story.json. Gestures
// become edit ops, the server writes them, and the page redraws from the file. The only story the page
// keeps of its own is a preview: the edit in flight under the pointer, or saves not yet answered; a save
// that fails drops it again, so the page never shows an edit the file does not hold.
//
// Undo is the journal's: a history entry names the receipts its gesture wrote, and
// undo posts each to POST /api/undo, which applies the receipt's inverse exactly and refuses once the
// file has changed since. Redo writes the entry's edits again. The history leads to `S.anchor`, the
// version this page's last write left; when the file is found at any other version, someone else wrote
// and the history is cleared. A reload seeds it from the journal's chain that ends at the file.
// One entry is one gesture: a drag, one inspector change, or one held key.
import { applyEdits, EditRefused, roundTime } from '../ops.js';
import { createHistory } from '../history.js';
import { pathForSelector } from '../model.js';
import { forFormat } from '../../../runtime/kit/schedule.js';
import { getJournal, getPiece, listen, postEdit, postUndo, putSelection } from './api.js';
import { countsOf, createEngine, eachFromSchedule } from './engine.js';
import { createStage } from './stage.js';
import { barBeat, clock, createTransport, FPS } from './transport.js';
import { createTimeline, markTime } from './timeline.js';
import { createInspector } from './inspector.js';
import { createGate } from './gate.js';
import { createKeybar } from './keybar.js';
import { atBounds, frameStep, minDuration, outBounds, rawAt } from './gestures.js';
import { FORMAT_ORDER, formatShort, formatTitle } from './formats.js';
import { createExport } from './export.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const OFFLINE = 'Not saved: the studio server is not answering.';

// the piece is a repo-relative folder path: plain segments only, so `?piece=` can never name another host
function pieceParam() {
  const wanted = (params.get('piece') || '').replace(/^\/+|\/+$/g, '');
  return /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/.test(wanted) && !wanted.split('/').some((seg) => /^\.{1,2}$/.test(seg)) ? wanted : '';
}

const S = {
  piece: pieceParam(),
  info: null, text: '', story: null, version: null, style: null,
  local: null,              // { text, story }: the file plus saves not yet answered
  format: null, readOnly: null, baseReadOnly: null, each: {}, view: null, snap: true,
  selection: null, stageKey: null, stageVersion: null, schedMatch: null,
  saving: 0, syncing: false, loading: 0, computing: 0, dropQueue: false, error: null,
  anchor: null,             // the version the undo history leads to
  heard: 0,                 // events heard from the server, counted (a sync re-reads when one came in meanwhile)
  heardVersion: null,       // the story.json version the last of them announced
  stageStale: false,        // a style or asset change the stage has not loaded yet
  offline: false, unreadable: null, invalid: null,
  cleared: null,            // why the history was last cleared: 'outside' | null
};
const history = createHistory();
const current = () => S.local ?? { text: S.text, story: S.story };
const sceneIx = (path) => Number(path.split('/')[2]);
const clipsOf = () => S.view?.model.lanes.flatMap((l) => l.clips) ?? [];
let engine, chain = Promise.resolve();

// ---- the parts -------------------------------------------------------------------------------
const toastEl = $('#toast');
let toastTimer = 0;
function toast(msg, kind = 'info') {
  toastEl.textContent = msg;
  toastEl.dataset.kind = kind;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, kind === 'error' ? 6000 : 3000);
}

const transport = createTransport({ onTime });
const stage = createStage($('#stage'), { onPick: (selector) => pick(selector) });
const timeline = createTimeline($('#timeline'), {
  context: () => ({ story: current().story, format: S.format, readOnly: S.readOnly || S.offline, snap: S.snap, playhead: transport.t, seek: (t) => transport.seek(t) }),
  onPreview: preview,
  onCommit: (edit, label) => commit([edit], { label }),
  onSelect: (path) => select(path),
  onVerdict: (m) => go({ instant: m.t, selector: m.selector }),
  onDragging: (on) => { S.dragging = on; updateKeys(); },
});
const inspector = createInspector($('#inspector'), {
  engine: { module: (r) => engine.module(r), layoutSlots: (r) => engine.layoutSlots(r) },
  onEdit: (edit, label) => commit([edit], { label }),
  onEscape: () => timeline.focusPath(S.selection?.path),
});
const gate = createGate({ pill: $('#gate-pill'), panel: $('#gate'), onGo: go, getFormat: () => S.format });
const keybar = createKeybar($('#keybar'), { onAll: () => openKeys() });
// export does not edit the story, so a read-only story exports too; while it runs, edits pause
const exporter = createExport({ panel: $('#export'), button: $('#export-btn'), getStory: () => current().story, getMixable: () => Boolean(S.info?.sound), onGo: (m) => go(m), toast, onBusy: setPaused,
  getReadOnly: () => S.readOnly,
  // a format ticked in Export that the piece does not ship joins it (one undoable edit) before the run starts
  addFormats: (list) => {
    const was = current().story.formats, added = list.filter((f) => !was.includes(f));
    // the story keeps the kit's order (ops.js), so an added format can change the first: say so
    const first = FORMAT_ORDER.filter((f) => list.includes(f))[0];
    const moved = first !== was[0] ? ` (${first} is now the first format: the poster and the opening view)` : '';
    return commit([{ op: 'story.formats', value: list }], { label: `add the ${added.join(', ')} format${added.length > 1 ? 's' : ''}${moved}` });
  },
});

const PAUSED = 'Edits are paused while the export runs: the story the gate checked is the story it renders.';
/** Pauses editing while an export runs (the server refuses edits meanwhile too): read-only, a banner, then back. */
function setPaused(on) {
  const ro = on ? (S.baseReadOnly ?? PAUSED) : S.baseReadOnly;
  if (ro === S.readOnly) return;
  S.readOnly = ro;
  $('#paused').hidden = !on || Boolean(S.baseReadOnly);
  document.body.classList.toggle('is-readonly', Boolean(ro));
  $('#snap').disabled = Boolean(ro);
  formatButtons();
  draw();
  updateButtons();
  updateKeys();
}

/** The legend follows what the keys would act on: a drag, a focused timeline item, or playback. */
function updateKeys() {
  const item = timeline.itemOf(document.activeElement);
  const context = S.dragging ? 'drag' : item ? (item.kind === 'clip' ? 'beat' : 'scene') : 'play';
  keybar.set(context, { readOnly: Boolean(S.readOnly || S.offline) });
}
document.addEventListener('focusin', updateKeys);
document.addEventListener('focusout', () => setTimeout(updateKeys));

// ---- drawing ---------------------------------------------------------------------------------
function draw({ inspector: withInspector = true } = {}) {
  if (!S.view) return;
  const { model, verdicts, floors } = S.view;
  timeline.render({ model, verdicts, floors, selection: S.selection, readOnly: S.readOnly, marks: transport.marks });
  transport.setDuration(model.duration);
  gate.setLive(verdicts);
  readout(transport.t);
  if (withInspector) renderInspector();
}

const renderInspector = () => (S.view ? inspector.render({ story: current().story, format: S.format, selection: S.selection, model: S.view.model, style: S.style, readOnly: S.readOnly, offline: S.offline, patterns: S.info.patterns ?? {} }) : Promise.resolve());

function readout(t) {
  const m = S.view?.model, d = m?.duration ?? 0, deck = m?.kind === 'deck';
  $('#time').textContent = deck ? t.toFixed(2) : clock(t);
  $('#duration').textContent = deck ? `${d} presses` : clock(d);
  const bb = m && !deck ? barBeat(t, m.grid) : null;
  $('#bar').hidden = bb == null;
  $('#bar').textContent = bb ? `bar ${bb}` : '';
  $('#play').setAttribute('aria-pressed', String(transport.playing));
  $('#play').setAttribute('aria-label', transport.playing ? 'Pause (Space)' : 'Play (Space)');
}

function onTime(t) {
  stage.seek(t);
  timeline.playhead(t);
  timeline.setMarks(transport.marks);
  if (transport.playing) timeline.follow(t);
  readout(t);
}

let computeSeq = 0;
async function recompute(story = current().story, opts) {
  ensureFormat(story);
  const my = ++computeSeq;
  S.computing++;
  try {
    const r = await engine.compute(story, { format: S.format, style: S.style, each: S.each });
    if (my !== computeSeq) return;
    S.view = r;
    S.error = null;
    draw(opts);
  } catch (e) {
    if (my === computeSeq) { S.error = String(e?.message ?? e); toast(`The timeline could not be drawn: ${S.error}`, 'error'); }
  } finally { S.computing--; }
}

// ---- the stage -------------------------------------------------------------------------------
let stageRunning = false;
function reloadStage({ force = false } = {}) {
  if (force) S.stageKey = null;
  if (!stageRunning) runStage();
}
async function runStage() {
  stageRunning = true;
  S.loading++;
  try {
    while (S.stageKey !== `${S.version}|${S.format}`) {
      const key = `${S.version}|${S.format}`, version = S.version;
      const mm = await stage.load({ piece: S.piece, format: S.format, t: transport.t });
      if (!mm) continue;
      S.stageKey = key;
      S.stageVersion = version;
      const each = eachFromSchedule(mm.schedule);
      if (!S.view || JSON.stringify(each) !== JSON.stringify(S.each)) { S.each = each; await recompute(); }
      S.schedMatch = sameSchedule(mm.schedule, S.view?.kit);
      if (S.schedMatch === false) console.warn('studio: the stage schedule and the studio schedule differ');
      stage.seek(transport.t);
      outlineSelection();
    }
  } catch (e) {
    S.error = String(e?.message ?? e);
  } finally { S.loading--; stageRunning = false; }
}
const sameSchedule = (a, b) => !!a && !!b && a.items.length === b.items.length && a.duration === b.duration
  && a.items.every((it, i) => it.start === b.items[i].start && it.d === b.items[i].d);

// ---- the file --------------------------------------------------------------------------------
function adopt(text, version) {
  S.text = text;
  S.story = JSON.parse(text);
  S.version = version;
  S.local = null;
}

const unreachableError = () => Object.assign(new Error('the studio server is not answering'), { unreachable: true });

/** Reads the piece; throws (and shows the banner) when story.json or style.json cannot be read. */
async function refetch() {
  let r;
  try { r = await getPiece(); } catch { throw unreachableError(); }
  if (r.body?.error === 'unreadable') { problem({ unreadable: r.body.reason }); throw new Error(`the piece cannot be read: ${r.body.reason}`); }
  if (r.status !== 200) throw new Error(`GET /api/piece answered ${r.status}`);
  S.info = r.body;
  S.style = r.body.style;
  // a server left running across an update refuses what its old code does not know: say so
  $('#stale').hidden = !r.body.codeStale;
  if (r.body.codeStale) $('#stale-text').textContent = `Its code was updated after it started, so new controls may not save. Stop it (Ctrl-C where you ran it), run node scripts/mm.mjs studio ${S.piece} again, then reload this page.`;
  adopt(r.body.text, r.body.version);
  problem({ unreadable: null, invalid: r.body.invalid ?? null });
  if (S.offline) online();
}

/** Clears the undo history; `why` is said when ⌘Z then finds nothing. */
function forget(why) {
  if (history.canUndo() || history.canRedo()) S.cleared = why;
  history.clear();
  updateButtons();
}

/** The file wins: read it, redraw, reload the stage at the same instant. After the saves, and on every outside change. */
async function sync() {
  const heard = S.heard;
  S.syncing = true;
  try {
    await refetch();
    if (S.version !== S.anchor) { forget('outside'); S.anchor = S.version; }   // someone else wrote since this page did
    await recompute();
    reloadStage({ force: S.stageStale });
    S.stageStale = false;
  } catch (e) {
    S.local = null;   // never show an edit the file may not hold
    recompute();
    if (e.unreachable) offline();
    else if (!S.unreadable) toast(String(e.message ?? e), 'error');
  } finally { S.syncing = false; S.dropQueue = false; }
  // a change announced while it read, that it did not read: read again
  if (S.heard !== heard && (S.heardVersion !== S.version || S.stageStale) && !S.offline && !S.saving) return sync();
  for (const fn of waiters.splice(0)) fn();
}

/** story.json (or style.json) cannot be read, or reads but fails the story schema: say so. Unreadable refuses edits. */
function problem({ unreadable, invalid }) {
  if (unreadable !== undefined) S.unreadable = unreadable ?? null;
  if (invalid !== undefined) S.invalid = invalid;
  const text = S.unreadable
    ? `The piece cannot be read: ${S.unreadable}. The studio keeps showing the last version it read and saves nothing until the file reads again.`
    : S.invalid?.length
      ? `story.json does not match the story schema: ${S.invalid.slice(0, 2).map((e) => `${e.path} ${e.message}`).join('; ')}. The server refuses edits that leave it so.`
      : '';
  $('#problem-text').textContent = text;
  $('#problem').hidden = !text;
}

function refusal(body) {
  if (body?.error === 'unwritable') return `Not saved: the server could not write (${body.reason ?? 'unwritable'}).`;
  if (body?.error === 'refused') return `Not saved: ${body.reason}. ${body.hint ?? ''}`.trim();
  if (body?.error === 'schema') return `Not saved: the story would not be valid (${body.errors?.[0]?.path ?? ''} ${body.errors?.[0]?.message ?? 'schema'}).`;
  return `Not saved: ${body?.reason ?? body?.error ?? 'the server refused the edit'}.`;
}

// ---- disconnected ------------------------------------------------------------------------------
function offline() {
  if (S.offline) return;
  S.offline = true; updateKeys();
  document.body.classList.add('is-offline');
  $('#offline').hidden = false;
  if (timeline.dragging) timeline.cancelDrag();
  renderInspector();
  updateButtons();
  (async () => {
    while (S.offline) {
      await sleep(1500);
      try { await getPiece(); } catch { continue; }
      if (S.offline) { online(); afterSaves(() => { chain = sync(); }); }
    }
  })();
}
function online() {
  if (!S.offline) return;
  S.offline = false; updateKeys();
  document.body.classList.remove('is-offline');
  $('#offline').hidden = true;
  renderInspector();
  updateButtons();
  exporter.reconcile();   // the server is back: the run this page follows may have died with it
}

const waiters = [];
/** Runs `fn` once no save is in flight and the file has been read back. */
function afterSaves(fn) { if (!S.saving && !S.syncing) fn(); else waiters.push(fn); }

// ---- saving ----------------------------------------------------------------------------------
/** Shows `edits` at once (a preview), then runs `send` in order after every earlier save. Resolves true when written. */
function save(edits, { inverse = false, send }) {
  if (S.readOnly || !edits.length) return Promise.resolve(false);
  if (S.offline) { toast(OFFLINE, 'error'); return Promise.resolve(false); }
  if (S.unreadable) { toast('Not saved: the piece cannot be read right now.', 'error'); return Promise.resolve(false); }
  try {
    // an inverse (undo) puts the exact old values back, unrounded and unchecked against today's patterns
    const r = applyEdits(current().text, edits, { style: S.style, ...(inverse ? { inverse: true } : {}) });
    S.local = { text: r.text, story: r.story };
  } catch (e) {
    toast(e instanceof EditRefused ? `Not saved: ${e.reason}. ${e.hint ?? ''}`.trim() : `Not saved: ${e.message ?? e}`, 'error');
    recompute();
    return Promise.resolve(false);
  }
  recompute(S.local.story);
  S.saving++;
  updateButtons();
  const p = chain.then(() => (S.dropQueue ? false : send()))
    .catch(() => { S.dropQueue = true; toast(OFFLINE, 'error'); offline(); return false; })
    .finally(() => { if (--S.saving === 0) chain = sync(); updateButtons(); });
  chain = p.catch(() => {});
  return p;
}

let gestureSeq = 0;
const newGesture = () => ++gestureSeq;

/** Records a write in the history; a write of the same gesture (a held key) joins its entry, receipts and all. */
function record({ edits, receipt, label, gesture }) {
  const entry = { edits, inverse: receipt.inverse, label, at: gesture * 1e6, receipts: [receipt.id] };
  const before = history.entries();
  history.record(entry);
  const after = history.entries(), top = after[after.length - 1];
  if (top && top !== entry && after.length === before.length) top.receipts = [...before[before.length - 1].receipts, receipt.id];
}

/** Saves edits through POST /api/edit. */
function commit(edits, { label, gesture = newGesture() } = {}) {
  const order = edits.length === 1 && edits[0].op === 'scene.order' ? edits[0] : null;
  if (order && !S.readOnly && !S.offline) select(`/scenes/${order.index}`);   // the selection moves with the scene
  return save(edits, {
    send: async () => {
      const r = await postEdit({ version: S.version, edits, label });
      if (r.status === 200) {
        S.version = S.anchor = r.body.version;
        if (r.body.receipt) { record({ edits, receipt: r.body.receipt, label, gesture }); S.cleared = null; }
        timeline.pin();
        return true;
      }
      S.dropQueue = true;
      if (r.body?.error === 'unreadable') problem({ unreadable: r.body.reason });
      else if (r.body?.error === 'exporting') toast(`Not saved: ${r.body.reason}.`, 'error');   // an export started in a shell: the file did not change
      else if (r.status === 409) { toast('The file changed; your edit was not saved. The studio now shows the file.', 'error'); forget('outside'); }
      else { toast(refusal(r.body), 'error'); refetch().catch(() => {}); }   // a refusal may be stale code: refetch says so
      return false;
    },
  });
}

let previewEdit = null, previewRaf = 0;
function preview(edit) {
  previewEdit = edit;
  if (previewRaf) return;
  previewRaf = requestAnimationFrame(() => {
    previewRaf = 0;
    const e = previewEdit, base = current();
    if (!e) return recompute(base.story, { inspector: false });
    try { recompute(applyEdits(base.text, [e], { style: S.style }).story, { inspector: false }); } catch { /* a refused step: keep the last preview */ }
  });
}

const canWrite = () => {
  if (S.readOnly || timeline.dragging) return false;
  if (S.offline) { toast(OFFLINE, 'error'); return false; }
  if (S.unreadable) { toast('Not saved: the piece cannot be read right now.', 'error'); return false; }
  return true;
};

function undo() { afterSaves(undoNow); }
function undoNow() {
  if (!canWrite()) return;
  const e = history.undo();
  if (!e) { toast(S.cleared === 'outside' ? 'Nothing to undo: the file was changed by another writer since your last edit.' : 'Nothing to undo.'); return; }
  save(e.inverse, {
    inverse: true,
    send: async () => {
      for (const id of [...e.receipts].reverse()) {
        const r = await postUndo(id);
        if (r.status === 200) { S.version = S.anchor = r.body.version; continue; }
        S.dropQueue = true;
        if (r.body?.error === 'exporting') { history.redo(); toast(`Not undone: ${r.body.reason}.`, 'error'); return false; }   // the entry stays to undo later
        forget(r.body?.error === 'changed' ? 'outside' : null);
        toast(r.body?.error === 'changed' ? 'Not undone: the file changed since that edit (another writer). The studio shows the file; the undo history is cleared.'
          : `Not undone: ${r.body?.reason ?? r.body?.error ?? `status ${r.status}`}. The undo history is cleared.`, 'error');
        return false;
      }
      timeline.pin();
      return true;
    },
  });
  updateButtons();
}

function redo() { afterSaves(redoNow); }
function redoNow() {
  if (!canWrite()) return;
  const e = history.redo();
  if (!e) { toast('Nothing to redo.'); return; }
  save(e.edits, {
    send: async () => {
      const r = await postEdit({ version: S.version, edits: e.edits, label: `redo: ${e.label ?? 'edit'}` });
      if (r.status === 200) { S.version = S.anchor = r.body.version; e.receipts = r.body.receipt ? [r.body.receipt.id] : []; timeline.pin(); return true; }
      S.dropQueue = true;
      if (r.body?.error === 'exporting') { history.undo(); toast(`Not redone: ${r.body.reason}.`, 'error'); return false; }
      forget(r.status === 409 ? 'outside' : null);
      toast(r.status === 409 ? 'Not redone: the file changed (another writer). The undo history is cleared.' : `Not redone: ${refusal(r.body).replace(/^Not saved: /, '')}`, 'error');
      return false;
    },
  });
  updateButtons();
}

function updateButtons() {
  $('#undo').disabled = !!S.readOnly || !history.canUndo();
  $('#redo').disabled = !!S.readOnly || !history.canRedo();
}

/** The receipts of the journal's chain that ends at the file, by this studio, not undone: the history a reload keeps. */
async function seedHistory() {
  const live = [];
  for (const r of await getJournal()) {
    if (r.undoes) { const i = live.findLastIndex((x) => x.id === r.undoes); if (i >= 0) live.splice(i, 1); } else live.push(r);
  }
  const chainOf = [];
  let v = S.version;
  for (let i = live.length - 1; i >= 0 && live[i].after === v && live[i].who === 'studio' && chainOf.length < 200; i--) { chainOf.unshift(live[i]); v = live[i].before; }
  for (const r of chainOf) history.record({ edits: r.edits, inverse: r.inverse, label: r.label, at: newGesture() * 1e6, receipts: [r.id] });
}

/** A watched file changed on disk: show the file, at the same instant. */
async function outside(ev) {
  S.heard++;
  if (ev.file === 'story.json') S.heardVersion = ev.version ?? null;
  if (ev.error === 'unreadable' || (ev.file === 'story.json' && ev.version == null)) { if (timeline.dragging) timeline.cancelDrag(); problem({ unreadable: ev.reason ?? 'the file is missing or not JSON' }); return; }
  if (ev.file !== 'story.json') S.stageStale = true;   // a style or asset change: the story and its history stand
  if (S.saving || S.syncing || S.offline) return;      // the read after the saves picks it up
  if (ev.file === 'story.json' && ev.version === S.version && !S.unreadable) return;
  if (timeline.dragging) { timeline.cancelDrag(); toast('The file changed while you dragged; the drag was cancelled.'); }
  await sync();
}

// ---- selection and the agent bridge ------------------------------------------------------------
function selectorOf(path) {
  if (!path || !S.view) return null;
  const sc = /^\/scenes\/(\d+)$/.exec(path);
  if (sc) { const s = S.view.model.scenes[Number(sc[1])]; return s ? `[data-scene="${s.id}"]` : null; }
  return clipsOf().find((c) => c.path === path && !c.parent)?.selector ?? null;
}
const outlineSelection = () => stage.outline(selectorOf(S.selection?.path));

let selTimer = 0;
function select(path) {
  path = path ?? null;
  if ((S.selection?.path ?? null) === path) return;
  S.selection = path ? { path } : null;
  timeline.setSelection(path);
  outlineSelection();
  if (S.view) renderInspector();
  clearTimeout(selTimer);
  selTimer = setTimeout(() => putSelection({ path, t: roundTime(transport.t), format: S.format }).catch(() => {}), 120);
}

function pick(selector) {
  if (!S.view) return;
  let path = selector ? pathForSelector(S.view.model, selector) : null;
  if (!path) {
    const t = transport.t, s = S.view.model.scenes.filter((x) => x.start <= t + 1e-9 && t < x.end).pop();
    path = s?.path ?? null;
  }
  select(path);
}

/** Seeks to a gate mark (its instant, else where the timeline draws it) and outlines its selector. */
/** Seeks to a rule's instant and outlines its element; in the rule's own format when it names one. */
async function go({ instant, selector, id, format }) {
  if (format && format !== S.format && current().story?.formats?.includes(format)) await setFormat(format);
  const t = S.view ? markTime(S.view.model, { instant, selector, id }) : null;
  if (typeof t === 'number') transport.seek(t);
  stage.outline(selector ?? selectorOf(S.selection?.path));
}

async function copyForAgent() {
  const path = S.selection?.path ?? null;
  const beat = path && !/^\/scenes\/\d+$/.test(path) ? rawAt(S.story, path) : null;
  const si = path ? sceneIx(path) : null;
  const raw = si != null ? S.story.scenes[si] : null;
  const sc = si != null ? forFormat(S.story, S.format).scenes[si] : null;   // as drawn in this format
  const payload = {
    piece: S.piece, format: S.format, t: roundTime(transport.t), path,
    beat: beat ?? null,
    scene: sc ? { index: si, id: sc.id, layout: sc.layout, duration: sc.duration, cut: raw.cut ?? null, move: sc.move ?? null } : null,
    verdicts: (S.view?.verdicts ?? []).filter((r) => r.status === 'FAIL' || r.status === 'WARN').map((r) => ({ id: r.id, status: r.status, evidence: r.evidence })),
  };
  const text = JSON.stringify(payload, null, 2);
  try { await navigator.clipboard.writeText(text); toast('Copied the selection for an agent.'); } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove();
    toast(ok ? 'Copied the selection for an agent.' : 'The clipboard is not available here.', ok ? 'info' : 'error');
  }
}

// ---- keyboard edits on a timeline item ----------------------------------------------------------
let run = null;   // the held key: { key, gesture }
/** One gesture per key press; the repeats of a held key join it. */
function gestureOf(e, id) {
  const key = `${e.key}|${e.shiftKey}|${e.altKey}|${id}`;
  if (e.repeat && run?.key === key) return run.gesture;
  run = { key, gesture: newGesture() };
  return run.gesture;
}

const enterD = (c) => c.segments.enter[1] - c.segments.enter[0];

function nudge(c, frames, gesture) {
  if (!c?.path || !c.editable.at) { if (c?.reason) toast(c.reason); return; }
  const story = current().story, beat = rawAt(story, c.path), sc = story.scenes[sceneIx(c.path)];
  const { hi } = atBounds(beat, sc, enterD(c));
  const at = Math.min(hi, Math.max(0, frameStep(beat.at, frames)));
  if (at === beat.at) { toast(frames > 0 ? 'It cannot go later: its entrance must finish inside the scene.' : 'It is at the scene start.'); return; }
  commit([{ op: 'beat.at', scene: sc.id, beat: Number(c.path.split('/').pop()), value: at, format: S.format }], { label: `nudge ${c.label} to ${at} s`, gesture });
}

function trimBeat(c, frames, gesture) {
  if (!c?.path || !c.editable.out) { if (c?.reason) toast(c.reason); return; }
  const story = current().story, beat = rawAt(story, c.path), sc = story.scenes[sceneIx(c.path)];
  const { lo, hi } = outBounds(beat, sc);
  const out = Math.min(hi, Math.max(lo, frameStep(beat.out ?? sc.duration, frames)));
  if (beat.out != null ? out === beat.out : out >= sc.duration) { toast(frames > 0 ? 'It already stays to the scene end.' : 'It cannot leave before it arrives.'); return; }
  commit([{ op: 'beat.out', scene: sc.id, beat: Number(c.path.split('/').pop()), value: out, format: S.format }], { label: `${c.label} leaves at ${out} s`, gesture });
}

function trimScene(s, frames, gesture) {
  if (!s.editable.duration) { if (s.reason) toast(s.reason); return; }
  const sc = current().story.scenes[s.index];
  const d = Math.min(60, Math.max(minDuration(sc), frameStep(sc.duration, frames)));
  if (d === sc.duration) { toast(frames > 0 ? 'A scene lasts at most 60 s.' : 'It cannot end before its last beat.'); return; }
  commit([{ op: 'scene.duration', scene: sc.id, value: d }], { label: `${sc.id} lasts ${d} s`, gesture });
}

function moveScene(s, dir) {
  if (!s.editable.order) { if (s.reason) toast(s.reason); return; }
  const n = current().story.scenes.length, index = s.index + dir;
  if (index < 0 || index >= n) return;
  commit([{ op: 'scene.order', scene: s.id, index }], { label: `move ${s.id} to position ${index + 1}` });
}

function removeBeat(path) {
  if (S.readOnly || !path || /^\/scenes\/\d+$/.test(path)) return;
  const sc = current().story.scenes[sceneIx(path)];
  commit([{ op: 'beat.remove', scene: sc.id, beat: Number(path.split('/').pop()), format: S.format }], { label: `remove a beat of ${sc.id}` });
  select(null);
}

async function editInInspector(item) {
  select(item.kind === 'clip' ? item.clip.path : item.scene.path);
  await inspector.focusFirst();
}

/** The keys of a focused clip or scene block; true when the key was one of them. */
function itemKey(e, item) {
  const k = e.key, frames = (e.shiftKey ? 3 : 1);
  const id = item.kind === 'clip' ? item.clip?.id : `scene:${item.scene?.index}`;
  if (!id) return false;
  // arrows nudge; Alt+arrows move between items
  if ((k === 'ArrowLeft' || k === 'ArrowRight') && e.altKey && !e.shiftKey) { timeline.navigate(item.el, k === 'ArrowRight' ? 'right' : 'left'); return true; }
  if (k === 'ArrowUp' || k === 'ArrowDown') { timeline.navigate(item.el, k === 'ArrowDown' ? 'down' : 'up'); return true; }
  if ((k === 'ArrowLeft' || k === 'ArrowRight') && !e.altKey) {
    if (S.readOnly) return true;
    const dir = k === 'ArrowRight' ? 1 : -1;
    if (item.kind === 'clip') nudge(item.clip, dir * frames, gestureOf(e, id));
    else if (!e.repeat) moveScene(item.scene, dir);
    return true;
  }
  if (k === '[' || k === ']' || k === '{' || k === '}') {
    if (S.readOnly) return true;
    const dir = k === ']' || k === '}' ? 1 : -1;
    if (item.kind === 'clip') trimBeat(item.clip, dir * frames, gestureOf(e, id));
    else trimScene(item.scene, dir * frames, gestureOf(e, id));
    return true;
  }
  if (k === 'Enter' || k === 'F2' || k === 'e' || k === 'E') { editInInspector(item); return true; }
  if (k === 'Delete' || k === 'Backspace') { if (item.kind === 'clip') removeBeat(item.clip?.path); return true; }
  return false;
}

// ---- the shortcuts overlay ------------------------------------------------------------------------
const keysEl = $('#keys');
let keysReturn = null;
function openKeys() {
  keysReturn = document.activeElement;
  keysEl.hidden = false;
  keysEl.querySelector('[data-close]').focus();
}
function closeKeys() {
  keysEl.hidden = true;
  keysReturn?.focus?.({ preventScroll: true });
}
keysEl.addEventListener('click', (e) => { if (e.target === keysEl || e.target.closest('[data-close]')) closeKeys(); });
$('#keys-btn').addEventListener('click', openKeys);

// ---- keyboard -------------------------------------------------------------------------------
function setSnap(on) {
  S.snap = on;
  $('#snap').setAttribute('aria-pressed', String(on));
}

document.addEventListener('keydown', (e) => {
  if (!keysEl.hidden) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); closeKeys(); } return; }
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') { e.preventDefault(); exporter.toggle(); return; }
  if (e.key === 'Escape' && exporter.isOpen) { e.preventDefault(); exporter.close(); return; }
  if (!S.view || timeline.dragging) return;
  const t = e.target;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
  const mod = e.metaKey || e.ctrlKey;
  const k = e.key;
  if (mod && k.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod) return;
  const item = timeline.itemOf(t);
  if (item && itemKey(e, item)) { e.preventDefault(); return; }
  if (e.altKey) return;
  switch (k) {
    case ' ': if (t.tagName === 'BUTTON') return; e.preventDefault(); transport.toggle(); break;
    case 'k': case 'K': transport.pause(); break;
    case 'l': case 'L': transport.forward(); break;
    case 'j': case 'J': transport.backward(); break;
    case 'ArrowLeft': case 'ArrowRight': e.preventDefault(); transport.step((k === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 1 / FPS)); break;
    case ',': case '<': transport.step(k === '<' ? -1 : -1 / FPS); break;
    case '.': case '>': transport.step(k === '>' ? 1 : 1 / FPS); break;
    case 'Home': e.preventDefault(); transport.home(); break;
    case 'End': e.preventDefault(); transport.end(); break;
    case 'i': case 'I': transport.markIn(); break;
    case 'o': case 'O': transport.markOut(); break;
    case 'x': case 'X': transport.clearMarks(); break;
    case 'Escape': select(null); break;
    case 's': setSnap(!S.snap); break;
    case '=': case '+': timeline.zoom('in'); break;
    case '-': case '_': timeline.zoom('out'); break;
    case 'Z': timeline.zoom('fit'); break;
    case '?': e.preventDefault(); openKeys(); break;
    default: return;
  }
});

// ---- the top bar -----------------------------------------------------------------------------
let shownFormats = null;
/** The switch shows the story's formats (the edit in flight, else the file); each names its platforms. */
/** The formats the switch shows: every film format side by side; a deck has its one. */
const shownFormats_ = (story) => (story?.kind === 'deck' ? story.formats : FORMAT_ORDER);
function formatButtons(shipped = current().story?.formats ?? S.info.formats) {
  const formats = shownFormats_(current().story ?? S.info);
  const key = `${shipped.join(',')}|${S.format}|${S.readOnly}`;
  if (key === shownFormats) return;
  shownFormats = key;
  $('#formats').replaceChildren(...formats.map((f) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'seg-btn'; b.textContent = formatShort(f);
    b.setAttribute('aria-pressed', String(f === S.format));
    b.setAttribute('aria-label', `Format ${f}`);
    b.title = formatTitle(f, shipped.includes(f));
    b.addEventListener('click', () => setFormat(f));
    return b;
  }));
  exporter.refresh();   // an open Export form offers the story's formats as they are now
}
/** A format the switch does not offer (a deck has one) gives way to the story's first; any film format may be previewed. */
function ensureFormat(story) {
  const formats = shownFormats_(story);
  if (!Array.isArray(formats) || !formats.length || S.format == null) return;
  if (!formats.includes(S.format)) {
    S.format = formats[0];
    const u = new URL(location.href); u.searchParams.set('format', S.format); window.history.replaceState(null, '', u);
    select(null);
    reloadStage();
  }
  formatButtons(story?.formats);
}
async function setFormat(f) {
  if (f === S.format) return;
  S.format = f;
  const u = new URL(location.href); u.searchParams.set('format', f); window.history.replaceState(null, '', u);
  formatButtons();
  select(null);
  reloadStage();
  await recompute();
}

$('#play').addEventListener('click', () => transport.toggle());
$('#undo').addEventListener('click', undo);
$('#redo').addEventListener('click', redo);
$('#snap').addEventListener('click', () => setSnap(!S.snap));
$('#copy').addEventListener('click', copyForAgent);
$('#gate-pill').addEventListener('click', () => { $('#gate').scrollIntoView({ block: 'nearest' }); $('#gate').focus({ preventScroll: true }); });

// ---- boot ------------------------------------------------------------------------------------
window.studio = {
  ready: false,
  state() {
    const m = S.view?.model;
    return JSON.parse(JSON.stringify({
      piece: S.piece, version: S.version, stageVersion: S.stageVersion, format: S.format,
      busy: S.saving > 0 || S.syncing || S.loading > 0 || S.computing > 0,
      t: transport.t, playing: transport.playing, marks: transport.marks, readOnly: S.readOnly, snap: S.snap,
      offline: S.offline, selection: S.selection, view: timeline.view(), schedMatch: S.schedMatch, error: S.error,
      counts: countsOf(S.view?.verdicts ?? []), verdicts: (S.view?.verdicts ?? []).map((r) => ({ id: r.id, status: r.status })),
      model: m ? {
        duration: m.duration,
        scenes: m.scenes.map(({ id, index, start, end, duration, path, cut }) => ({ id, index, start, end, duration, path, cut })),
        clips: m.lanes.flatMap((l) => l.clips.map((c) => ({ id: c.id, kind: c.kind, lane: l.id, start: c.start, end: c.end, enterEnd: c.segments?.enter?.[1] ?? null, path: c.path, parent: c.parent ?? null, sceneIndex: c.path ? sceneIx(c.path) : Number(String(c.id).split(':')[1].split('.')[0]) }))),
        grid: { beats: m.grid.beats.length, bpm: m.grid.bpm },
      } : null,
      undo: history.canUndo(), redo: history.canRedo(),
    }));
  },
  select: (path) => select(path),
  seek: (t) => transport.seek(t),
};

/** The live connection: changes as they land, a refusal named in a banner, an unreachable server shown as disconnected. */
function connect() {
  listen({
    onChanged: (ev) => { outside(ev).catch((e) => toast(String(e.message ?? e), 'error')); },
    onExport: (ev) => exporter.onEvent(ev),
    onHello: (ev) => {
      $('#live').hidden = true;
      exporter.reconcile();   // a run this page follows may be gone (a restarted server), or one may have started elsewhere
      if (S.offline) { online(); afterSaves(() => { chain = sync(); }); return; }
      if (ev.version !== S.version) outside({ file: 'story.json', version: ev.version, by: 'outside' }).catch(() => {});
    },
    onDown: async (reason) => {
      if (reason) {
        $('#live-text').textContent = `Live updates are off: ${reason}. Edits still save, and a stale one is refused; the studio tries again every 5 s.`;
        $('#live').hidden = false;
        return;
      }
      try { await getPiece(); } catch { offline(); }   // the stream dropped: is the server gone?
    },
  });
}

async function boot() {
  if (!S.piece) { $('#stage .stage-message').textContent = 'No piece: open this page as /scripts/studio/ui/index.html?piece=<folder>, or run mm studio <piece>.'; $('#stage .stage-message').hidden = false; return; }
  await refetch();
  engine = createEngine({ piece: S.piece, patternsBase: S.info.patternsBase });
  S.format = S.info.formats.includes(params.get('format')) ? params.get('format') : S.info.formats[0];
  S.readOnly = S.baseReadOnly = S.info.generator ? `This story is generated by ${S.info.generator}. Edit that script's input and run it again; edits here would be overwritten.`
    : S.info.kind === 'deck' ? 'Decks open read-only in the studio. Edit the deck\'s story.json by hand.' : null;
  document.title = `${S.story.id} · studio`;
  $('#title').textContent = S.story.id;
  $('#title').title = S.piece;
  if (S.readOnly) { $('#banner-text').textContent = S.readOnly; $('#banner').hidden = false; document.body.classList.add('is-readonly'); $('#snap').disabled = true; }
  formatButtons();
  if (!S.readOnly) await seedHistory();
  S.anchor = S.version;
  updateButtons();
  const t0 = Number(params.get('t'));
  if (Number.isFinite(t0) && t0 > 0) transport.seek(t0);
  await runStage();
  if (!S.view) await recompute();
  connect();
  updateKeys();
  window.studio.ready = true;
  document.body.classList.add('is-ready');
}

boot().catch((e) => {
  S.error = String(e?.message ?? e);
  const m = $('#stage .stage-message');
  m.textContent = `The studio could not start: ${S.error}`;
  m.hidden = false;
});
