// The story-edit service: the one place a piece's story.json is
// written by the studio and by `mm timeline`. An edit is a list of edit ops (contracts/edit-ops.schema.json)
// applied with scripts/studio/ops.js applyEdits, so only the edited bytes change. It writes only when
// the caller's version is the file's, only when the result passes the story schema, by a temporary
// file and a rename, and appends a receipt to <piece>/out/studio/journal.jsonl. Undo applies a
// receipt's inverse, and only while the file is still that receipt's `after`.
//
// Receipt = { id, who, at, label, edits, inverse, before, after, undoes? }: `at` ISO, `id` r<n>-<hex>
// (n one past the larger of the journal's line count and its highest id, so ids are never reused;
// hex the start of `after`), `before`/`after` versions, `undoes` the id of the receipt an undo
// reverted. A version is the first 16 hex characters of the text's SHA-256.
//
// A commit holds <piece>/out/studio/journal.lock (created with O_EXCL; a lock
// whose pid is gone, or older than LOCK_STALE_MS, is broken) across: re-read and version check, open
// the journal for append, write the temporary story file, append the receipt (on a fresh line), rename
// the temporary file over story.json. The rename is the commit point, so the story never changes
// without its receipt; a failed rename truncates the receipt away again. A crash between the append
// and the rename leaves a receipt whose `after` the file never reached: undo refuses it as changed.
// A journal line that does not parse (cut short by a crash) is skipped with a warning on stderr.
// While an export of the piece holds out/export.lock (scripts/lib/export-lock.mjs), every commit is
// refused with ExportRunning: the story an export checked is the story it renders.
// holdForExport takes that lock under the journal lock, so no commit lands between the two.
import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, ftruncateSync, linkSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { applyEdits, EditRefused } from '../studio/ops.js';
import { patternsBaseOf } from './patterns-base.mjs';
import { validators } from './validate.mjs';
import { ExportBusy, exportHolder, takeExportLock } from './export-lock.mjs';
import { versionOf } from './story-version.mjs';

export { EditRefused, ExportBusy, versionOf };

/** The caller's version is not the file's: nothing was written. */
export class StaleVersion extends Error {
  constructor(current) { super(`the story changed: it is at ${current} now`); this.name = 'StaleVersion'; this.current = current; }
}
/** The edits, or the story they would write, fail a contract: nothing was written. `of`: 'story' | 'edits'. */
export class SchemaRefused extends Error {
  constructor(errors, of = 'story') { super(`${of === 'story' ? 'the edited story does not match contracts/story.schema.json' : 'the edits do not match contracts/edit-ops.schema.json'}: ${errors.slice(0, 3).map((e) => `${e.path} ${e.message}`).join('; ')}`); this.name = 'SchemaRefused'; this.errors = errors; this.of = of; }
}
/** Undo refused: the file is not the receipt's `after` any more. */
export class ChangedSince extends Error {
  constructor(current, id) { super(`the story changed since ${id ?? 'that receipt'}: it is at ${current} now`); this.name = 'ChangedSince'; this.current = current; }
}
/** No receipt to undo. */
export class NoReceipt extends Error {
  constructor(which) { super(which === 'last' ? 'the journal holds nothing to undo' : `no receipt ${which} in the journal`); this.name = 'NoReceipt'; }
}

/** story.json is missing or does not parse (an editor mid-save): nothing was written. Names no absolute path. */
export class Unreadable extends Error {
  constructor(reason) { super(reason); this.name = 'Unreadable'; this.reason = reason; }
}
/** An export of the piece is running (it holds out/export.lock): nothing was written. */
export class ExportRunning extends Error {
  constructor(holder) { super(`an export of this piece is running (${holder?.by ?? 'another process'}, pid ${holder?.pid ?? '?'}): edits wait until it ends`); this.name = 'ExportRunning'; this.reason = this.message; this.holder = holder; }
}
/** The journal (or the story) cannot be written, or the journal lock cannot be taken: nothing was written. */
export class Unwritable extends Error {
  constructor(reason) { super(reason); this.name = 'Unwritable'; this.reason = reason; }
}

const storyPath = (dir) => join(dir, 'story.json');
const studioDir = (dir) => join(dir, 'out', 'studio');
const journalPath = (dir) => join(studioDir(dir), 'journal.jsonl');
const lockPath = (dir) => join(studioDir(dir), 'journal.lock');
const CONTRACTS = fileURLToPath(new URL('../../contracts/', import.meta.url));

let V = null;
const contracts = () => (V ??= validators());
const explain = (errs) => (errs ?? []).filter((e) => e.keyword !== 'if').map((e) => ({ path: e.instancePath || '/', message: e.message }));

// The edit-ops `oneOf` reports every branch's errors; a failing edit is re-checked against the one
// branch its `op` names, so the errors say what is wrong with that op.
let OPS = null;
function editErrors(edits, errs) {
  if (!Array.isArray(edits)) return explain(errs);
  OPS ??= (() => {
    const ajv = new Ajv2020({ allErrors: true, strict: false, allowUnionTypes: true });
    addFormats(ajv);
    const read = (n) => JSON.parse(readFileSync(join(CONTRACTS, `${n}.schema.json`), 'utf8'));
    for (const n of ['brand', 'motion', 'style', 'story']) ajv.addSchema(read(n));
    const ops = read('edit-ops');
    ajv.addSchema(ops);
    return Object.fromEntries(Object.entries(ops.$defs).filter(([, d]) => d.properties?.op?.const).map(([name, d]) => [d.properties.op.const, ajv.getSchema(`${ops.$id}#/$defs/${name}`)]));
  })();
  const failing = [...new Set(errs.map((e) => /^\/(\d+)/.exec(e.instancePath)?.[1]).filter(Boolean))].map(Number);
  const out = failing.flatMap((i) => {
    const check = OPS[edits[i]?.op];
    if (!check) return [{ path: `/${i}/op`, message: `must be an edit op: ${Object.keys(OPS).join(', ')}` }];
    check(edits[i]);
    return explain(check.errors).map((e) => ({ path: `/${i}${e.path === '/' ? '' : e.path}`, message: e.message }));
  });
  return out.length ? out : explain(errs);
}

export function readStory(pieceDir) {
  let text, story;
  try { text = readFileSync(storyPath(pieceDir), 'utf8'); } catch (e) { throw new Unreadable(e.code === 'ENOENT' ? 'story.json is missing' : `story.json cannot be read (${e.code ?? e.message})`); }
  try { story = JSON.parse(text); } catch (e) { throw new Unreadable(`story.json is not JSON (an editor mid-save?): ${e.message}`); }
  return { text, story, version: versionOf(text) };
}

const WARNED = new Set();
/** The receipts in a journal's text, and the number the next receipt takes (never one already used). */
function parseJournal(text, file) {
  const receipts = [];
  let lines = 0, top = 0;
  text.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    lines++;
    let r = null;
    try { r = JSON.parse(line); } catch { /* reported below */ }
    if (r && typeof r === 'object' && typeof r.id === 'string') { receipts.push(r); top = Math.max(top, Number(/^r(\d+)-/.exec(r.id)?.[1] ?? 0)); return; }
    const key = `${file}:${i}:${line}`;
    if (!WARNED.has(key)) { WARNED.add(key); console.warn(`mm: out/studio/journal.jsonl line ${i + 1} is not a receipt (cut short by a crash?): skipped`); }
  });
  return { receipts, next: Math.max(lines, top) + 1 };
}

export function readJournal(pieceDir) {
  if (!existsSync(journalPath(pieceDir))) return [];
  return parseJournal(readFileSync(journalPath(pieceDir), 'utf8'), journalPath(pieceDir)).receipts;
}

// ---- the journal lock -------------------------------------------------------------------

const LOCK_STALE_MS = 10_000;   // a commit holds the lock for milliseconds
const LOCK_WAIT_MS = 15_000;
const nap = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/** Breaks the lock when its pid is gone or it is older than LOCK_STALE_MS. */
function breakIfStale(file) {
  let text, st;
  try { text = readFileSync(file, 'utf8'); st = statSync(file); } catch { return; }   // released meanwhile
  let pid = null;
  try { pid = JSON.parse(text).pid; } catch { /* being written: judged by age */ }
  if (!((Number.isInteger(pid) && !alive(pid)) || Date.now() - st.mtimeMs > LOCK_STALE_MS)) return;
  const aside = `${file}.${process.pid}-${randomBytes(4).toString('hex')}.stale`;
  try { renameSync(file, aside); } catch { return; }
  // another writer broke the same stale lock and took a fresh one in between: put that one back
  try { if (readFileSync(aside, 'utf8') !== text) linkSync(aside, file); } catch { /* a third writer holds it now */ }
  rmSync(aside, { force: true });
}

function withLock(pieceDir, fn) {
  const file = lockPath(pieceDir);
  const mine = JSON.stringify({ pid: process.pid, at: new Date().toISOString(), nonce: randomBytes(6).toString('hex') });
  const t0 = Date.now();
  for (;;) {
    try {
      const fd = openSync(file, 'wx');
      try { writeSync(fd, mine); } finally { closeSync(fd); }
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw new Unwritable(`cannot take the journal lock out/studio/journal.lock (${e.code ?? e.message})`);
    }
    breakIfStale(file);
    if (Date.now() - t0 > LOCK_WAIT_MS) throw new Unwritable('out/studio/journal.lock is held by another writer; delete it if no mm studio or mm timeline is running');
    nap(2);
  }
  try { return fn(); } finally {
    try { if (readFileSync(file, 'utf8') === mine) rmSync(file); } catch { /* broken as stale by another writer */ }
  }
}

// Pattern modules by ref, per patterns folder, read again when a pattern.js is added, removed or
// changed; `errors` holds the refs whose module does not import, with the reason.
const PATTERNS = new Map();
async function loadPatternsOf(base) {
  const dirs = (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()); } catch { return []; } };
  const files = [];
  for (const g of dirs(base)) {
    if (g.name === 'layouts' || g.name === 'sound') continue;
    for (const p of dirs(join(base, g.name))) {
      const file = join(base, g.name, p.name, 'pattern.js');
      if (existsSync(file)) files.push({ ref: `${g.name}/${p.name}`, file, mtime: statSync(file).mtimeMs });
    }
  }
  const sig = files.map((f) => `${f.ref}@${f.mtime}`).join('|');
  if (PATTERNS.get(base)?.sig === sig) return PATTERNS.get(base);
  const patterns = {}, errors = {};
  for (const f of files) {
    try {
      const m = (await import(`${pathToFileURL(f.file).href}?v=${f.mtime}`)).default;
      if (m) patterns[f.ref] = m; else errors[f.ref] = 'it has no default export';
    } catch (e) { errors[f.ref] = String(e?.message ?? e).split('\n')[0]; }
  }
  const hit = { sig, patterns, errors };
  PATTERNS.set(base, hit);
  return hit;
}
export async function allPatterns(base) { return (await loadPatternsOf(base)).patterns; }

export function readStyle(pieceDir) {
  try { return JSON.parse(readFileSync(join(pieceDir, 'style.json'), 'utf8')); } catch (e) { throw new Unreadable(e.code === 'ENOENT' ? 'style.json is missing' : `style.json is not JSON: ${e.message}`); }
}

/** The story-schema problems of a parsed story ([{ path, message }]), or null when it is valid. */
export function storyErrors(story) {
  const c = contracts();
  return c.story(story) ? null : explain(c.story.errors);
}

/** What the ops need to validate an edit to this piece: { patterns, style }. */
export async function editContext(pieceDir) {
  return { patterns: await allPatterns(patternsBaseOf(pieceDir)), style: readStyle(pieceDir) };
}

/**
 * Applies edits to `text` in memory: { text, story, inverse } or throws EditRefused / SchemaRefused.
 * `inverse: true` applies a receipt's inverse: exact values back, no pattern-param checks.
 */
async function compute(pieceDir, text, edits, { inverse = false } = {}) {
  const c = contracts();
  if (!c.editOps(edits)) throw new SchemaRefused(editErrors(edits, c.editOps.errors), 'edits');
  // ctx.validate lets the ops refuse a schema-invalid step (code `schema`); the post-check below stays
  const validate = (story) => (c.story(story) ? null : explain(c.story.errors));
  const { patterns, errors } = await loadPatternsOf(patternsBaseOf(pieceDir));
  let r;
  try { r = applyEdits(text, edits, { patterns, style: readStyle(pieceDir), validate, inverse }); } catch (e) {
    // the ops' own schema refusal surfaces as the service's SchemaRefused, so callers see one shape
    if (e instanceof EditRefused && e.code === 'schema') throw new SchemaRefused(Array.isArray(e.errors) ? e.errors : [{ path: '/', message: e.reason }], 'story');
    // a pattern that is there but does not import: say why, not just "no pattern"
    const ref = e instanceof EditRefused && e.code === 'bad-value' ? /^no pattern (\S+)/.exec(e.reason ?? '')?.[1] : null;
    if (ref && errors[ref]) e.hint = `${ref}/pattern.js does not load: ${errors[ref]}`;
    throw e;
  }
  if (!c.story(r.story)) throw new SchemaRefused(explain(c.story.errors), 'story');
  return r;
}

function commit(pieceDir, before, text, { who, label, edits, inverse, undoes }) {
  try { mkdirSync(studioDir(pieceDir), { recursive: true }); } catch (e) { throw new Unwritable(`cannot create out/studio/ (${e.code ?? e.message})`); }
  return withLock(pieceDir, () => {
    const exporting = exportHolder(pieceDir);
    if (exporting) throw new ExportRunning(exporting);
    // re-read under the lock: nothing may have landed while the patterns loaded, here or in another process
    const now = readStory(pieceDir).version;
    if (now !== before) throw new StaleVersion(now);
    const sp = storyPath(pieceDir), jp = journalPath(pieceDir);
    let fd;
    try { fd = openSync(jp, 'a+'); } catch (e) { throw new Unwritable(`cannot write out/studio/journal.jsonl (${e.code ?? e.message})`); }
    try {
      const prior = readFileSync(jp, 'utf8');
      const after = versionOf(text);
      const receipt = { id: `r${parseJournal(prior, jp).next}-${after.slice(0, 6)}`, who, at: new Date().toISOString(), label: label ?? null, edits, inverse, before, after, ...(undoes ? { undoes } : {}) };
      const tmp = `${sp}.${process.pid}-${randomBytes(4).toString('hex')}.tmp`;
      const undo = (what, e) => { rmSync(tmp, { force: true }); try { ftruncateSync(fd, Buffer.byteLength(prior)); } catch { /* best effort */ } return new Unwritable(`cannot write ${what} (${e.code ?? e.message})`); };
      try { writeFileSync(tmp, text); } catch (e) { throw undo('story.json', e); }
      // the receipt first, on a fresh line (a line cut short by a crash must not swallow it), then the rename
      try { writeSync(fd, `${prior && !prior.endsWith('\n') ? '\n' : ''}${JSON.stringify(receipt)}\n`); } catch (e) { throw undo('out/studio/journal.jsonl', e); }
      try { renameSync(tmp, sp); } catch (e) { throw undo('story.json', e); }
      return { version: after, receipt };
    } finally { closeSync(fd); }
  });
}

/**
 * Applies `edits` to the piece's story when `version` is the file's. `plan: true` writes nothing and
 * returns { version, text, before, inverse } (the text the write would leave). An edit that changes nothing
 * writes nothing and returns { version, receipt: null }.
 */
export async function editStory(pieceDir, { edits, version, who = 'cli', label, plan = false } = {}) {
  const cur = readStory(pieceDir);
  if (version !== cur.version) throw new StaleVersion(cur.version);
  const r = await compute(pieceDir, cur.text, edits);
  if (plan) return { version: versionOf(r.text), text: r.text, before: cur.text, inverse: r.inverse };
  if (r.text === cur.text) return { version: cur.version, receipt: null };
  return commit(pieceDir, cur.version, r.text, { who, label, edits, inverse: r.inverse });
}

/** The receipt `which` names: an id, or 'last' (the newest receipt that is not an undo and not undone). */
export function findReceipt(journal, which = 'last') {
  if (which !== 'last') return journal.find((r) => r.id === which) ?? null;
  const undone = new Set();
  for (let i = journal.length - 1; i >= 0; i--) {
    const r = journal[i];
    if (undone.has(r.id)) continue;
    if (r.undoes) { undone.add(r.undoes); continue; }
    return r;
  }
  return null;
}

/** Applies a receipt's inverse; refused (ChangedSince) unless the file is still the receipt's `after`. */
export async function undoReceipt(pieceDir, { receipt = 'last', who = 'cli', plan = false } = {}) {
  const r = findReceipt(readJournal(pieceDir), receipt);
  if (!r) throw new NoReceipt(receipt);
  const cur = readStory(pieceDir);
  if (cur.version !== r.after) throw new ChangedSince(cur.version, r.id);
  const out = await compute(pieceDir, cur.text, r.inverse, { inverse: true });
  if (plan) return { version: versionOf(out.text), text: out.text, before: cur.text, receipt: r };
  return commit(pieceDir, cur.version, out.text, { who, label: `undo ${r.id}`, edits: r.inverse, inverse: out.inverse, undoes: r.id });
}

/**
 * Takes the piece's export lock (export-lock.mjs) under the journal lock, and reads the story it
 * pins: { text, story, version, nonce, inherited, release }. Throws ExportBusy while another export runs.
 */
export function holdForExport(pieceDir, { by } = {}) {
  try { mkdirSync(studioDir(pieceDir), { recursive: true }); } catch (e) { throw new Unwritable(`cannot create out/studio/ (${e.code ?? e.message})`); }
  return withLock(pieceDir, () => {
    const lock = takeExportLock(pieceDir, { by });
    try { return { ...readStory(pieceDir), ...lock }; } catch (e) { lock.release(); throw e; }
  });
}
