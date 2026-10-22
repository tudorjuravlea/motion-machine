// mm export [piece] [--fps 30] [--sub 1] [--formats 9x16,1x1,4x5,16x9] [--force] [--prove] [--workers N]   (SPEC §2.8, §2.10, §8)
//   film: out/<id>-<format>.mp4 per format · out/poster.png · out/loop_check.mp4 · out/export.json
//   both: out/share-copy.txt, one caption (the story's `share`, else its hook, closing headline and link)
//   deck: out/deck/ (standalone) · out/handout.pdf (one page per rest, set in the brand's bundled faces) ·
//         out/walkthrough.mp4 (starts on rest 0; every press plays its transition, then holds its rest)
// --sub defaults to 1 (blending instants ghosts moving text). Above 1 the gate's W-SUB hook is
// asked whether this piece would ghost, and a WARN lands in the manifest and on stderr.
// Refuses while out/check.json is missing, holds a FAIL, did not finish, names another story version
// or does not cover a format asked for (exit 1) unless --force, which stamps the
// MP4 metadata comment `UNCHECKED`. One export of a piece at a time: it holds out/export.lock for its
// run (a second exporter exits 2), and the story it pinned must still be story.json when the
// render ends, or nothing is renamed into out/ (exit 1). The poster and loop check are frames of the
// story's first format, so they are written only when that format is in the run.
// --prove renders every frame a second time in a fresh page, in reverse order, and exits 1 on any
// byte difference (order independence, SPEC §2.5).
// --workers N (films; default max(1, min(4, floor(cpus / 2))), at most 16) draws frames in N pages and
// feeds the one encoder in order (see renderFilm); decks draw in one page. out/export.json
// records `workers` (and `workersRequested` when above 16), the pages that drew each file (`pages`)
// and the capture seconds (`captureS`, per file and in all).
// A film's outputs (MP4s, GIFs, poster, loop check) are written under staged `.partial` names and
// renamed together only once every format is in: a run that fails, or is interrupted, leaves out/
// as the previous run left it. Interrupted (Ctrl-C, SIGTERM, SIGHUP, a closed output pipe),
// it removes what it staged, stops ffmpeg and Chromium, and exits 130, 143, 129 or 141.
// What is deterministic: the frames (PNG SHA-256, whatever --workers), hence the encoded streams; and,
// as the encoder's mux does not depend on arrival timing (ffmpeg.mjs, -max_interleave_delta 0), the
// MP4's bytes for the same frames, ffmpeg build and arguments.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { extname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, VIEWPORTS, framePng, openPiece, serveRoot, launchBrowser } from './lib/browser.mjs';
import { ExportBusy, Unreadable, holdForExport } from './lib/story-edit.mjs';
import { versionOf } from './lib/story-version.mjs';
import { UsageError, fontFiles, resolvePiece, runMain } from './lib/cli.mjs';
import { isSafeFamily, unsafeStyleValues } from './lib/style-values.mjs';
import { assertTools, loopSeam, probe, runFfmpeg, ssim, startEncoder } from './lib/ffmpeg.mjs';
import { buildStandalone } from './lib/standalone.mjs';
import { momentsOf } from './stills.mjs';

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const log = (...a) => process.stderr.write(a.join(' ') + '\n');

/**
 * { ok, why } from out/check.json: refuses a missing report, one that did not finish, one of another
 * story `version` (or naming none), one that does not cover each of `formats`, and any FAIL row.
 */
export function gateStatus(dir, { formats = [], version } = {}) {
  const file = join(dir, 'out', 'check.json');
  if (!existsSync(file)) return { ok: false, why: `out/check.json is missing: run \`mm check\` first` };
  let report;
  try { report = JSON.parse(readFileSync(file, 'utf8')); } catch { return { ok: false, why: 'out/check.json is not valid JSON: run `mm check` again' }; }
  if (report.complete === false) return { ok: false, why: 'the last `mm check` did not finish (exit 2): run it again' };
  if (version !== undefined && !report.version) return { ok: false, why: 'out/check.json does not say which story it checked (an older gate wrote it): run `mm check` again' };
  if (version !== undefined && report.version !== version) return { ok: false, why: 'story.json changed since mm check ran: run `mm check` again' };
  const missing = formats.filter((f) => !(report.formats ?? []).includes(f));
  if (missing.length) return { ok: false, why: `out/check.json does not cover ${missing.join(', ')} (it checked ${(report.formats ?? []).join(', ') || 'no named format'}): run \`mm check\` without --format` };
  const failed = (report.rules ?? []).filter((r) => r.status === 'FAIL').map((r) => r.id);
  return failed.length ? { ok: false, why: `mm check failed: ${failed.join(', ')}` } : { ok: true };
}

/** Throws when story.json is no longer the version the export pinned: an outside editor wrote it mid-render. */
function assertPinned(dir, version) {
  let now = null;
  try { now = versionOf(readFileSync(join(dir, 'story.json'), 'utf8')); } catch { /* gone: not the pinned story */ }
  if (now !== version) throw new UsageError("story.json changed during the export (an editor outside the studio and `mm timeline`?): the render was not kept (a film keeps its earlier MP4s, poster and loop check); run `mm check` and export again", 1);
}

// The caption (brag, MIT, restated): one, postable as is, out of copy the story already holds.
export const SHARE_CLICHES = ['excited to share', 'thrilled to announce', 'proud to announce', 'streamline your workflow', 'supercharge', 'game-changer', 'revolutionize'];
const sentence = (s) => (/[.!?…]$/.test(s) ? s : `${s}.`);

/** { text, source: 'story' | 'composed', banned[] }: the story's `share`, else hook + closing headline + link. */
export function shareCopy(story) {
  let text, source;
  if (story.share?.trim()) { text = story.share.trim(); source = 'story'; } else {
    const lead = (sc) => (sc?.beats.find((b) => b.slot === 'headline' && b.text?.trim()) ?? sc?.beats.find((b) => b.text?.trim()))?.text.trim();
    const lines = [...new Set([lead(story.scenes[0]), lead(story.scenes.at(-1))].filter(Boolean).map(sentence))];
    const link = story.cta?.url?.trim() || (story.cta?.text?.trim() && sentence(story.cta.text.trim()));
    text = [lines.join(' '), link].filter(Boolean).join('\n');
    source = 'composed';
  }
  const low = text.toLowerCase();
  return { text, source, banned: SHARE_CLICHES.filter((c) => low.includes(c)) };
}

const even = (n) => n - (n % 2);

/** Frame n of a film at `fps`, with `sub` instants ending on the frame itself (the last of each group is kept). */
export const instantsOfFrame = (n, fps, sub) => Array.from({ length: sub }, (_, j) => Math.max(0, (n - (sub - 1 - j) / sub) / fps));

/**
 * `--workers` when none is given: half the cores, at least 1, at most 4. `MM_WORKERS` (a positive whole
 * number) lowers that further, for a machine that runs many exports at once, such as a test run.
 */
export const defaultWorkers = () => {
  const auto = Math.max(1, Math.min(4, Math.floor(cpus().length / 2)));
  const cap = Number(process.env.MM_WORKERS);
  return Number.isInteger(cap) && cap >= 1 ? Math.min(auto, cap) : auto;
};

/** `--workers` at most: past this, pages only compete for the CPU, and held chunks grow. */
export const MAX_WORKERS = 16;

/** Frames per chunk at most: a chunk is a contiguous range that one page draws in order. */
export const CHUNK_FRAMES = 15;

// Interruption. While an export runs, a signal or a closed stdout/stderr pipe (`| head`)
// kills the live encoders, waits for them to go, removes every staged file and exits 128 + the
// signal (141 for the pipe); Playwright's own exit handler then kills Chromium. The browser is
// launched without Playwright's signal handlers: its SIGTERM handler closes the browser and never
// exits, which left a process that ignored SIGTERM.
const live = { encoders: new Set(), staged: new Set() };
const removeQuietly = (file) => { try { rmSync(file, { force: true }); } catch { /* a directory, not ours to remove */ } };
const dropLive = () => { for (const e of live.encoders) e.kill(); for (const f of live.staged) removeQuietly(f); };
const SIGNAL_EXIT = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
let interrupted = false;
async function interrupt(code) {
  if (interrupted) return;
  interrupted = true;
  const encoders = [...live.encoders];
  await Promise.race([Promise.all(encoders.map((e) => e.abort())), new Promise((r) => setTimeout(r, 2000))]);
  dropLive();
  process.exit(code);
}
const onSignal = (sig) => interrupt(SIGNAL_EXIT[sig]);
const onPipeError = (e) => { if (e.code === 'EPIPE') interrupt(141); else throw e; };
/** Installs the interruption handlers; returns the function that removes them. */
function guardInterrupts() {
  for (const sig of Object.keys(SIGNAL_EXIT)) process.on(sig, onSignal);
  process.on('exit', dropLive);
  process.stdout.on('error', onPipeError);
  process.stderr.on('error', onPipeError);
  return () => {
    for (const sig of Object.keys(SIGNAL_EXIT)) process.off(sig, onSignal);
    process.off('exit', dropLive);
    process.stdout.off('error', onPipeError);
    process.stderr.off('error', onPipeError);
  };
}
/** An encoder writing `out`, known to the interruption handlers until it ends or is aborted. */
function liveEncoder(opts) {
  const enc = startEncoder(opts);
  live.encoders.add(enc);
  return { ...enc, end: () => enc.end().finally(() => live.encoders.delete(enc)), abort: () => enc.abort().finally(() => live.encoders.delete(enc)) };
}

/**
 * Runs jobs 0..count-1 on `workers` concurrent workers (`run(worker, job, stopped)`) and hands each
 * result to `take(job, result)` strictly in job order. A
 * worker may not start job c while c > next + workers (next: the job `take` needs), so at most
 * workers + 1 results are ever held. The first error, from a run or from `take` (a dead encoder),
 * stops every worker before its next job (a run may poll `stopped()` to stop sooner) and is thrown
 * once all have returned.
 */
export async function orderedPool({ count, workers, run, take }) {
  const results = new Map();
  let claim = 0, next = 0, failure = null;
  const waiting = [];
  const wake = () => { for (const r of waiting.splice(0)) r(); };
  const sleep = () => new Promise((r) => waiting.push(r));
  const fail = (e) => { failure ??= e; wake(); };
  const stopped = () => failure !== null;
  const worker = async (wk) => {
    try {
      for (;;) {
        while (!failure && claim < count && claim > next + workers) await sleep();
        if (failure || claim >= count) return;
        const c = claim++;
        const r = await run(wk, c, stopped);
        if (failure) return;
        results.set(c, r); wake();
      }
    } catch (e) { fail(e); }
  };
  const sequencer = async () => {
    try {
      while (next < count) {
        while (!failure && !results.has(next)) await sleep();
        if (failure) return;
        const r = results.get(next); results.delete(next);
        await take(next, r);
        next++; wake();
      }
    } catch (e) { fail(e); }
  };
  await Promise.all([sequencer(), ...Array.from({ length: workers }, (_, wk) => worker(wk))]);
  if (failure) throw failure;
}

/** Test-only: MM_EXPORT_FAIL_FRAME=<n> or <format>:<n> names the frame whose page throws, as a broken worker would. */
const failFrameFor = (format) => {
  const m = /^(?:([^:]+):)?(\d+)$/.exec(process.env.MM_EXPORT_FAIL_FRAME ?? '');
  return m && (!m[1] || m[1] === format) ? Number(m[2]) : -1;
};

/**
 * Parallel capture. The film's frames are cut into contiguous chunks; each of
 * `workers` pages (one browser, one context per page, as openPiece makes them) takes the next
 * undrawn chunk and draws it in order, and orderedPool hands the chunks to the one encoder strictly
 * in frame order, holding at most `pages + 1` chunks of PNGs. One page runs the same pool.
 * The MP4 goes to `out` (a staged name, renamed by exportFilm); any failure kills the encoder.
 * Test-only hooks (inert unless set): MM_EXPORT_FAIL_FRAME (failFrameFor) and
 * MM_EXPORT_HASHES=<file> (read in exportFilm), which writes { format: [frame SHA-256] }.
 */
async function renderFilm({ dir, format, fps, sub, out, comment, shared, wantPoster, workers = 1 }) {
  const t0 = performance.now();
  const failFrame = failFrameFor(format);
  const opened = [await openPiece(dir, { format, ...shared })];
  let enc = null;
  try {
    const lead = opened[0];
    const { duration } = await lead.mm.meta();
    if (!duration) throw new UsageError('not a film: window.mm.duration is missing');
    // The poster is the film's first rest: the title scene once everything in it has arrived.
    const posterAt = wantPoster ? Math.min(Math.round(duration * fps) - 1, Math.round(((await framePerSchedule(lead)).rests[0] ?? 0) * fps)) : -1;
    const frames = Math.round(duration * fps);
    const { width, height } = lead.viewport;
    const size = Math.max(1, Math.min(CHUNK_FRAMES, Math.ceil(frames / workers)));
    const chunks = Array.from({ length: Math.ceil(frames / size) }, (_, c) => [c * size, Math.min(frames, (c + 1) * size)]);
    const pages = Math.min(workers, chunks.length);
    if (pages > 1) {   // every page that opens is closed below, even when another fails to open
      const more = await Promise.allSettled(Array.from({ length: pages - 1 }, () => openPiece(dir, { format, ...shared })));
      opened.push(...more.filter((m) => m.status === 'fulfilled').map((m) => m.value));
      const bad = more.find((m) => m.status === 'rejected');
      if (bad) throw bad.reason;
    }
    // a request that fails while frames are drawn (a missing sequence frame) stops the export
    const failedRequests = [];
    const onResponse = (r) => { if (r.status() >= 400) failedRequests.push(`${new URL(r.url()).pathname} (${r.status()})`); };
    const onFailed = (r) => failedRequests.push(`${new URL(r.url()).pathname} (${r.failure()?.errorText ?? 'failed'})`);
    for (const o of opened) { o.page.on('response', onResponse); o.page.on('requestfailed', onFailed); }

    /** The `sub` instants of frame n, as PNGs, drawn on `page`. */
    const draw = async (page, n) => {
      if (n === failFrame) throw new Error(`MM_EXPORT_FAIL_FRAME: the page drawing frame ${n} of ${format} was told to throw`);
      const pngs = [];
      for (const t of instantsOfFrame(n, fps, sub)) pngs.push(await framePng(page, t));
      return pngs;
    };
    enc = liveEncoder({ out, fps, sub, comment });
    const hashes = [];
    let first = null, last = null, posterPng = null;
    /** Frame n reaches the encoder: only ever called in frame order. */
    const take = async (n, pngs) => {
      for (const png of pngs) await enc.write(png);
      const png = pngs.at(-1);
      hashes.push(sha(png));
      if (n === 0) first = png;
      if (n === frames - 1) last = png;
      if (n === posterAt) posterPng = png;
      if (n % 30 === 0) log(`  ${format}: frame ${n + 1}/${frames}`);
    };

    await orderedPool({ count: chunks.length, workers: pages,
      run: async (wk, c, stopped) => {
        const drawn = [];
        for (let n = chunks[c][0]; n < chunks[c][1] && !stopped(); n++) drawn.push(await draw(opened[wk].page, n));
        return drawn;
      },
      take: async (c, drawn) => { for (const [k, pngs] of drawn.entries()) await take(chunks[c][0] + k, pngs); } });
    for (const o of opened) { o.page.off('response', onResponse); o.page.off('requestfailed', onFailed); }
    if (failedRequests.length) throw new Error(`${failedRequests.length} request${failedRequests.length > 1 ? 's' : ''} failed while drawing ${format}, so frames are wrong: ${failedRequests.slice(0, 5).join(', ')}`);
    await enc.end();
    enc = null;
    const errors = [...new Set(opened.flatMap((o) => o.errors))];
    return { duration, frames, width: even(width), height: even(height), hashes, first, last, poster: posterPng, errors, warnings: (await lead.mm.meta()).warnings,
      pages, captureS: Math.round((performance.now() - t0) / 10) / 100 };
  } finally {
    if (enc) await enc.abort();
    await Promise.all(opened.map((o) => o.close()));
  }
}

/** Hashes of `instants` (film seconds or deck presses), rendered in a fresh page, optionally last to first. */
async function hashInstants({ dir, format, instants, reverse = false, shared }) {
  const opened = await openPiece(dir, { format, ...shared });
  try {
    const order = instants.map((_, i) => i);
    if (reverse) order.reverse();
    const out = new Array(instants.length);
    for (const i of order) out[i] = sha(await framePng(opened.page, instants[i]));
    return out;
  } finally {
    await opened.close();
  }
}

const mismatches = (a, b, label = (i) => i) => a.flatMap((h, i) => (h === b[i] ? [] : [label(i)]));

async function exportFilm(dir, story, o, shared, manifest) {
  const outDir = join(dir, 'out');
  const formats = o.formats ?? story.formats;
  manifest.files = [];
  manifest.captureS = 0;
  const frameHashes = {};
  // Every output is written under a staged name, and the set is renamed only once every format is in
  //: a failure in a later format leaves the previous run's files, and its export.json, as they were.
  const staged = [];
  const stage = (final) => { const tmp = final.replace(/(\.[^./]+)$/, '.partial$1'); staged.push([tmp, final]); live.staged.add(tmp); return tmp; };
  try {
    for (const format of formats) {
      const out = join(outDir, `${story.id}-${format}.mp4`);
      const mp4 = stage(out);
      log(`export ${format} → ${out}`);
      const first = format === story.formats[0];   // the poster and loop check are the story's first format's
      const r = await renderFilm({ dir, format, fps: o.fps, sub: o.sub, out: mp4, comment: o.comment, shared, wantPoster: first, workers: o.workers });
      frameHashes[format] = r.hashes;
      manifest.captureS = Math.round((manifest.captureS + r.captureS) * 100) / 100;
      log(`  ${format}: ${r.frames} frames captured in ${r.captureS} s by ${r.pages} page${r.pages > 1 ? 's' : ''}`);
      const info = probe(mp4);
      const v = info.streams.find((s) => s.codec_type === 'video');
      manifest.files.push({ format, file: out, width: v.width, height: v.height, fps: o.fps, sub: o.sub, frames: Number(v.nb_read_frames ?? v.nb_frames), duration: r.duration, comment: o.comment ?? null, captureS: r.captureS, pages: r.pages });
      if (o.gif) {
        // a looping GIF from the MP4: one palette for the whole film, no dither (dither flickers flat colour)
        const gif = join(outDir, `${story.id}-${format}.gif`);
        const gifTmp = stage(gif);
        const width = o.gifWidth ?? 540;
        await runFfmpeg(['-i', mp4, '-vf', `fps=${Math.min(15, o.fps)},scale=${width}:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none`, '-loop', '0', gifTmp]);
        (manifest.gifs ??= []).push({ format, file: gif, width, bytes: statSync(gifTmp).size });
        log(`  gif: ${gif} (${(statSync(gifTmp).size / 1e6).toFixed(2)} MB)`);
      }
      for (const e of [...r.errors, ...r.warnings]) log(`  warning: ${e}`);
      if (first) {
        writeFileSync(stage(join(outDir, 'poster.png')), r.poster ?? r.first);
        manifest.poster = join(outDir, 'poster.png');
        const similarity = await ssim(r.last, r.first);
        await loopSeam(mp4, stage(join(outDir, 'loop_check.mp4')), { duration: r.duration, comment: o.comment });
        manifest.loop = { ssim: Math.round(similarity * 1e4) / 1e4, file: join(outDir, 'loop_check.mp4'), method: 'SSIM of the last frame against the first' };
      }
      if (o.prove) {
        const instants = Array.from({ length: r.frames }, (_, n) => n / o.fps);
        const again = await hashInstants({ dir, format, instants, reverse: true, shared });
        const bad = mismatches(r.hashes, again, (n) => `${(n / o.fps).toFixed(3)}s`);
        (manifest.prove ??= []).push({ format, frames: r.frames, mismatches: bad });
      }
    }
    assertPinned(dir, o.version);
    for (const [tmp, final] of staged) renameSync(tmp, final);
  } finally {
    for (const [tmp] of staged) { removeQuietly(tmp); live.staged.delete(tmp); }
  }
  if (process.env.MM_EXPORT_HASHES) writeFileSync(process.env.MM_EXPORT_HASHES, JSON.stringify(frameHashes));   // test-only
}

async function framePerSchedule(opened) {
  return opened.page.evaluate(() => { const s = window.mm.schedule; return { kind: s.kind, rests: s.rests, events: s.events, pressLengths: s.pressLengths ?? null }; });
}

/** Seconds each rest holds in a deck's walkthrough, after the press's transition has played. */
export const WALK_HOLD_S = 2;

async function exportDeck(dir, story, o, shared, manifest) {
  const outDir = join(dir, 'out');
  const format = (o.formats ?? story.formats)[0];
  const style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
  assertHandoutStyle(style);   // before any frame is rendered
  const standalone = buildStandalone(dir, join(outDir, 'deck'), { story, style });
  manifest.deck = { dir: standalone.dir, modules: standalone.modules, warnings: standalone.warnings };
  for (const w of standalone.warnings) log(`  warning: ${w}`);

  const opened = await openPiece(dir, { format, ...shared });
  try {
    const { presses } = await opened.mm.meta();
    const sched = await framePerSchedule(opened);
    const rests = Array.from({ length: presses + 1 }, (_, n) => n);
    const pngs = [];
    for (const n of rests) pngs.push(await framePng(opened.page, n));
    const sceneOf = (n) => story.scenes.find((sc, i) => (n === 0 ? i === 0 : n > prefix(story, i) && n <= prefix(story, i) + sc.presses));

    // handout.pdf: one page per rest, the scene's `say` as notes
    const pdfPage = await shared.browser.newPage();
    await pdfPage.setContent(handoutHtml({ story, style, dir, pngs, rests, sceneOf, viewport: opened.viewport }), { waitUntil: 'load' });
    await pdfPage.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]));
    await pdfPage.pdf({ path: join(outDir, 'handout.pdf'), width: '297mm', height: '210mm', printBackground: true, preferCSSPageSize: true });
    await pdfPage.close();
    manifest.handout = { file: join(outDir, 'handout.pdf'), pages: rests.length };

    // walkthrough.mp4: starts on rest 0; each press plays its transition at its real length, then holds its rest
    // (staged and renamed when complete; a dead ffmpeg fails the export at once)
    const out = join(outDir, 'walkthrough.mp4');
    const tmp = join(outDir, 'walkthrough.partial.mp4');
    live.staged.add(tmp);
    const enc = liveEncoder({ out: tmp, fps: o.fps, comment: o.comment });
    let frames = 0;
    const hold = async (png) => { for (let k = 0; k < Math.round(WALK_HOLD_S * o.fps); k++) { await enc.write(png); frames++; } };
    try {
      await hold(pngs[0]);
      for (const n of rests.slice(1)) {
        const steps = Math.max(1, Math.round((sched.pressLengths?.[n] ?? 0) * o.fps));
        for (let k = 1; k < steps; k++) { await enc.write(await framePng(opened.page, n - 1 + k / steps)); frames++; }
        await hold(pngs[n]);
      }
      await enc.end();
      assertPinned(dir, o.version);
      renameSync(tmp, out);
    } catch (e) {
      await enc.abort();
      throw e;
    } finally { removeQuietly(tmp); live.staged.delete(tmp); }
    const v = probe(out).streams.find((s) => s.codec_type === 'video');
    manifest.walkthrough = { file: out, width: v.width, height: v.height, fps: o.fps, seconds: frames / o.fps, holdS: WALK_HOLD_S, transitions: presses, comment: o.comment ?? null };
    for (const e of opened.errors) log(`  warning: ${e}`);

    if (o.prove) {
      const { rests: r, mids } = momentsOf({ ...sched, kind: 'deck' });
      const instants = [...r, ...mids].map((m) => m.t);
      const a = await hashInstants({ dir, format, instants, shared });
      const b = await hashInstants({ dir, format, instants, reverse: true, shared });
      (manifest.prove ??= []).push({ format, frames: instants.length, mismatches: mismatches(a, b, (i) => `press ${instants[i]}`) });
    }
  } finally {
    await opened.close();
  }
}

const prefix = (story, i) => story.scenes.slice(0, i).reduce((s, sc) => s + sc.presses, 0);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const FONT_MIME = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

/** @font-face rules that carry the style's own font files inside the page (data URIs), so the PDF is set in the brand's faces and never in a system font. */
export function handoutFontFaces(style, dir) {
  return fontFiles(style).flatMap(({ family, file }) => {
    const abs = join(dir, file.src);
    if (!existsSync(abs) || !isSafeFamily(family)) return [];
    const data = readFileSync(abs).toString('base64');
    return [`@font-face { font-family: "${family}"; font-weight: ${file.weight}; src: url(data:${FONT_MIME[extname(abs).toLowerCase()] ?? 'font/woff2'};base64,${data}); ${file.unicodeRange ? `unicode-range: ${file.unicodeRange}; ` : ''}}`];
  }).join('\n  ');
}

/** Refuses a style whose font family or colour could end the handout's <style> element (a captured brand takes both from a page the author does not control). */
export function assertHandoutStyle(style) {
  const problems = unsafeStyleValues(style);
  if (problems.length) throw new UsageError(`the handout cannot be built from this style: ${problems.join('; ')}`, 2);
}

export function handoutHtml({ story, style, dir, pngs, rests, sceneOf, viewport }) {
  assertHandoutStyle(style);
  const total = rests.length - 1;
  const text = style.type?.text?.family ?? style.type?.display?.family ?? 'serif', display = style.type?.display?.family ?? text, mono = style.type?.mono?.family ?? text;
  const c = style.color ?? {};
  // The slide sits in a frame of its own aspect ratio, so no bars: fit the viewport into 273 x 146 mm.
  const k = Math.min(273 / viewport.width, 146 / viewport.height);
  const fw = (viewport.width * k).toFixed(2), fh = (viewport.height * k).toFixed(2);
  const seen = new Set();
  return `<!doctype html><meta charset="utf-8"><title>${esc(story.title)}</title><style>
  ${handoutFontFaces(style, dir)}
  @page { size: 297mm 210mm; margin: 0; }
  html, body { margin: 0; background: ${c.canvas ?? '#fff'}; color: ${c.ink ?? '#111'}; font: 11pt/1.45 "${text}", serif; }
  .pg { box-sizing: border-box; width: 297mm; height: 210mm; padding: 11mm 12mm; overflow: hidden; break-after: page; display: flex; flex-direction: column; gap: 5mm; }
  .pg:last-child { break-after: auto; }
  .hd { display: flex; justify-content: space-between; font: 9pt "${mono}", monospace; color: ${c.muted ?? '#555'}; }
  .hd b { font: 700 10pt "${display}", serif; color: ${c.ink ?? '#111'}; }
  .frame { width: ${fw}mm; height: ${fh}mm; box-shadow: 0 0 0 .3mm ${c.line ?? '#ccc'}; }
  .frame img { display: block; width: 100%; height: 100%; }
  .say { font-size: 12pt; }
  .more { font-size: 10pt; color: ${c.muted ?? '#555'}; }
  </style><body>${rests.map((n, i) => {
    const sc = sceneOf(n);
    const first = sc && !seen.has(sc.id);
    if (sc) seen.add(sc.id);
    const note = first ? (sc.say ? `<div class="say">${esc(sc.say)}</div>` : '') : `<div class="more">${esc(sc?.id)} continues</div>`;
    return `<section class="pg"><div class="hd"><b>${esc(story.title)}</b><span>rest ${n} of ${total}${sc ? ` · ${esc(sc.id)}` : ''}</span></div>
    <div class="frame"><img alt="rest ${n}" src="data:image/png;base64,${pngs[i].toString('base64')}"></div>${note}</section>`;
  }).join('')}</body>`;
}

/** The gate's W-SUB row for exporting `story` at `sub` (null when the gate lane's hook is absent). `o.subHook` replaces it in tests. */
async function subRow(story, sub, hook, dir) {
  try {
    const fn = hook ?? (await import('./check/W-SUB.mjs')).subWarning;
    return typeof fn === 'function' ? await fn(story, sub, { dir }) : null;
  } catch (e) { return { id: 'W-SUB', status: 'SKIP', evidence: { reason: `the W-SUB hook could not run: ${e.message}` } }; }
}

/** Exports a piece; returns { manifest, code } (code 1 when --prove found a difference). */
export async function exportPiece(dir, opts = {}) {
  const o = { fps: 30, sub: 1, force: false, prove: false, ...opts };
  if (!(o.fps > 0) || !Number.isInteger(o.sub) || o.sub < 1) throw new UsageError('--fps must be positive and --sub a whole number of at least 1');
  o.workers ??= defaultWorkers();
  if (!Number.isInteger(o.workers) || o.workers < 1) throw new UsageError('--workers must be a whole number of at least 1');
  const workersRequested = o.workers;
  o.workers = Math.min(o.workers, MAX_WORKERS);
  assertTools();
  let held;
  try { held = holdForExport(dir, { by: 'mm export' }); } catch (e) { throw e instanceof ExportBusy ? new UsageError(`export refused: ${e.message}`, 2) : e instanceof Unreadable ? new UsageError(e.reason, 2) : e; }
  try { return await exportHeld(dir, o, held, workersRequested); } finally { held.release(); }
}

/** exportPiece, holding the piece's export lock: `held` is the story it pinned ({ story, version }). */
async function exportHeld(dir, o, { story, version }, workersRequested) {
  o.version = version;
  const formats = o.formats ?? story.formats;
  if (story.kind !== 'deck') for (const format of formats) if (!VIEWPORTS[format]) throw new UsageError(`unknown format ${format}`);   // before any page opens
  const gate = gateStatus(dir, { formats: story.kind === 'deck' ? formats.slice(0, 1) : formats, version });
  if (!gate.ok && !o.force) throw new UsageError(`export refused: ${gate.why} (--force exports anyway and stamps UNCHECKED)`, 1);
  if (!gate.ok) { o.comment = 'UNCHECKED'; log(`warning: ${gate.why}; --force given, the media is stamped UNCHECKED`); }
  mkdirSync(join(dir, 'out'), { recursive: true });
  // a deck draws in one page whatever --workers says
  const manifest = { piece: dir, id: story.id, kind: story.kind, version, fps: o.fps, sub: o.sub, workers: story.kind === 'deck' ? 1 : o.workers, forced: !gate.ok, checked: gate.ok };
  if (story.kind !== 'deck' && workersRequested > MAX_WORKERS) { manifest.workersRequested = workersRequested; log(`note: --workers ${workersRequested} draws in ${MAX_WORKERS} pages at most`); }
  const share = shareCopy(story);   // written once the export has succeeded
  manifest.share = { file: 'out/share-copy.txt', source: share.source };
  if (share.banned.length) { (manifest.warnings ??= []).push(`share copy: launch cliché ${share.banned.join(', ')}`); log(`warning: share copy uses ${share.banned.join(', ')}; say what the product does instead`); }
  if (o.sub > 1) {   // blending instants ghosts moving text; ask the gate whether this piece would
    const row = await subRow(story, o.sub, o.subHook, dir);
    if (row) {
      manifest.rules = [row];
      if (row.status === 'WARN' || row.status === 'FAIL') { (manifest.warnings ??= []).push(`${row.id}: ${row.evidence?.reason ?? row.status}`); log(`warning: ${row.id}: ${row.evidence?.reason ?? row.status}`); }
    }
  }
  const release = guardInterrupts();
  try {
    let server, browser;
    try {
      server = await serveRoot(ROOT);
      browser = await launchBrowser({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });
      const shared = { browser, server };
      if (story.kind === 'deck') await exportDeck(dir, story, o, shared, manifest); else await exportFilm(dir, story, o, shared, manifest);
    } finally {
      await browser?.close();
      await server?.close();
    }
  } finally { release(); }
  writeFileSync(join(dir, 'out', 'share-copy.txt'), share.text + '\n');
  const bad = (manifest.prove ?? []).filter((p) => p.mismatches.length);
  if (o.prove) manifest.proved = bad.length === 0;
  writeFileSync(join(dir, 'out', 'export.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { manifest, code: bad.length ? 1 : 0 };
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    fps: { type: 'string', default: '30' }, sub: { type: 'string', default: '1' }, formats: { type: 'string' }, force: { type: 'boolean', default: false }, prove: { type: 'boolean', default: false }, gif: { type: 'boolean', default: false }, 'gif-width': { type: 'string' }, workers: { type: 'string' } } });
  const dir = resolvePiece(positionals[0]);
  const { manifest, code } = await exportPiece(dir, { fps: Number(values.fps), sub: Number(values.sub), formats: values.formats?.split(',').map((s) => s.trim()).filter(Boolean), force: values.force, prove: values.prove, gif: values.gif, gifWidth: values['gif-width'] ? Number(values['gif-width']) : undefined, workers: values.workers === undefined ? undefined : /^\d+$/.test(values.workers) ? Number(values.workers) : NaN });
  for (const f of manifest.files ?? []) console.log(`${f.format}: ${f.file} (${f.width}x${f.height}, ${f.frames} frames)`);
  if (manifest.loop) console.log(`loop: SSIM last vs first ${manifest.loop.ssim}`);
  if (manifest.deck) console.log(`deck: ${manifest.deck.dir}\nhandout: ${manifest.handout.file} (${manifest.handout.pages} pages)\nwalkthrough: ${manifest.walkthrough.file} (${manifest.walkthrough.seconds.toFixed(1)} s, ${manifest.walkthrough.transitions} transitions)`);
  for (const w of manifest.warnings ?? []) console.log(`warning: ${w}`);
  for (const p of manifest.prove ?? []) console.log(p.mismatches.length ? `prove FAILED (${p.format}): ${p.mismatches.length} of ${p.frames} frames differ: ${p.mismatches.slice(0, 8).join(', ')}` : `prove ok (${p.format}): ${p.frames} frames identical on a second render`);
  return code;
});
