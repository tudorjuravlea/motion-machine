// The studio server: files from the repo root by GET, and a
// small JSON API over one piece, on 127.0.0.1 only. Every request whose Host is not
// 127.0.0.1:<port>, localhost:<port> or [::1]:<port> gets 403 (DNS rebinding); a POST or PUT, or any /api/
// request, whose Origin is present and not the studio's own gets 403 (a cross-origin page in the
// same browser); a path that leaves the root, or enters .git (in any case, before or after symlinks),
// gets 403. A write takes JSON only, at most 1 MB. The server writes nothing but the piece's story.json
// (through scripts/lib/story-edit.mjs) and <piece>/out/studio/; POST /api/check runs the gate, which
// writes the gate's own <piece>/out/check.json; POST /api/export runs `mm check`, `mm export` and
// `mm sound` on the piece, which write only under <piece>/out/ (their own contract: staged, renamed
// when complete; an interrupted gate writes no report, an interrupted film render replaces no file). An
// Export holds the piece's export lock (out/export.lock) for its whole run, so the story it checks is
// the story it renders: edits through /api/edit, /api/undo and `mm timeline` are refused meanwhile
// (409 exporting), and a second exporter, here or in a shell, is refused.
//
// API (all JSON):
//   GET  /api/piece      → { piece, text, story, version, generator, kind, formats, style, patternsBase, patterns, invalid, sound }
//                        (patterns: the refs the patterns folder offers, by group, for the inspector's lists;
//                        invalid: the story-schema problems [{ path, message }] of a story that parses, or null;
//                        sound: whether `mm sound` would mix anything, by its own predicate)
//   GET  /api/journal    → { receipts } (the piece's journal; empty when it has none)
//   POST /api/edit       { version, edits, label? } → 200 { version, receipt } | 409 { error: 'stale', version, text }
//                        | 422 { error: 'refused', code, reason, hint, index } | 422 { error: 'schema', of, errors }
//                        | 409 { error: 'exporting', reason } (an export of the piece is running; also /api/undo)
//                        (receipts are always by `studio`: a `who` other than 'studio' is a 400)
//   POST /api/undo       { receipt? } → 200 { version, receipt } | 409 { error: 'changed', version } | 404 { error: 'no-receipt' }
//   GET  /api/events     SSE: `hello` { version }; `changed` { version, by, file, receipt? }. For story.json, `by` is
//                        the `who` of the journal receipts that lead from the last version seen to this one
//                        ('studio', 'cli', an agent's name), else 'outside'; `receipt` the last of them. A story.json
//                        that is missing or does not parse: { version: null, by: 'outside', file, error: 'unreadable', reason }.
//                        Other files (style.json, piece.css, assets/…): by 'outside', when their bytes change. At most 32 clients (503).
//                        A write through /api/edit or /api/undo is reported as soon as it lands, not after the watch
//                        debounce, so an outside write that reverts it within the debounce is reported too.
//   GET  /api/selection  → { path, t, format } | null;  PUT /api/selection { path, t, format } → the selection
//                        (path null, /scenes/<i>, /scenes/<i>/beats/<j> or /scenes/<i>/variants/<f>/beats/<j> of the
//                        current story; format null or one of story.formats)
//   POST /api/check      { format } → { exit, rules } (rules from out/check.json; null when the run wrote none)
//   POST /api/export     { formats, force?, sound? } → 202 { state: 'check', formats, id } | 409 { error: 'busy', reason }
//                        | 422 { error: 'bad-formats', reason, formats } (formats: a non-empty list of distinct
//                        formats the story ships; any other key is a 400). One run per piece, across processes
//                        (out/export.lock): `mm check <piece>` (every story format, so out/check.json is the whole
//                        gate); when it passes, or `force`, `mm export <piece> --formats …` (with --force when the
//                        gate failed: the MP4s are stamped UNCHECKED); then, when `sound`, `mm sound <piece>
//                        --formats …` and `mm check` again, since G-PEAK and W-LOUDNESS measure the muxed MP4s. Its
//                        progress goes out on the SSE stream as `export` events, each with { id (the run's, also
//                        in the 202), state, formats, sound, force, version (the story pinned), line? }: state 'check'|'export'|'sound'|
//                        'recheck' while it runs, then one of
//                          done      { files: [{ format, path, url, bytes }] (from this run's out/export.json: each
//                                    MP4, a deck's walkthrough; path repo-relative, url the GET path), poster (a
//                                    frame of the story's first format, when the run wrote one, else null),
//                                    unchecked (the gate failed and `force`), mixChecked (sound: the gate ran
//                                    again on the mix), failed?, rules? (sound: what failed after the mix),
//                                    recheckReason? (sound: why the gate could not run again), stale? (story.json
//                                    changed during the run, outside the lock) }
//                          failed    { failed: [rule ids], rules: [FAIL rows] (at the gate) | reason, and after
//                                    the render files and soundFailed: true (the MP4s are this run's, not mixed) }
//                          cancelled { stage: the step it stopped in, files? (after the render) }
//   GET  /api/export     → the last export event of this server's life, or null
//   POST /api/export/cancel {} → 200 { cancelled: true } | 409 { error: 'idle' }: SIGTERM to the running step
//                        (a step not yet started never starts)
// Files are served with Range support (206, 416), so a <video> can seek an MP4.
// Errors of the request itself: 400 { error: 'bad-request', reason }, 403, 404, 405, 413, 415, 503 { error: 'too-many-clients' }.
// Errors of the piece: 409 { error: 'unreadable', reason } (story.json or style.json missing or not JSON);
// 500 { error: 'unwritable', reason } (the journal or story.json cannot be written; nothing was).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, watch, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { ROOT } from '../lib/browser.mjs';
import { hostAllowed, isWithin, loopbackHosts, staticFiles } from '../lib/static.mjs';

export { byteRange } from '../lib/static.mjs';
import { patternsBaseOf } from '../lib/patterns-base.mjs';
import { mixable } from '../sound.mjs';
import { ChangedSince, EditRefused, ExportBusy, ExportRunning, NoReceipt, SchemaRefused, StaleVersion, Unreadable, Unwritable, editStory, holdForExport, readJournal, readStory, readStyle, storyErrors, undoReceipt } from '../lib/story-edit.mjs';

const MAX_BODY = 1024 * 1024;
const MAX_CLIENTS = 32;
const DEBOUNCE_MS = 80;
const WATCHED = ['story.json', 'style.json', 'piece.css'];
const MM = join(ROOT, 'scripts', 'mm.mjs');
const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16);

class HttpError extends Error {
  constructor(status, body) { super(body?.reason ?? String(status)); this.status = status; this.body = body; }
}
const bad = (reason) => new HttpError(400, { error: 'bad-request', reason });

function send(res, status, body) {
  const text = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(text);
}

/** The request body as parsed JSON: 415 unless JSON, 413 past 1 MB, 400 when it does not parse. */
function readBody(req) {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  return new Promise((ok, fail) => {
    const chunks = [];
    let size = 0, tooBig = Number(req.headers['content-length'] ?? 0) > MAX_BODY;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) tooBig = true; if (!tooBig) chunks.push(c); });
    req.on('error', fail);
    req.on('end', () => {
      // the body is drained before answering, so the client always reads the status
      if (type !== 'application/json') return fail(new HttpError(415, { error: 'unsupported-media-type', reason: 'send application/json' }));
      if (tooBig) return fail(new HttpError(413, { error: 'too-large', reason: `a request body is at most ${MAX_BODY} bytes` }));
      try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch { fail(bad('the body is not JSON')); }
    });
  });
}

/** The pattern refs a patterns folder offers, by group ({ entrances: ['fade', …], … }): the page cannot list a folder. */
function listPatterns(base) {
  const out = {};
  const dirs = (d) => { try { return readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return []; } };
  for (const g of dirs(base)) out[g] = dirs(join(base, g)).filter((p) => existsSync(join(base, g, p, 'pattern.js')) || existsSync(join(base, g, p, 'pattern.html')));
  return out;
}

/** <dir>/out/<name> parsed, when written after `since` (ms); else null. */
function freshJson(dir, name, since) {
  try {
    const file = join(dir, 'out', name);
    return statSync(file).mtimeMs > since ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch { return null; }
}
const failRows = (report) => (report?.rules ?? []).filter((r) => r.status === 'FAIL');

/** The line of a step's output that says why it failed: its last `mm`, `sound:` or error line, else its
 *  last line that is not part of a stack trace. */
export function reasonOf(lines) {
  const plain = lines.filter((l) => !/^(at |node:|\^|[{}[\]]$|Node\.js v)/.test(l));
  return plain.findLast((l) => /^(mm[: ]|sound: |export refused|\w*Error\b)/.test(l)) ?? plain.at(-1) ?? '';
}

const EXPORT_LIMIT_MS = 30 * 60_000;   // a step that runs longer is stopped

// The code this process loaded. The page is read from disk at every reload, the server only once, so a
// studio left running across an update shows new controls that its old code refuses. The server
// fingerprints its own code at start and says when the disk no longer matches (the page asks for a
// restart). The page's own files (ui/) are left out: they are always fresh.
const CODE_ROOTS = ['scripts/studio', 'scripts/lib', 'scripts/check', 'scripts/check.mjs', 'scripts/sound.mjs', 'contracts'].map((p) => join(ROOT, p));
function codeFingerprint(roots) {
  const h = createHash('sha256');
  const walk = (p) => {
    let st;
    try { st = statSync(p); } catch { return; }
    if (st.isDirectory()) {
      if (p === join(ROOT, 'scripts', 'studio', 'ui')) return;
      for (const e of readdirSync(p).sort()) walk(join(p, e));
    } else if (/\.(m?js|json)$/.test(p)) h.update(p).update(readFileSync(p));
  };
  for (const r of roots) walk(r);
  return h.digest('hex');
}

export async function startStudio({ piece, port = 0, exportFps, codeRoots = CODE_ROOTS } = {}) {
  // exportFps: the frame rate `mm export` renders at (tests render at a low rate; the default is export's own)
  // codeRoots: the code whose change makes this process stale (tests pass a folder of their own)
  const loaded = codeFingerprint(codeRoots);
  const codeStale = () => codeFingerprint(codeRoots) !== loaded;
  const dir = resolve(piece);
  if (!isWithin(dir, ROOT) || dir === ROOT) throw Object.assign(new Error(`a piece must live under the repo root: ${dir}`), { code: 'EPIECE' });
  if (!existsSync(join(dir, 'story.json'))) throw Object.assign(new Error(`no story.json in ${dir}`), { code: 'EPIECE' });
  try { patternsBaseOf(dir); } catch (e) { throw Object.assign(new Error(e.message), { code: 'EPIECE' }); }
  const rel = relative(ROOT, dir).split(sep).join('/');
  const studioDir = join(dir, 'out', 'studio');
  const selectionFile = join(studioDir, 'selection.json');

  let selection = null;
  try { selection = JSON.parse(readFileSync(selectionFile, 'utf8')); } catch { /* none yet */ }
  const clients = new Set();
  let hosts = new Set(), origins = new Set();

  // ---- SSE and the watcher -------------------------------------------------------------------
  const broadcast = (event, data) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(msg); };
  const currentVersion = () => { try { return readStory(dir).version; } catch { return null; } };
  const journal = () => { try { return readJournal(dir); } catch { return []; } };
  const seen = new Map([['story.json', currentVersion()]]);   // story.json: its version; other files: a hash of their bytes
  for (const f of WATCHED.slice(1)) { try { seen.set(f, hash(readFileSync(join(dir, f)))); } catch { seen.set(f, null); } }

  // Who moved story.json from version `from` to `to`: the journal receipts appended since the
  // last attributed change that chain from `from` to `to` (several when writes fall in one debounce),
  // the last of them; null when no chain leads there (an outside hand, even one restoring an old version).
  let consumed = journal().length;
  function attribute(from, to) {
    const j = journal();
    let cur = from, last = null, upto = consumed;
    for (let i = consumed; i < j.length && cur !== to; i++) if (j[i].before === cur) { cur = j[i].after; last = j[i]; upto = i + 1; }
    if (!last || cur !== to) return null;
    consumed = upto;
    return last;
  }

  function report(file) {
    if (file === 'story.json') {
      let version = null, reason = null;
      try { version = readStory(dir).version; } catch (e) { reason = e instanceof Unreadable ? e.reason : String(e?.message ?? e); }
      const from = seen.get(file);
      if (version === from) return;   // a duplicate event, or still unreadable
      seen.set(file, version);
      if (!version) return broadcast('changed', { version: null, by: 'outside', file, error: 'unreadable', reason });
      const receipt = attribute(from, version);
      return broadcast('changed', { version, by: receipt ? receipt.who : 'outside', file, ...(receipt ? { receipt } : {}) });
    }
    let h = null;
    try {
      if (statSync(join(dir, file)).isDirectory()) return;   // a folder: its files report themselves
      h = hash(readFileSync(join(dir, file)));
    } catch { /* removed */ }
    if (h === (seen.get(file) ?? null)) return;   // same bytes, or a file that came and went
    seen.set(file, h);
    broadcast('changed', { version: currentVersion(), by: 'outside', file });
  }
  const timers = new Map();
  const later = (file) => { clearTimeout(timers.get(file)); timers.set(file, setTimeout(() => { timers.delete(file); report(file); }, DEBOUNCE_MS)); };
  // One watcher per folder (the piece folder, and every folder under assets/ even when it is made
  // later), never one per file: on Linux, Node's recursive watch follows each file's inode, so after
  // the first atomic write (a rename over story.json) every later change went unheard. A folder's
  // watcher names its children whatever replaced them. A folder that is new since the start reports
  // the files it already holds.
  const watchers = new Map();   // folder → { w, ino }
  const watchFolder = (abs, announce) => {
    let st = null;
    try { st = statSync(abs); } catch { /* gone */ }
    if (!st?.isDirectory()) {   // a file, or a folder removed: drop its watchers and those below it (its inode may come back)
      for (const [k, { w }] of watchers) if (k === abs || k.startsWith(abs + sep)) { w.close(); watchers.delete(k); }
      return;
    }
    const { ino } = st;
    if (watchers.get(abs)?.ino === ino) return;
    watchers.get(abs)?.w.close();
    let w;
    try { w = watch(abs, (ev, name) => heard(abs, name)); } catch { watchers.delete(abs); return; }
    w.on('error', () => { w.close(); if (watchers.get(abs)?.w === w) watchers.delete(abs); });
    watchers.set(abs, { w, ino });
    let entries = [];
    try { entries = readdirSync(abs, { withFileTypes: true }); } catch { /* gone again */ }
    for (const e of entries) {
      const f = relative(dir, join(abs, e.name)).split(sep).join('/');
      if (e.isDirectory()) { if (f === 'assets' || f.startsWith('assets/')) watchFolder(join(abs, e.name), announce); }
      else if (announce && f.startsWith('assets/')) later(f);
    }
  };
  function heard(abs, name) {
    if (name == null) { if (abs === dir) for (const f of WATCHED) later(f); else watchFolder(abs, true); return; }
    const f = relative(dir, join(abs, String(name))).split(sep).join('/');
    if (WATCHED.includes(f) || f.startsWith('assets/')) later(f);
    if (f === 'assets' || f.startsWith('assets/')) watchFolder(join(abs, String(name)), true);   // a folder (re)made; a file is a no-op
  }
  const watchPiece = () => watchFolder(dir, false);
  const ping = setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25_000);
  ping.unref();

  // ---- the gate, one run at a time -----------------------------------------------------------
  let queue = Promise.resolve();
  const inflight = new Map();
  function runCheck(format) {
    if (inflight.has(format)) return inflight.get(format);
    const file = join(dir, 'out', 'check.json');
    const run = queue.then(() => new Promise((ok, fail) => {
      const before = existsSync(file) ? statSync(file).mtimeMs : 0;
      const child = spawn(process.execPath, [MM, 'check', dir, '--format', format, '--quiet'], { stdio: 'ignore' });
      child.on('error', fail);
      child.on('exit', (code) => ok({ exit: code ?? 2, rules: freshJson(dir, 'check.json', before)?.rules ?? null }));
    }));
    const done = run.finally(() => inflight.delete(format));
    inflight.set(format, done);
    queue = done.catch(() => {});
    return done;
  }

  // ---- the export, one run at a time, across processes -----------------------------------------
  let exporting = null;      // the run in flight: { id, state, child, cancelled, cancel(), stopped, held (the export lock and the story it pins) }
  let lastExport = null;     // the last export event sent
  let runs = 0;
  const announce = (ev) => { lastExport = ev; broadcast('export', ev); };

  /** Runs one mm step inside the run's lock, its progress lines on the stream; resolves { code (null when
   *  killed or never started), reason }. A run cancelled before the step's turn never starts it. */
  function step(run, args, say) {
    if (run.cancelled) return Promise.resolve({ code: null, reason: '' });
    return new Promise((ok) => {
      const child = spawn(process.execPath, [MM, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, MM_EXPORT_LOCK: run.held.nonce } });
      run.child = child;
      const limit = setTimeout(() => child.kill('SIGTERM'), EXPORT_LIMIT_MS);
      const tail = [];
      let at = 0;
      const lines = (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) {
          const t = line.trim().split(ROOT + sep).join('').split(ROOT).join('.');
          if (!t) continue;
          tail.push(t); if (tail.length > 40) tail.shift();
          const now = Date.now();
          if (now - at > 150) { at = now; say({ line: t }); }   // at most a few a second
        }
      };
      child.stdout.on('data', lines);
      child.stderr.on('data', lines);
      child.on('error', (e) => { tail.push(e.message); });
      child.on('close', (code, signal) => { clearTimeout(limit); run.child = null; ok({ code: signal ? null : code, reason: reasonOf(tail) }); });
    });
  }
  /** The gate as a step: one at a time with the inspector's Run gate (a cancel does not wait for its turn). */
  function gateStep(run, say) {
    const turn = queue.then(() => step(run, ['check', dir, '--quiet', '--progress'], say));
    queue = turn.catch(() => {});
    return Promise.race([turn, run.stopped]);
  }

  /** What this run's `mm export` wrote, from the out/export.json it wrote: { files, poster }. */
  function written(since, formats) {
    const m = freshJson(dir, 'export.json', since);
    const list = !m ? [] : m.kind === 'deck' ? (m.walkthrough ? [{ format: formats[0], file: m.walkthrough.file }] : []) : (m.files ?? []);
    const files = list.flatMap(({ format, file }) => {
      if (!existsSync(file)) return [];
      const r = relative(ROOT, file).split(sep).join('/');
      return [{ format, path: r, url: `/${r}`, bytes: statSync(file).size }];
    });
    const poster = m?.poster && existsSync(m.poster) ? `/${relative(ROOT, m.poster).split(sep).join('/')}` : null;
    return { files, poster };
  }
  const sized = (files) => files.map((f) => ({ ...f, bytes: existsSync(join(ROOT, f.path)) ? statSync(join(ROOT, f.path)).size : f.bytes }));

  /** One Export; resolves its final event (sent once the lock is released). */
  async function runExport(run, { formats, force, sound }) {
    const { version } = run.held, id = run.id;
    const say = (ev) => announce({ id, formats, sound, force, version, state: run.state, ...ev });
    const final = (ev) => ({ id, formats, sound, force, version, ...ev });
    const at = (state) => { run.state = state; say({}); };
    const moved = () => currentVersion() !== version;
    const changed = (during) => final({ state: 'failed', reason: `story.json changed during ${during}, outside the studio (edits here wait while exporting): export again` });
    try {
      at('check');
      const since = Date.now() - 1;
      const gate = await gateStep(run, say);
      if (run.cancelled) return final({ state: 'cancelled', stage: 'check' });
      const report = freshJson(dir, 'check.json', since);
      if (moved() || (report && report.version !== version)) return changed('the check');
      if (gate.code !== 0 && gate.code !== 1) return final({ state: 'failed', reason: `mm check could not run: ${gate.reason || `exit ${gate.code}`}` });
      const rules = failRows(report);
      if (gate.code === 1 && !force) return final({ state: 'failed', failed: rules.map((r) => r.id), rules });
      at('export');
      const t0 = Date.now() - 1;
      const ex = await step(run, ['export', dir, '--formats', formats.join(','), ...(exportFps ? ['--fps', String(exportFps)] : []), ...(gate.code === 1 ? ['--force'] : [])], say);
      if (run.cancelled) return final({ state: 'cancelled', stage: 'export' });
      if (ex.code !== 0) return final({ state: 'failed', reason: ex.reason || `mm export exited ${ex.code}` });
      const { files, poster } = written(t0, formats);
      const done = { state: 'done', files, poster, unchecked: gate.code === 1 };
      if (!sound) return final({ ...done, ...(moved() ? { stale: true } : {}) });
      at('sound');
      const so = await step(run, ['sound', dir, '--formats', formats.join(',')], say);
      if (run.cancelled) return final({ state: 'cancelled', stage: 'sound', files: sized(files) });
      if (so.code !== 0) return final({ state: 'failed', reason: so.reason || `mm sound exited ${so.code}`, files: sized(files), soundFailed: true });
      // G-PEAK and W-LOUDNESS measure the muxed MP4s, so the gate runs again on the mix (as the skill's workflow does)
      at('recheck');
      const since2 = Date.now() - 1;
      const again = await gateStep(run, say);
      if (run.cancelled) return final({ state: 'cancelled', stage: 'recheck', files: sized(files) });
      const after = freshJson(dir, 'check.json', since2);
      const mixed = { ...done, files: sized(files), ...(moved() ? { stale: true } : {}) };
      if (again.code !== 0 && again.code !== 1) return final({ ...mixed, mixChecked: false, recheckReason: again.reason || `exit ${again.code}` });
      return final({ ...mixed, mixChecked: true, failed: failRows(after).map((r) => r.id), rules: failRows(after) });
    } catch (e) {
      return final({ state: 'failed', reason: String(e?.message ?? e).split(ROOT).join('.') });
    }
  }

  // ---- the API -------------------------------------------------------------------------------
  function writeSelection(sel) {
    mkdirSync(studioDir, { recursive: true });
    const tmp = `${selectionFile}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(sel, null, 2)}\n`);
    renameSync(tmp, selectionFile);
  }

  async function api(req, res, path) {
    const route = `${req.method} ${path}`;
    switch (route) {
      case 'GET /api/piece': {
        const { text, story, version } = readStory(dir);
        const style = readStyle(dir);   // 409 unreadable when missing or not JSON
        const base = patternsBaseOf(dir);
        return send(res, 200, { piece: rel, text, story, version, generator: story.generator ?? null, kind: story.kind, formats: story.formats, style, patternsBase: relative(ROOT, base).split(sep).join('/'), patterns: listPatterns(base), invalid: storyErrors(story), sound: mixable(story, style), codeStale: codeStale() });
      }
      case 'GET /api/journal': return send(res, 200, { receipts: journal() });
      case 'POST /api/edit': {
        const b = await readBody(req);
        if (!b || typeof b !== 'object' || Array.isArray(b)) throw bad('send { version, edits, label? }');
        if (typeof b.version !== 'string') throw bad('version is required: the version the edit was made against (GET /api/piece)');
        // the journal's author is the server's to say: a tag of the client's own goes in label
        if (b.who !== undefined && b.who !== 'studio') throw bad('who is always studio here; put a tag of your own in label');
        if (b.label !== undefined && b.label !== null && (typeof b.label !== 'string' || b.label.length > 200)) throw bad('label is a string of at most 200 characters');
        const r = await editStory(dir, { edits: b.edits, version: b.version, who: 'studio', label: b.label ?? undefined });
        report('story.json');   // now, not after the debounce
        return send(res, 200, r);
      }
      case 'POST /api/undo': {
        const b = (await readBody(req)) ?? {};
        if (typeof b !== 'object' || Array.isArray(b) || (b.receipt !== undefined && typeof b.receipt !== 'string')) throw bad('send { receipt? }: a receipt id, or nothing for the last');
        const r = await undoReceipt(dir, { receipt: b.receipt ?? 'last', who: 'studio' });
        report('story.json');
        return send(res, 200, r);
      }
      case 'GET /api/events': {
        if (clients.size >= MAX_CLIENTS) throw new HttpError(503, { error: 'too-many-clients', reason: `at most ${MAX_CLIENTS} event streams; close a studio tab` });
        res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`event: hello\ndata: ${JSON.stringify({ version: currentVersion() })}\n\n`);
        clients.add(res);
        req.on('close', () => clients.delete(res));
        return undefined;
      }
      case 'GET /api/selection':
        return send(res, 200, selection);
      case 'PUT /api/selection': {
        const b = await readBody(req);
        // the path names a scene or beat of the current story, the format one it ships
        const { story } = readStory(dir);
        const m = typeof b?.path === 'string' ? /^\/scenes\/(\d+)(?:\/variants\/([^/]+))?(?:\/beats\/(\d+))?$/.exec(b.path) : null;
        const sc = m ? story.scenes?.[Number(m[1])] : null;
        const beats = m?.[2] ? sc?.variants?.[m[2]]?.beats : sc?.beats;
        const okPath = b?.path === null || (sc && (m[3] === undefined ? !m[2] : Array.isArray(beats) && Number(m[3]) < beats.length));
        const okT = typeof b?.t === 'number' && Number.isFinite(b.t) && b.t >= 0;
        const okFormat = b?.format === null || story.formats.includes(b?.format);
        if (!b || typeof b !== 'object' || !okPath || !okT || !okFormat) throw bad(`send { path: "/scenes/<i>" | "/scenes/<i>/beats/<j>" | null, naming a scene or beat of the story, t: seconds, format: ${story.formats.map((f) => `"${f}"`).join(' | ')} | null }`);
        selection = { path: b.path, t: b.t, format: b.format };
        writeSelection(selection);
        return send(res, 200, selection);
      }
      case 'POST /api/check': {
        const b = await readBody(req);
        const { story } = readStory(dir);
        if (!b || typeof b.format !== 'string' || !story.formats.includes(b.format)) {
          throw new HttpError(422, { error: 'bad-format', reason: `the story ships ${story.formats.join(', ')}`, formats: story.formats });
        }
        return send(res, 200, await runCheck(b.format));
      }
      case 'POST /api/export': {
        const b = await readBody(req);
        const { story } = readStory(dir);
        const f = b?.formats;
        if (!Array.isArray(f) || !f.length || f.some((x, k) => typeof x !== 'string' || !story.formats.includes(x) || f.indexOf(x) !== k)) {
          throw new HttpError(422, { error: 'bad-formats', reason: `formats is a list of formats the story ships, each once: ${story.formats.join(', ')}`, formats: story.formats });
        }
        for (const k of ['force', 'sound']) if (b[k] !== undefined && typeof b[k] !== 'boolean') throw bad(`${k} is true or false`);
        const extra = Object.keys(b).filter((k) => !['formats', 'force', 'sound'].includes(k));
        if (extra.length) throw bad(`send { formats, force?, sound? } only, not ${extra.join(', ')}`);
        if (exporting) throw new HttpError(409, { error: 'busy', reason: 'an export of this piece is running; wait for it, or cancel it' });
        let held;   // the export lock, taken under the journal lock, and the story it pins
        try { held = holdForExport(dir, { by: 'mm studio' }); } catch (e) { if (e instanceof ExportBusy) throw new HttpError(409, { error: 'busy', reason: e.message }); throw e; }
        let stop;
        const run = exporting = { id: `${Date.now().toString(36)}-${++runs}`, child: null, cancelled: false, held, state: 'check', stopped: new Promise((r) => { stop = r; }) };
        run.cancel = () => { run.cancelled = true; run.child?.kill('SIGTERM'); stop({ code: null, reason: '' }); };
        runExport(run, { formats: f, force: b.force === true, sound: b.sound === true }).then((ev) => {
          held.release();   // before the final event, so an edit sent on `done` is not refused
          exporting = null;
          announce(ev);
        });
        return send(res, 202, { state: 'check', formats: f, id: run.id });
      }
      case 'GET /api/export':
        return send(res, 200, lastExport);
      case 'POST /api/export/cancel': {
        await readBody(req);   // JSON only, as every write
        if (!exporting) throw new HttpError(409, { error: 'idle', reason: 'no export is running' });
        exporting.cancel();   // the gate writes no report, export removes what it staged
        return send(res, 200, { cancelled: true });
      }
    }
    const known = ['/api/piece', '/api/edit', '/api/undo', '/api/events', '/api/selection', '/api/check', '/api/export', '/api/export/cancel'];
    throw known.includes(path) ? new HttpError(405, { error: 'method-not-allowed' }) : new HttpError(404, { error: 'not-found' });
  }

  // ---- files ---------------------------------------------------------------------------------
  const file = staticFiles(ROOT);

  const server = createServer((req, res) => {
    if (!hostAllowed(req, hosts)) { res.writeHead(403); return res.end(); }
    const rawPath = String(req.url ?? '/').split('?')[0].split('#')[0] || '/';
    const isApi = rawPath.startsWith('/api/');
    const o = req.headers.origin;
    if (o !== undefined && !origins.has(String(o).toLowerCase()) && (isApi || req.method === 'POST' || req.method === 'PUT')) { res.writeHead(403); return res.end(); }
    if (!isApi) return file(req, res, rawPath);
    api(req, res, rawPath).catch((e) => {
      if (res.headersSent) return res.end();
      if (e instanceof HttpError) return send(res, e.status, e.body);
      if (e instanceof StaleVersion) { let text = null; try { text = readStory(dir).text; } catch { /* gone */ } return send(res, 409, { error: 'stale', version: e.current, text }); }
      if (e instanceof ChangedSince) return send(res, 409, { error: 'changed', version: e.current });
      if (e instanceof NoReceipt) return send(res, 404, { error: 'no-receipt', reason: e.message });
      if (e instanceof EditRefused) return send(res, 422, { error: 'refused', code: e.code, reason: e.reason, hint: e.hint, index: e.index ?? null });
      if (e instanceof SchemaRefused) return send(res, 422, { error: 'schema', of: e.of, errors: e.errors });
      if (e instanceof Unreadable) return send(res, 409, { error: 'unreadable', reason: e.reason });
      if (e instanceof Unwritable) return send(res, 500, { error: 'unwritable', reason: e.reason });
      if (e instanceof ExportRunning) return send(res, 409, { error: 'exporting', reason: e.reason });
      return send(res, 500, { error: 'internal', reason: String(e?.message ?? e).split(ROOT).join('.') });
    });
  });

  // listen before watching, so a busy or forbidden port leaves nothing open
  try { await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); }); } catch (e) { clearInterval(ping); throw e; }
  const { port: p, address } = server.address();
  hosts = loopbackHosts(p);
  origins = new Set([`http://127.0.0.1:${p}`, `http://localhost:${p}`]);
  watchPiece();

  async function close() {
    if (exporting) { exporting.cancel(); exporting.held.release(); }
    for (const { w } of watchers.values()) w.close();
    for (const t of timers.values()) clearTimeout(t);
    clearInterval(ping);
    for (const c of clients) c.end();
    clients.clear();
    server.closeAllConnections?.();
    await new Promise((r) => server.close(r));
  }
  return { url: `http://127.0.0.1:${p}`, port: p, address, piece: rel, close };
}
