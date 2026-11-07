// mm review [piece] [--no-stills]: builds out/review.html from the rounds in direction-log.md and
// the stills, strips and last frame of each round (SPEC §8, §11). One self-contained file, no
// scripts, no libraries; images are relative files under out/.
//
// Log format: each `## heading` opens a round; the first quoted block (`> …`) in a round is the
// director's note and is shown first. Rounds appear newest first: by the number in the heading
// when every heading has one, otherwise the last one in the file is the newest. The newest round
// is photographed now (stills, strips, contact sheet, last frame) and archived under
// out/rounds/round-NN/; older rounds keep what was archived when they were the newest.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { framePng, openPiece } from './lib/browser.mjs';
import { UsageError, resolvePiece, runMain } from './lib/cli.mjs';
import { stills } from './stills.mjs';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Rounds of a direction log, in file order: [{ title, note, body }]. */
export function parseRounds(md) {
  const rounds = [];
  let cur = null;
  for (const line of md.split(/\r?\n/)) {
    const h = /^##\s+(.*\S)\s*$/.exec(line);
    if (h) { cur = { title: h[1], lines: [] }; rounds.push(cur); } else if (cur) cur.lines.push(line);
  }
  return rounds.map((r) => {
    const lines = r.lines;
    let i = lines.findIndex((l) => /^\s*>/.test(l));
    let note = '';
    if (i >= 0) {
      let j = i;
      while (j < lines.length && /^\s*>/.test(lines[j])) j++;
      note = lines.slice(i, j).map((l) => l.replace(/^\s*>\s?/, '')).join('\n').trim();
      lines.splice(i, j - i);
    }
    return { title: r.title, note, body: lines.join('\n').trim() };
  });
}

/** Newest first. Returns the rounds with their chronological `n` (1-based). */
export function newestFirst(rounds) {
  const numbers = rounds.map((r) => /(\d+)/.exec(r.title)?.[1]);
  const numbered = numbers.every((x) => x !== undefined);
  const chrono = numbered ? rounds.map((r, i) => ({ r, i, k: Number(numbers[i]) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.r) : rounds;
  return chrono.map((r, i) => ({ ...r, n: i + 1 })).reverse();
}

// ---- a small markdown subset: headings, paragraphs, lists, tables, fenced code, quotes -----------
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  .replace(/\[([^\]]+)\]\(((?:https?:\/\/|\.\/|\.\.\/|[\w/.-]+)[^)\s]*)\)/g, '<a href="$2">$1</a>');

export function renderMarkdown(md) {
  const out = [], lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length;) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    if (/^```/.test(l)) {
      const code = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++; out.push(`<pre>${esc(code.join('\n'))}</pre>`); continue;
    }
    const h = /^(#{3,6})\s+(.*)$/.exec(l);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const isRule = (r) => cells(r).every((c) => /^:?-{2,}:?$/.test(c));
      const head = rows.length > 1 && isRule(rows[1]) ? cells(rows[0]) : null;
      const body = rows.filter((r, k) => !(head && k < 2)).filter((r) => !isRule(r)).map(cells);
      out.push(`<table>${head ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : ''}<tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordered = /^\s*\d+\./.test(l), items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\s*>/.test(l)) {
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`); continue;
    }
    const p = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{3,6}\s|\s*\||\s*>|\s*([-*]|\d+\.)\s)/.test(lines[i])) p.push(lines[i++]);
    out.push(`<p>${inline(p.join(' '))}</p>`);
  }
  return out.join('\n');
}

// ---- photographs for the newest round -------------------------------------------------------------
async function archiveNewest(dir, n, { refresh }) {
  const out = join(dir, 'out'), arch = join(out, 'rounds', `round-${String(n).padStart(2, '0')}`);
  if (!refresh && existsSync(arch)) return arch;
  if (refresh) await stills(dir);
  rmSync(arch, { recursive: true, force: true });
  mkdirSync(arch, { recursive: true });
  const frames = join(out, 'stills');
  if (!existsSync(frames)) return null;
  for (const f of readdirSync(frames)) copyFileSync(join(frames, f), join(arch, f));
  for (const f of ['contact.png', 'phone.png']) if (existsSync(join(out, f))) copyFileSync(join(out, f), join(arch, f));
  const opened = await openPiece(dir, {});
  try {
    const meta = await opened.mm.meta();
    writeFileSync(join(arch, 'last.png'), await framePng(opened.page, meta.duration ?? meta.presses));
  } finally {
    await opened.close();
  }
  return arch;
}

function shotsHtml(dir, n) {
  const arch = join(dir, 'out', 'rounds', `round-${String(n).padStart(2, '0')}`);
  if (!existsSync(arch)) return '<p class="none">No images were archived for this round.</p>';
  const base = `rounds/round-${String(n).padStart(2, '0')}`;
  const files = readdirSync(arch).filter((f) => f.endsWith('.png'));
  const fig = (f, cap, cls = '') => `<figure class="${cls}"><a href="${base}/${f}"><img loading="lazy" src="${base}/${f}" alt="${esc(cap)}"></a><figcaption>${esc(cap)}</figcaption></figure>`;
  let labels = {};
  try {
    const s = JSON.parse(readFileSync(join(arch, 'stills.json'), 'utf8'));
    s.contact.tiles.forEach((t, i) => { labels[i] = t.label; });
  } catch { labels = {}; }
  const stillFiles = files.filter((f) => /^\d\d-(rest|mid)-/.test(f)).sort();
  const strips = files.filter((f) => f.startsWith('strip-')).sort();
  return [
    files.includes('contact.png') ? `<h3>Contact sheet</h3>${fig('contact.png', 'every rest and mid-entrance', 'wide')}` : '',
    files.includes('phone.png') ? `<h3>Phone width</h3>${fig('phone.png', 'tiles 378 px wide', 'wide')}` : '',
    strips.length ? `<h3>Strips</h3><div class="grid">${strips.map((f) => fig(f, f.replace(/^strip-\d+-|\.png$/g, '').replace(/-/g, ' '), 'wide')).join('')}</div>` : '',
    files.includes('last.png') ? `<h3>Last frame</h3><div class="grid">${fig('last.png', 'last frame')}</div>` : '',
    stillFiles.length ? `<h3>Stills</h3><div class="grid">${stillFiles.map((f, i) => fig(f, labels[i] ?? f)).join('')}</div>` : '',
  ].join('\n');
}

const CSS = `:root { color-scheme: light dark; --bg: #f6f4ef; --ink: #1c1b18; --dim: #6b675e; --line: #d9d4c7; --card: #fffdf8; --accent: #b5451b; }
@media (prefers-color-scheme: dark) { :root { --bg: #17161a; --ink: #e8e5de; --dim: #9a968c; --line: #34323a; --card: #1f1e23; --accent: #e8a05a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1100px; margin: 0 auto; padding: 32px 16px 80px; }
h1 { font-size: 28px; margin: 0 0 4px; } .sub { color: var(--dim); margin: 0 0 32px; }
.round { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 20px 24px; margin: 0 0 28px; }
.round h2 { margin: 0 0 12px; font-size: 20px; }
blockquote { margin: 0 0 16px; padding: 6px 0 6px 16px; border-left: 4px solid var(--accent); }
blockquote.note { font-size: 18px; }
table { border-collapse: collapse; margin: 12px 0; font-size: 14px; } th, td { border: 1px solid var(--line); padding: 4px 10px; text-align: left; vertical-align: top; }
code, pre { font: 13px ui-monospace, Menlo, Consolas, monospace; } pre { overflow: auto; padding: 10px; background: var(--bg); border-radius: 6px; }
h3 { font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: var(--dim); margin: 22px 0 8px; }
figure { margin: 0; } figure img { display: block; max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: 4px; }
figcaption { font-size: 12px; color: var(--dim); margin-top: 4px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; } .grid .wide { grid-column: 1 / -1; }
.none { color: var(--dim); font-style: italic; } .media a { margin-right: 12px; }`;

export async function review(dir, { refresh = true } = {}) {
  const logFile = join(dir, 'direction-log.md');
  if (!existsSync(logFile)) throw new UsageError(`no direction-log.md in ${dir}: the review page is built from its rounds`);
  const rounds = newestFirst(parseRounds(readFileSync(logFile, 'utf8')));
  if (!rounds.length) throw new UsageError('direction-log.md has no rounds: each "## heading" opens one');
  const story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  await archiveNewest(dir, rounds[0].n, { refresh });

  const manifest = existsSync(join(dir, 'out/export.json')) ? JSON.parse(readFileSync(join(dir, 'out/export.json'), 'utf8')) : null;
  const media = manifest ? [...(manifest.files ?? []).map((f) => f.file), manifest.walkthrough?.file, manifest.handout?.file].filter(Boolean) : [];
  const rel = (p) => p.split('/out/').pop();
  const defects = existsSync(join(dir, 'defects.md')) ? readFileSync(join(dir, 'defects.md'), 'utf8') : null;

  const html = `<!doctype html>
<html lang="${esc(story.language ?? 'en')}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Review: ${esc(story.title ?? story.id)}</title><style>${CSS}</style></head>
<body><main>
<h1>${esc(story.title ?? story.id)}</h1>
<p class="sub">${esc(story.id)} · ${esc(story.kind)} · ${rounds.length} round${rounds.length === 1 ? '' : 's'}, newest first</p>
${rounds.map((r, i) => `<article class="round" id="round-${r.n}">
<h2>${esc(r.title)}</h2>
${r.note ? `<blockquote class="note">${inline(r.note)}</blockquote>` : '<p class="none">No director\'s note recorded for this round.</p>'}
${r.body ? renderMarkdown(r.body) : ''}
${shotsHtml(dir, r.n)}
${i === 0 && media.length ? `<h3>Exports</h3><p class="media">${media.map((m) => `<a href="${esc(rel(m))}">${esc(rel(m))}</a>`).join('')}</p>` : ''}
</article>`).join('\n')}
${defects ? `<article class="round" id="defects"><h2>Defects ledger</h2>${renderMarkdown(defects)}</article>` : ''}
</main></body></html>
`;
  const file = join(dir, 'out', 'review.html');
  mkdirSync(join(dir, 'out'), { recursive: true });
  writeFileSync(file, html);
  return { file, rounds: rounds.length };
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'no-stills': { type: 'boolean', default: false } } });
  const r = await review(resolvePiece(positionals[0]), { refresh: !values['no-stills'] });
  console.log(`review: ${r.rounds} round${r.rounds === 1 ? '' : 's'} → ${r.file}`);
  return 0;
});
