// The pure half of `mm share` (SPEC §8): everything the watch folder says, as text, from a story, a
// style and a schedule. No browser, no ffmpeg, no files: scripts/share.mjs reads and writes. The
// listing title, the marked share block that a second run replaces, and the idea of a transcript
// and a context file that an agent can read beside the film come from the presenter (NOTICE); the
// code is written here, in MM's own idiom.
import { captionGroups, countGroups } from '../../runtime/kit/captions.js';
import { shareCopy } from '../export.mjs';
import { UsageError } from './cli.mjs';
import { isColor, isSafeFamily } from './style-values.mjs';

export const MAX_TITLE = 200;
export const MARKER_OPEN = '<!-- mm-share -->';
export const MARKER_CLOSE = '<!-- /mm-share -->';
const KARAOKE = 'text/caption-karaoke';

const flat = (s) => String(s ?? '').replace(/<!--[\s\S]*?(-->|$)/g, ' ').replace(/[\u0000-\u001f\u007f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');   // every attribute is double-quoted
const r3 = (x) => Math.round(x * 1000) / 1000;
const humanId = (id) => { const s = String(id).replace(/[-_]+/g, ' ').trim(); return s ? s[0].toUpperCase() + s.slice(1) : String(id); };

// ---------------------------------------------------------------------------------------------
// title, description, base URL

/** The title the piece is listed under: the story's title as one line of at most 200 characters, else its id. */
export function shareTitle(story) {
  const line = flat(story.title) || flat(story.id) || 'Untitled';
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1).trimEnd()}…` : line;
}

/** The story's share caption, else the hook, the closing headline and the link (the same words `mm export` writes to share-copy.txt), on one line. */
export function shareDescription(story) {
  return flat(shareCopy(story).text);
}

/** The address the folder will have, as an absolute http(s) URL with a trailing slash; null for none. */
export function baseUrl(value) {
  if (value == null || value === '') return null;
  let u;
  try { u = new URL(String(value)); } catch { throw new UsageError(`--url ${JSON.stringify(String(value))} is not an absolute URL`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new UsageError(`--url must start with http:// or https://, not ${u.protocol}`);
  if (u.username || u.password) throw new UsageError('--url must not carry a user name or password');
  u.hash = ''; u.search = '';
  if (!u.pathname.endsWith('/')) u.pathname += '/';
  return u.href;
}

// ---------------------------------------------------------------------------------------------
// the share block: a poster image that links to the page, the link, the credits

const mdText = (s) => flat(s).replace(/[\\[\]()<>`*_!|]/g, (c) => `\\${c}`);

/**
 * The Markdown to paste where the piece is talked about (a release's notes, a pull request, a README): between marker lines,
 * so `upsertShareBlock` replaces it on a second run. Everything the story says is flattened and escaped, so it cannot close the
 * marker or leave the link. Without `pageUrl` the block names index.html and says to pass --url.
 */
export function shareBlock({ title, pageUrl, posterUrl, credits = [] }) {
  const name = mdText(title) || 'this piece';
  const link = pageUrl ?? 'index.html';
  const lines = [MARKER_OPEN, ''];
  if (posterUrl && pageUrl) lines.push(`[![${name}](${posterUrl})](${link})`, '');
  lines.push(`[Watch it](${link})`);
  if (!pageUrl) lines.push('', '_This link is relative: run `mm share --url <where the folder will be published>` for an address that works anywhere._');
  const owed = credits.map(flat).filter(Boolean);
  if (owed.length) lines.push('', 'Credits:', ...owed.map((c) => `- ${mdText(c)}`));
  lines.push('', MARKER_CLOSE);
  return lines.join('\n');
}

/**
 * `text` with its earlier share block (marker to marker, or from a lone opening marker to the end) replaced by `block`, else `block`
 * appended after a blank line. A second run with the same block returns the same text.
 */
export function upsertShareBlock(text, block) {
  const body = String(text ?? '');
  const start = body.indexOf(MARKER_OPEN);
  const trimmed = block.trimEnd();
  if (start < 0) return `${body.replace(/\s+$/, '')}${body.trim() ? '\n\n' : ''}${trimmed}\n`;
  const closeAt = body.indexOf(MARKER_CLOSE, start);
  const end = closeAt < 0 ? body.length : closeAt + MARKER_CLOSE.length;
  const before = body.slice(0, start).replace(/\s+$/, ''), after = body.slice(end).replace(/^\s+/, '');
  return `${before}${before ? '\n\n' : ''}${trimmed}\n${after ? `\n${after.replace(/\s+$/, '')}\n` : ''}`;
}

// ---------------------------------------------------------------------------------------------
// WebVTT

const stamp = (s) => {
  const ms = Math.round(Math.max(0, s) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
};
const vttText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\s*\n\s*/g, ' ');

/** WebVTT for [{ start, end, text }] (seconds); one cue per entry, in order. */
export function webvtt(cues) {
  if (!cues.length) return 'WEBVTT\n';
  return `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${vttText(c.text)}`).join('\n\n')}\n`;
}

/** The cues of a WebVTT text: [{ start, end, text }] in seconds, the text unescaped. */
export function parseWebvtt(text) {
  const secs = (h, m, s) => Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s);
  const time = /(?:(\d+):)?(\d{2}):(\d{2}\.\d{3})\s+-->\s+(?:(\d+):)?(\d{2}):(\d{2}\.\d{3})/;
  const out = [];
  for (const block of String(text).replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex((l) => time.test(l));
    if (at < 0) continue;
    const m = time.exec(lines[at]);
    out.push({ start: r3(secs(m[1], m[2], m[3])), end: r3(secs(m[4], m[5], m[6])), text: lines.slice(at + 1).filter(Boolean).join(' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// captions: what text/caption-karaoke shows, as cues

const scalarParams = (beat) => Object.fromEntries(Object.entries(beat?.params ?? {}).filter(([, v]) => v == null || typeof v !== 'object'));

/**
 * The cues of every text/caption-karaoke beat of a film, as the pattern would show them: one group at a time, a group's words as one
 * line. `items` are the schedule's items (start and d in film seconds, `exit.start` for a beat that leaves), `scenes` the schedule's
 * scenes, `style` for the brand's defaults for the pattern, `words` the footage's words for `mode: words`. A group stands until the
 * next one begins; the last stands until the beat leaves or its scene ends. Sorted by start.
 */
export function captionCues({ items, scenes, style = {}, words = [] }) {
  const sceneEnd = new Map(scenes.map((s) => [s.id, s.end]));
  const out = [];
  for (const it of items) {
    if (it.parent || it.fx !== KARAOKE) continue;
    const prm = { group: 4, mode: 'even', lead: 0.05, breaks: 'score', chars: 30, ...(style.patterns?.[KARAOKE] ?? {}), ...scalarParams(it.beat) };
    const asked = Math.round(Number(prm.group));
    const size = Math.min(6, Math.max(2, Number.isFinite(asked) ? asked : 4));
    const groupsOf = (list) => (prm.breaks === 'count' ? countGroups(list, size) : captionGroups(list, { group: size, chars: Number(prm.chars) }));
    const end = Math.min(it.exit?.start ?? Infinity, sceneEnd.get(it.scene) ?? Infinity);
    if (!(end > it.start)) continue;
    let starts, texts;
    if (prm.mode === 'words' && words.length) {
      const lead = Math.min(0.1, Math.max(0, Number(prm.lead) || 0));
      const groups = groupsOf(words);
      starts = groups.map((g) => Math.max(it.start, g[0].at - lead));
      texts = groups.map((g) => g.map((w) => w.text).join(' '));
    } else {
      const list = String(it.beat.text ?? '').split(/\s+/).filter(Boolean);
      if (!list.length) continue;
      const groups = groupsOf(list);
      const total = list.length;
      let before = 0;
      starts = groups.map((g, i) => {
        const share = prm.breaks === 'count' ? i / groups.length : before / total;
        before += g.length;
        return it.d > 0 ? it.start + it.d * share : it.start;
      });
      texts = groups.map((g) => g.join(' '));
      if (!(it.d > 0)) { starts = [it.start]; texts = [texts.at(-1)]; }   // an instant beat shows its last group
    }
    starts.forEach((s, i) => {
      const e = i + 1 < starts.length ? starts[i + 1] : end;
      const start = r3(s), stop = r3(Math.min(e, end));
      if (stop > start && start < end) out.push({ start, end: stop, text: texts[i] });
    });
  }
  return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

// ---------------------------------------------------------------------------------------------
// chapters, transcript, context

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const firstLine = (s) => flat(s).slice(0, 80);

function sceneTitle(sc) {
  const beats = sc?.beats ?? [];
  const lead = beats.find((b) => b.slot === 'headline' && flat(b.text)) ?? beats.find((b) => flat(b.text));
  return lead ? firstLine(lead.text) : humanId(sc?.id ?? 'Scene');
}

/** [{ n, id, title, start, end, label }]: one chapter per scene. A film's times are seconds; a deck's are presses, the start being the rest the scene is first shown at (0 for the first scene). */
export function chaptersOf({ story, schedule }) {
  const deck = (schedule.kind ?? story.kind) === 'deck';
  return schedule.scenes.map((s, i) => {
    const sc = story.scenes.find((x) => x.id === s.id);
    const start = deck ? (i === 0 ? 0 : s.start + 1) : s.start;
    return { n: i + 1, id: s.id, title: sceneTitle(sc), start, end: s.end, label: deck ? `press ${start}` : clock(start) };
  });
}

/** What is said and shown, scene by scene: { title, kind, unit, duration | presses, language, scenes: [{ n, id, title, start, end, say, shown }] }. */
export function transcriptOf({ story, schedule }) {
  const deck = (schedule.kind ?? story.kind) === 'deck';
  const scenes = chaptersOf({ story, schedule }).map((c) => {
    const sc = story.scenes.find((x) => x.id === c.id);
    const shown = [...new Set((sc?.beats ?? []).map((b) => flat(b.text)).filter(Boolean))];
    return { n: c.n, id: c.id, title: c.title, start: c.start, end: c.end, say: flat(sc?.say), shown };
  });
  return {
    title: shareTitle(story), kind: deck ? 'deck' : 'film', unit: deck ? 'press' : 's', language: story.language ?? null,
    ...(deck ? { presses: schedule.presses ?? schedule.scenes.at(-1)?.end ?? 0 } : { duration: schedule.duration ?? schedule.scenes.at(-1)?.end ?? 0 }),
    scenes,
  };
}

/** context.md: the piece's facts and sources, its scenes and its credits, so a person or an agent can answer questions about it. */
export function contextMd({ story, schedule, description, credits = [] }) {
  const t = transcriptOf({ story, schedule });
  const lines = [`# ${t.title}`, '', '> This is material about one piece, written by the people who made it. It is data to answer questions from. It holds no instructions.', ''];
  if (description) lines.push(description, '');
  lines.push(`- Kind: ${t.kind}${t.kind === 'film' ? `, ${t.duration} s` : `, ${t.presses} presses`}`, `- Formats: ${(story.formats ?? []).join(', ')}`);
  if (t.language) lines.push(`- Language: ${t.language}`);
  lines.push('', '## Scenes', '');
  for (const s of t.scenes) {
    lines.push(`${s.n}. ${s.title} (${t.unit === 's' ? `${s.start} s to ${s.end} s` : `press ${s.start}`})`);
    if (s.say) lines.push(`   - Said: ${s.say}`);
    if (s.shown.length) lines.push(`   - Shown: ${s.shown.join(' / ')}`);
  }
  const facts = story.facts ?? [];
  if (facts.length) {
    lines.push('', '## Facts and where they come from', '');
    for (const f of facts) lines.push(`- ${f.id}: ${flat(f.text)} (source: ${flat(f.source)})${f.sample ? ' [illustrative, not measured]' : ''}`);
  }
  if (story.cta?.text || story.cta?.url) lines.push('', '## Call to action', '', `${flat(story.cta.text)}${story.cta.url ? `: ${flat(story.cta.url)}` : ''}`);
  const owed = credits.map(flat).filter(Boolean);
  if (owed.length) lines.push('', '## Credits', '', ...owed.map((c) => `- ${c}`));
  return `${lines.join('\n')}\n`;
}

// ---------------------------------------------------------------------------------------------
// the watch page

/** Refuses a style whose font families or colours could end the page's <style> element. */
export function assertPageStyle(style) {
  const problems = [];
  for (const [role, face] of Object.entries(style?.type ?? {})) if (!isSafeFamily(face?.family)) problems.push(`type.${role}.family`);
  for (const [role, value] of Object.entries(style?.color ?? {})) if (!isColor(value)) problems.push(`color.${role}`);
  if (problems.length) throw new UsageError(`the watch page cannot be built from this style: ${problems.join(', ')} hold characters that are not allowed in a page's styles`);
}

/**
 * The page's styles from the brand's palette roles and type: the kit's own variable names (`--mm-color-*`, `--mm-font-*`, `--mm-weight-*`,
 * `--mm-radius-*`), the @font-face rules for the copies in fonts/, and a layout that uses only those. `fonts` is [{ family, weight, src, unicodeRange? }].
 */
export function pageCss(style, fonts = []) {
  assertPageStyle(style);
  const c = style.color ?? {}, vars = [];
  for (const role of ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk']) if (c[role]) vars.push(`--mm-color-${role}: ${c[role]};`);
  vars.push(`--mm-accent-text: ${style.composition?.accentText === false ? 'var(--mm-color-ink)' : 'var(--mm-color-accent)'};`);
  for (const [role, face] of Object.entries(style.type ?? {})) {
    vars.push(`--mm-font-${role}: "${face.family}", ${role === 'mono' ? 'ui-monospace, monospace' : role === 'display' ? 'Georgia, serif' : 'system-ui, sans-serif'};`);
    if (Number.isFinite(face.weight)) vars.push(`--mm-weight-${role}: ${face.weight};`);
  }
  (style.radius ?? []).forEach((v, i) => { if (Number.isFinite(v)) vars.push(`--mm-radius-${i}: ${v}px;`); });
  const faces = fonts.filter((f) => isSafeFamily(f.family) && /^fonts\/[\w./-]+$/.test(f.src))
    .map((f) => `@font-face { font-family: "${f.family}"; src: url("${f.src}"); font-weight: ${Number(f.weight) || 400}; font-style: normal; font-display: swap;${f.unicodeRange && /^[\w+,\s-]+$/.test(f.unicodeRange) ? ` unicode-range: ${f.unicodeRange};` : ''} }`);
  return `${faces.join('\n')}
:root { ${vars.join(' ')} color-scheme: light; }
* { box-sizing: border-box; }
html { background: var(--mm-color-canvas); }
body { margin: 0; color: var(--mm-color-ink); background: var(--mm-color-canvas); font: var(--mm-weight-text, 400) 1rem/1.5 var(--mm-font-text, system-ui, sans-serif); }
main { max-width: 68rem; margin: 0 auto; padding: 2rem 1rem 3rem; }
h1 { margin: 0 0 .5rem; font: var(--mm-weight-display, 700) clamp(1.75rem, 4vw, 2.75rem)/1.1 var(--mm-font-display, Georgia, serif); letter-spacing: -0.01em; }
.lede { margin: 0 0 1.5rem; color: var(--mm-color-muted); max-width: 46rem; }
.stage { background: var(--mm-color-surface); border: 1px solid var(--mm-color-line); border-radius: var(--mm-radius-2, 12px); overflow: hidden; }
.stage video, .stage iframe { display: block; width: 100%; aspect-ratio: 16 / 9; max-height: 80vh; border: 0; background: var(--mm-color-surface); }
.stage video.tall { aspect-ratio: auto; width: auto; max-width: 100%; max-height: 80vh; margin: 0 auto; }
.bar { display: flex; flex-wrap: wrap; gap: .5rem; padding: .5rem; border-top: 1px solid var(--mm-color-line); }
button, .button { font: inherit; color: var(--mm-color-ink); background: transparent; border: 1px solid var(--mm-color-line); border-radius: var(--mm-radius-1, 8px); padding: .4rem .8rem; cursor: pointer; }
button:hover, button[aria-current="true"] { background: var(--mm-color-accent); border-color: var(--mm-color-accent); color: var(--mm-color-accentInk); }
button:focus-visible, summary:focus-visible, a:focus-visible { outline: 2px solid var(--mm-color-accent); outline-offset: 2px; }
h2 { margin: 2rem 0 .75rem; font: var(--mm-weight-display, 700) 1.25rem/1.2 var(--mm-font-display, Georgia, serif); }
ol.chapters { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr)); }
ol.chapters button { width: 100%; text-align: left; display: grid; gap: .15rem; }
ol.chapters .when { font: 400 .8rem/1 var(--mm-font-mono, ui-monospace, monospace); color: var(--mm-color-muted); }
ol.chapters button:hover .when, ol.chapters button[aria-current="true"] .when { color: inherit; }
details { margin-top: 1.5rem; border-top: 1px solid var(--mm-color-line); padding-top: .75rem; }
summary { cursor: pointer; font-weight: 600; }
.transcript li { margin: .5rem 0; }
.muted { color: var(--mm-color-muted); }
.credits, .publish { color: var(--mm-color-muted); font-size: .9rem; }
.cta { margin-top: 2rem; padding: 1rem; border: 1px solid var(--mm-color-line); border-radius: var(--mm-radius-2, 12px); background: var(--mm-color-surface); }
.cta strong { color: var(--mm-accent-text); }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }`;
}

const CSP = "default-src 'none'; img-src 'self' data:; media-src 'self' data:; font-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'";

const langName = (code) => { try { const n = new Intl.DisplayNames([code], { type: 'language' }).of(code); return n ? n[0].toUpperCase() + n.slice(1) : code; } catch { return code; } };

const SCRIPT = `(() => {
  const url = new URL(location.href);
  const keep = (name, value) => { try { const u = new URL(location.href); if (value == null) u.searchParams.delete(name); else u.searchParams.set(name, value); history.replaceState(null, '', u); } catch (e) { /* a file:// page may not rewrite its address */ } };
  const mark = (buttons, i) => buttons.forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'true') : b.removeAttribute('aria-current')));
  const buttons = [...document.querySelectorAll('[data-start]')];
  const video = document.querySelector('video');
  const frame = document.querySelector('iframe[data-deck]');
  if (video) {
    const total = Number(video.dataset.duration) || Infinity;
    const seek = (s) => { const t = Math.min(Math.max(0, s), total); const go = () => { video.currentTime = t; }; if (video.readyState > 0) go(); else video.addEventListener('loadedmetadata', go, { once: true }); };
    const asked = Number(url.searchParams.get('t'));
    if (url.searchParams.has('t') && Number.isFinite(asked) && asked > 0) seek(asked);
    buttons.forEach((b) => b.addEventListener('click', () => { const s = Number(b.dataset.start); seek(s); video.play().catch(() => {}); keep('t', s ? String(s) : null); }));
    video.addEventListener('timeupdate', () => { let at = 0; buttons.forEach((b, i) => { if (video.currentTime + 0.05 >= Number(b.dataset.start)) at = i; }); mark(buttons, at); });
  } else if (frame) {
    const say = (m) => { try { frame.contentWindow.postMessage(m, '*'); } catch (e) { /* the deck is not ready */ } };
    const asked = Number(url.searchParams.get('press'));
    if (url.searchParams.has('press') && Number.isInteger(asked) && asked > 0) { frame.src = frame.getAttribute('src').split('?')[0] + '?press=' + asked; mark(buttons, buttons.reduce((at, b, i) => (Number(b.dataset.start) <= asked ? i : at), 0)); }
    buttons.forEach((b, i) => b.addEventListener('click', () => { const n = Number(b.dataset.start); say({ mm: 'goto', press: n }); mark(buttons, i); keep('press', n ? String(n) : null); }));
    for (const b of document.querySelectorAll('[data-deck-step]')) b.addEventListener('click', () => say({ mm: b.dataset.deckStep }));
  }
})();`;

/**
 * The page for a film (`video`) or a deck (`deck`: the standalone deck's index.html in the folder). Everything the story says is escaped.
 * With `base` (the address the folder will have) it carries Open Graph and Twitter card tags with absolute image and video URLs, which
 * a card needs; without it those tags are left out rather than written wrong. Unlisted unless `index`.
 */
export function watchPage({ kind, title, description, lang = 'en', base = null, video = null, poster = null, track = null, deck = null, duration = null, chapters = [], transcript = null, cta = null, credits = [], css = '', index = false, tall = false }) {
  const l = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang) ? lang : 'en';
  const abs = (rel) => (base && rel ? new URL(rel, base).href : null);
  const meta = [`<meta charset="utf-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1">`, `<meta http-equiv="Content-Security-Policy" content="${esc(CSP)}">`];
  if (!index) meta.push('<meta name="robots" content="noindex, nofollow">');
  meta.push(`<meta name="description" content="${esc(description)}">`);
  const card = [['og:title', title], ['og:description', description], ['og:type', kind === 'film' ? 'video.other' : 'website']];
  for (const [k, v] of card) if (v) meta.push(`<meta property="${k}" content="${esc(v)}">`);
  if (base) {
    meta.push(`<link rel="canonical" href="${esc(base)}">`, `<meta property="og:url" content="${esc(base)}">`);
    if (poster) meta.push(`<meta property="og:image" content="${esc(abs(poster))}">`);
    if (video) meta.push(`<meta property="og:video" content="${esc(abs(video))}">`, '<meta property="og:video:type" content="video/mp4">');
  }
  meta.push('<meta name="twitter:card" content="summary_large_image">', `<meta name="twitter:title" content="${esc(title)}">`, `<meta name="twitter:description" content="${esc(description)}">`);
  if (base && poster) meta.push(`<meta name="twitter:image" content="${esc(abs(poster))}">`);

  const stage = video
    ? `<video controls playsinline preload="metadata"${tall ? ' class="tall"' : ''}${poster ? ` poster="${esc(poster)}"` : ''} data-duration="${Number(duration) || 0}"><source src="${esc(video)}" type="video/mp4">${track ? `<track kind="captions" src="${esc(track)}" srclang="${esc(l)}" label="${esc(langName(l))}">` : ''}Your browser cannot play this video. <a href="${esc(video)}">Download it</a>.</video>`
    : `<iframe data-deck src="${esc(deck)}" title="${esc(title)}" allow="fullscreen"></iframe><div class="bar"><button type="button" data-deck-step="prev">Back</button><button type="button" data-deck-step="next">Next</button><a class="button" href="${esc(deck)}">Open full screen</a></div>`;
  const list = chapters.length ? `<h2>Chapters</h2><ol class="chapters">${chapters.map((c, i) => `<li><button type="button" data-start="${esc(c.start)}"${i === 0 ? ' aria-current="true"' : ''}><span class="when">${esc(c.label)}</span><span>${esc(c.title)}</span></button></li>`).join('')}</ol>` : '';
  const script = transcript?.scenes?.length ? `<details><summary>Transcript</summary><ol class="transcript">${transcript.scenes.map((s) => `<li><strong>${esc(s.title)}</strong>${s.say ? `<br>${esc(s.say)}` : ''}${s.shown.length ? `<br><span class="muted">${esc(s.shown.join(' / '))}</span>` : ''}</li>`).join('')}</ol></details>` : '';
  const action = cta && (cta.text || cta.url) ? `<p class="cta"><strong>${esc(cta.text)}</strong>${cta.url ? ` <span class="muted">${esc(cta.url)}</span>` : ''}</p>` : '';
  const owed = credits.length ? `<details open class="credits"><summary>Credits</summary><ul>${credits.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></details>` : '';
  return `<!doctype html>
<!-- Made by \`mm share\`. This folder is the whole page: put it on any static host. Nothing in it calls another site, and nothing was uploaded. -->
<html lang="${esc(l)}">
<head>
${meta.join('\n')}
<title>${esc(title)}</title>
<style>
${css}
</style>
</head>
<body>
<main>
<h1>${esc(title)}</h1>
<p class="lede">${esc(description)}</p>
<div class="stage">${stage}</div>
${list}
${script}
${action}
${owed}
<details class="publish"><summary>Publishing this page</summary><p>This folder is the whole page: upload it to any static host (a folder on a web server, a static site service, a storage bucket set up to serve files). Nothing is uploaded by Motion Machine, and nothing on this page calls another site. Open index.html from the folder to check it first.</p></details>
</main>
<script>
${SCRIPT}
</script>
</body>
</html>
`;
}
