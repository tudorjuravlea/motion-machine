#!/usr/bin/env node
// mm share [piece] [--out dir] [--format F] [--url https://…] [--index]   (SPEC §8)
// A self-contained watch folder for a finished film or deck: index.html (plays the film's MP4 or embeds the
// standalone deck; poster; title and description; Open Graph and Twitter card tags; `?t=<s>` for a film and
// `?press=<n>` for a deck; a chapter list from the scenes), transcript.json (each scene's start, title, what is said
// and shown), context.md (the story's facts and sources, so a person or an agent can answer questions about it),
// captions.vtt (when the film has a caption beat, wired as a <track>), share-block.md (a poster that links to the
// page, the link and the credits, between marker lines a second run replaces) and mm-share.json (each file's size
// and sha-256). It reads the export (`mm export` first) and uploads nothing: publishing is a step a person takes,
// with any static host. The page uses the style's palette roles and fonts. Only regular files inside the piece are
// copied, never through a symbolic link. The page is unlisted (noindex) unless --index, which is refused while a
// used asset has no free licence on record. Exit 0, 2 usage or setup.
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ROOT, framePng, openPiece } from './lib/browser.mjs';
import { UsageError, findFontSrc, fontFiles, isArgsError, resolvePiece, slug, usageText } from './lib/cli.mjs';
import { auditAssets, creditsFor } from './lib/licence.mjs';
import { listInside, readInside, writeInside } from './lib/path-safe.mjs';
import { runFfmpeg } from './lib/ffmpeg.mjs';
import { pieceSchedule } from './lib/piece-schedule.mjs';
import { MARKER_OPEN, assertPageStyle, baseUrl, captionCues, chaptersOf, contextMd, pageCss, shareBlock, shareDescription, shareTitle, transcriptOf, watchPage, webvtt } from './lib/share.mjs';

const MARKER_FILE = 'mm-share.json';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (v) => `${JSON.stringify(v, null, 2)}\n`;

/** The fonts of a style that can travel: a file inside the piece or the repository with its LICENSE.txt beside it. */
function fontsFor(dir, style, notes) {
  const out = [];
  for (const { family, file } of fontFiles(style)) {
    const abs = findFontSrc(file.src, join(dir, 'style.json'));
    const root = abs && (abs.startsWith(dir + sep) ? dir : abs.startsWith(ROOT + sep) ? ROOT : null);
    const licence = abs && join(dirname(abs), 'LICENSE.txt');
    if (!abs || !root) { notes.push(`font ${family} (${file.src}) is not inside the piece or the repository: the page falls back to a system font`); continue; }
    if (!existsSync(licence)) { notes.push(`font ${family} (${file.src}) has no LICENSE.txt beside it: not copied`); continue; }
    const rel = `fonts/${slug(family)}/${basename(abs)}`;
    out.push({ family, weight: file.weight, unicodeRange: file.unicodeRange, src: rel, from: [root, relative(root, abs)], licence: [root, relative(root, licence)] });
  }
  return out;
}

/** The poster of a deck: its first scene at its last press, drawn by the kit. */
async function deckPoster(dir, format, restAt) {
  const piece = await openPiece(dir, { format });
  try { return await framePng(piece.page, restAt); } finally { await piece.close(); }
}

const FLAGS = { out: { type: 'string' }, format: { type: 'string' }, url: { type: 'string' }, index: { type: 'boolean' } };

export async function main(argv, io = {}) {
  const out = io.out ?? console.log, err = io.err ?? console.error;
  try {
    const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, strict: true, options: FLAGS });
    if (positionals.length > 1) throw new UsageError('mm share takes at most one piece folder');
    const dir = resolvePiece(positionals[0]);
    const base = baseUrl(v.url);
    const notes = [];
    const { story, style, schedule, format, written } = await pieceSchedule(dir, v.format ?? null);
    assertPageStyle(style);
    const deck = written.kind === 'deck';
    const files = new Map();      // path in the folder -> bytes
    const copy = (rel, as = rel, root = dir) => files.set(as, readInside(root, rel));

    // ---- the media: the export, read from inside the piece
    let video = null, poster = null, deckPage = null;
    if (deck) {
      if (!existsSync(join(dir, 'out', 'deck', 'index.html'))) throw new UsageError(`no standalone deck in ${join(dir, 'out', 'deck')}: run \`mm export ${relative(process.cwd(), dir) || '.'}\` first`);
      const found = listInside(join(dir, 'out', 'deck'));
      for (const f of found.files) copy(`out/deck/${f}`, `deck/${f}`);
      for (const l of found.links) notes.push(`out/deck/${l} is a symbolic link: not copied`);
      deckPage = 'deck/index.html';
    } else {
      video = `${written.id}-${format}.mp4`;
      if (!existsSync(join(dir, 'out', video))) throw new UsageError(`no export of ${format} at ${join(dir, 'out', video)}: run \`mm export ${relative(process.cwd(), dir) || '.'}\` first`);
      copy(`out/${video}`, video);
      // mm export draws the poster in the story's first format; another format's page takes its poster from its own MP4, at the film's first rest
      if (format === written.formats[0] && existsSync(join(dir, 'out', 'poster.png'))) { copy('out/poster.png', 'poster.png'); poster = 'poster.png'; }
      else {
        const tmp = mkdtempSync(join(tmpdir(), 'mm-poster-'));
        try {
          await runFfmpeg(['-ss', String(schedule.rests?.[0] ?? 0), '-i', join(dir, 'out', video), '-frames:v', '1', join(tmp, 'poster.png')]);
          files.set('poster.png', readFileSync(join(tmp, 'poster.png')));
          poster = 'poster.png';
        } catch (e) { notes.push(`no poster: ${String(e.message).split('\n')[0]}`); } finally { rmSync(tmp, { recursive: true, force: true }); }
      }
      if (statSync(join(dir, 'story.json')).mtimeMs > statSync(join(dir, 'out', video)).mtimeMs) notes.push('story.json changed after this export: export again so the page shows the story as it is now');
    }
    if (deck) {
      try { files.set('poster.png', await deckPoster(dir, format, schedule.scenes[0].end)); poster = 'poster.png'; } catch (e) { notes.push(`no poster: the first scene could not be drawn (${String(e.message).split('\n')[0]})`); }
    }

    // ---- what the page says
    const title = shareTitle(story), description = shareDescription(story);
    const credits = creditsFor({ dir, story: written, style }).map((c) => c.text);
    const chapters = chaptersOf({ story, schedule }), transcript = transcriptOf({ story, schedule });
    let track = null;
    if (!deck) {
      let words = [];
      if (written.footage?.asset) {
        try { words = JSON.parse(readInside(dir, `${written.footage.asset.replace(/\/$/, '')}/edit.json`).toString('utf8')).words ?? []; } catch { notes.push('the footage\'s edit.json could not be read: captions in mode words are not written'); }
      }
      const cues = captionCues({ items: schedule.items, scenes: schedule.scenes, style, words });
      if (cues.length) { files.set('captions.vtt', webvtt(cues)); track = 'captions.vtt'; }
    }
    if (v.index) {
      const unlicensed = auditAssets({ dir, story: written });
      if (unlicensed.length) throw new UsageError(`--index lists the page for search engines, but ${unlicensed.map((a) => `${a.asset} (${a.problem})`).join(', ')} has no free licence on record. Fix the records (\`mm credits\` lists what is owed) or share the page unlisted.`);
    }
    const fonts = fontsFor(dir, style, notes);
    for (const f of fonts) { copy(f.from[1], f.src, f.from[0]); copy(f.licence[1], `${dirname(f.src)}/LICENSE.txt`, f.licence[0]); }
    const css = pageCss(style, fonts);
    files.set('index.html', watchPage({
      kind: deck ? 'deck' : 'film', title, description, lang: written.language ?? 'en', base, video, poster, track, deck: deckPage, duration: schedule.duration ?? null,
      chapters, transcript, cta: written.cta ?? null, credits, css, index: Boolean(v.index), tall: ['9x16', '4x5'].includes(format),
    }));
    files.set('transcript.json', json(transcript));
    files.set('context.md', contextMd({ story, schedule, description, credits }));
    files.set('share-block.md', `${shareBlock({ title, pageUrl: base, posterUrl: base && poster ? new URL(poster, base).href : null, credits })}\n`);
    const manifest = {
      tool: 'mm share', version: 1, piece: written.id, kind: deck ? 'deck' : 'film', ...(deck ? {} : { format }), url: base, listed: Boolean(v.index),
      files: [...files].map(([path, data]) => ({ path, bytes: Buffer.byteLength(data), sha256: sha(data) })).sort((a, b) => a.path.localeCompare(b.path)),
    };

    // ---- the folder: new, empty, or a share folder made earlier (then rebuilt whole)
    const target = resolve(v.out ?? join(dir, 'out', 'share'));
    if (existsSync(target)) {
      if (lstatSync(target).isSymbolicLink() || !statSync(target).isDirectory()) throw new UsageError(`${target} is not a folder`);
      const held = readdirSync(target);
      if (held.length && !held.includes(MARKER_FILE)) throw new UsageError(`${target} is not empty and not a share folder made by mm share: name a new folder with --out`);
      for (const name of held) rmSync(join(target, name), { recursive: true, force: true });
    }
    for (const [path, data] of files) writeInside(target, path, data);
    writeInside(target, MARKER_FILE, json(manifest));

    const bytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
    out(`share: ${target} (${manifest.files.length + 1} files, ${(bytes / 1e6).toFixed(1)} MB)`);
    out(`share: open ${join(target, 'index.html')} to check it. To publish, put the whole folder on any static host; nothing was uploaded.`);
    out(`share: the page is ${v.index ? 'listed for search engines' : 'unlisted (noindex); --index lists it'}${base ? `; it will live at ${base}` : '; without --url its card tags and share block carry no absolute address'}`);
    out(`share: paste ${join(target, 'share-block.md')} where the piece is talked about; ${MARKER_OPEN} lets a second paste replace it`);
    for (const n of notes) err(`share: ${n}`);
    return 0;
  } catch (e) {
    if (isArgsError(e)) { err(`mm share: ${e.message}\n${usageText('share')}`); return 2; }
    if (e instanceof UsageError) { err(`mm share: ${e.message}`); return e.exitCode ?? 2; }
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(`mm: ${e?.message ?? e}`); process.exitCode = 2; });
