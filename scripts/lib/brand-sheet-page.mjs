// The review sheet's page: one self-contained HTML string from plain data, no browser and no file access.
// The chrome is neutral (greys, one body face, one mono face) so a brand is judged on its own colours and type,
// never against the engine's. Every string that came from the data goes through `esc` or `attr`; a colour goes
// through `hexOf`, so nothing from a sources file can add markup, a style rule or a script.

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2212, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

/**
 * The faces the page itself is set in, from the repository's bundled fonts: [{ family, weight, dir, file, unicodeRange }].
 * Headings use the 700 cut of Archivo (the page asks for 600, which that cut serves), the body uses Manrope 400
 * (the bundled Archivo has no regular cut), labels and numbers use IBM Plex Mono 400.
 */
export const CHROME_FACES = [
  ...['', '-ext'].map((x) => ({ family: 'Archivo', weight: '600 800', dir: 'archivo', file: `archivo-latin${x}-700-normal.woff2`, unicodeRange: x ? LATIN_EXT : LATIN })),
  ...['', '-ext'].map((x) => ({ family: 'Manrope', weight: '400', dir: 'manrope', file: `manrope-latin${x}-400-normal.woff2`, unicodeRange: x ? LATIN_EXT : LATIN })),
  ...['', '-ext'].map((x) => ({ family: 'IBM Plex Mono', weight: '400', dir: 'ibm-plex-mono', file: `ibm-plex-mono-latin${x}-400-normal.woff2`, unicodeRange: x ? LATIN_EXT : LATIN })),
];

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const attr = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** A colour that is safe in a style attribute: a six-digit hex as written, else a neutral grey. */
export const hexOf = (h) => (/^#[0-9a-f]{6}$/i.test(String(h)) ? String(h) : '#CCCCCC');

const CONFIDENCE = { exact: ['pass', 'named by the brand'], measured: ['neutral', 'measured'], rule: ['neutral', 'by rule'], guess: ['warning', 'guessed'], set: ['question', 'set by hand'] };
const badge = (kind, text) => `<span class="badge ${kind}">${esc(text)}</span>`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const ROLE_ORDER = ['canvas', 'ink', 'muted', 'surface', 'line', 'accent', 'accentInk'];

/** The ratio cut (not rounded) to the digits its need is written in, so a pass never reads below its need. */
export function ratioText(ratio, need) {
  const digits = Math.round(need * 10) === need * 10 ? 1 : 2;
  const f = 10 ** digits;
  return `${(Math.floor(ratio * f + 1e-9) / f).toFixed(digits)} : 1`;
}

const licenceBadge = (licence) => {
  if (/^SIL OFL/i.test(licence) || /^Apache/i.test(licence)) return badge('neutral', licence);
  if (licence === 'private-use') return badge('warning', 'private-use');
  return badge('fail', licence || 'unknown');
};

const CSS = `
:root { --bg:#F6F6F4; --text:#1D1D1B; --quiet:#6B6B66; --line:#E4E4E0; }
* { box-sizing: border-box; }
html { background: var(--bg); }
body { margin: 0; padding: 48px 0 64px; background: var(--bg); color: var(--text); font: 400 15px/1.5 'Manrope', sans-serif; }
.wrap { width: 1394px; margin: 0 auto; }
header { padding: 0 33px 24px; }
.eyebrow { font: 400 13px 'IBM Plex Mono', monospace; text-transform: uppercase; letter-spacing: .08em; color: var(--quiet); }
h1 { margin: 4px 0 8px; font: 600 40px/1.15 'Archivo', sans-serif; }
h2 { margin: 0 0 20px; font: 600 28px/1.2 'Archivo', sans-serif; }
h3 { margin: 28px 0 10px; font: 600 18px/1.3 'Archivo', sans-serif; }
.sources { margin: 0 0 14px; color: var(--quiet); }
.row { display: flex; flex-wrap: wrap; gap: 8px; }
.card { width: 1328px; box-sizing: content-box; margin: 0 0 24px; padding: 32px; background: #fff; border: 1px solid var(--line); border-radius: 12px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font: 400 12px/1.5 'IBM Plex Mono', monospace; text-transform: uppercase; white-space: nowrap; }
.badge.pass { color: #1E7A3E; background: #E6F4EA; }
.badge.fail { color: #B42318; background: #FDECEA; }
.badge.warning { color: #8A5300; background: #FFF1D6; }
.badge.question { color: #1F4FA8; background: #EAF1FC; }
.badge.neutral { color: #4A4A45; background: #EEEEEA; }
.mono, code { font: 400 14px 'IBM Plex Mono', monospace; }
.alerts { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.alerts li { display: flex; gap: 12px; align-items: baseline; }
.swatches { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
.sw { width: 176px; }
.chip { width: 176px; height: 132px; border-radius: 8px; box-shadow: inset 0 0 0 1px #00000014; }
.sw.small { width: 88px; }
.sw.small .chip { width: 88px; height: 66px; }
.role { margin: 10px 0 2px; font: 400 12px 'IBM Plex Mono', monospace; text-transform: uppercase; color: var(--quiet); }
.hex { margin: 0 0 6px; font: 400 16px 'IBM Plex Mono', monospace; }
.ev { margin: 6px 0 0; font-size: 13px; line-height: 1.4; color: var(--quiet); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.fixedfrom { margin: 8px 0 0; font-size: 13px; color: var(--quiet); display: flex; align-items: center; gap: 6px; }
.mini { display: inline-block; width: 14px; height: 14px; border-radius: 3px; box-shadow: inset 0 0 0 1px #00000014; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; font: 400 12px 'IBM Plex Mono', monospace; text-transform: uppercase; color: var(--quiet); padding: 0 16px 8px 0; }
td { padding: 10px 16px 10px 0; border-top: 1px solid var(--line); vertical-align: middle; }
.sample { width: 320px; height: 72px; border-radius: 8px; box-shadow: inset 0 0 0 1px #00000014; display: flex; align-items: center; padding: 0 20px; overflow: hidden; }
.sample .rule { width: 100%; height: 2px; }
.use { font-size: 13px; color: var(--quiet); }
.ratio { font: 400 16px 'IBM Plex Mono', monospace; white-space: nowrap; }
.face { display: grid; grid-template-columns: 1fr 260px; gap: 24px; margin-bottom: 16px; }
.strip { border-radius: 8px; padding: 28px 32px; box-shadow: inset 0 0 0 1px #00000014; overflow: hidden; }
.strip .aa { font-size: 140px; line-height: 1; }
.strip .pangram { font-size: 52px; line-height: 1.1; margin-top: 8px; }
.strip .para { font-size: 18px; line-height: 1.5; max-width: 640px; margin: 0; }
.strip .monoline { font: 400 16px 'IBM Plex Mono', monospace; }
.facemeta { display: grid; gap: 6px; align-content: start; font-size: 14px; }
.facemeta .k { font: 400 12px 'IBM Plex Mono', monospace; text-transform: uppercase; color: var(--quiet); }
.banner { margin: -4px 0 16px; padding: 10px 14px; border-radius: 8px; color: #8A5300; background: #FFF1D6; font-size: 14px; }
.banner code { color: inherit; }
.shots { display: flex; gap: 16px; margin-bottom: 20px; }
.shots figure { margin: 0; }
.shots img { display: block; border-radius: 12px; box-shadow: 0 0 0 1px var(--line); }
.look img { width: 427px; height: 240px; }
.logos img { height: 180px; width: 320px; }
figcaption { margin-top: 6px; font: 400 13px 'IBM Plex Mono', monospace; color: var(--quiet); }
.tempo { display: flex; gap: 8px; }
.tempo img { width: 158px; height: 89px; }
.curves { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 8px; }
.curves figure { margin: 0; width: 240px; }
.curve { display: block; width: 240px; height: 120px; border-radius: 8px; background: var(--bg); box-shadow: 0 0 0 1px var(--line); }
.curve .guide { stroke: var(--line); stroke-width: 1; stroke-dasharray: 3 3; }
.curve .mark { stroke: var(--quiet); stroke-width: 1; }
.curve .line { fill: none; stroke: var(--text); stroke-width: 2; stroke-linejoin: round; }
.timing { width: auto; margin-bottom: 8px; }
.timing td, .timing th { padding-right: 28px; }
.q { padding: 18px 0; border-top: 1px solid var(--line); }
.q:first-of-type { border-top: 0; padding-top: 0; }
.q p { margin: 0 0 12px; font-weight: 400; }
.opt { display: grid; grid-template-columns: 20px 220px minmax(0, 1fr) auto; align-items: center; gap: 12px; margin: 8px 0; }
.opt .chip20 { width: 20px; height: 20px; border-radius: 4px; box-shadow: inset 0 0 0 1px #00000014; flex: none; }
.opt .label { width: 220px; }
.opt code { background: #F6F6F4; border: 1px solid var(--line); border-radius: 6px; padding: 4px 8px; word-break: break-all; }
button { font: 400 12px 'IBM Plex Mono', monospace; text-transform: uppercase; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: #fff; color: var(--text); cursor: pointer; }
footer { padding: 8px 33px 0; font: 400 13px 'IBM Plex Mono', monospace; color: var(--quiet); }
`;

const SCRIPT = `document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-copy]');
  if (!b) return;
  const done = (t) => { b.textContent = t; };
  try { navigator.clipboard.writeText(b.dataset.copy).then(() => done('Copied'), () => done('Not copied')); } catch (err) { done('Not copied'); }
});`;

const faceCss = (faces) => faces.map((f) => `@font-face { font-family: '${f.family}'; font-weight: ${f.weight}; font-style: ${f.style ?? 'normal'}; src: url('${f.rel}') format('woff2');${f.unicodeRange ? ` unicode-range: ${f.unicodeRange};` : ''} }`).join('\n');

// One plot per ease or spring (curvePlots in motion-tokens.mjs): the path is made of numbers only; the names and the
// ease spelling go through esc/attr.
const curveFigure = (c) => {
  const caption = c.kind === 'spring' ? `settles in ${c.settle} ms` : esc(c.spec).slice(0, 60);
  const over = `${c.overshoot > 0 ? `overshoots ${(c.overshoot * 100).toFixed(1)} %` : 'no overshoot'}`;
  return `<figure><svg class="curve" viewBox="0 0 240 120" role="img" aria-label="${attr(`${c.name}: ${c.kind === 'spring' ? `settles in ${c.settle} ms, ` : ''}${over}`)}">
<line class="guide" x1="10" x2="230" y1="${Number(c.targetY)}" y2="${Number(c.targetY)}"/>
<line class="guide" x1="10" x2="230" y1="${Number(c.startY)}" y2="${Number(c.startY)}"/>${c.settleX != null ? `
<line class="mark" x1="${Number(c.settleX)}" x2="${Number(c.settleX)}" y1="10" y2="110"/>` : ''}
<path class="line" d="${attr(c.d)}"/>
</svg><figcaption>${esc(c.name)} · ${caption} · ${over}</figcaption></figure>`;
};
const curvesHtml = (curves) => (curves?.length ? `<h3>Curves</h3>
<div class="curves">
${curves.map(curveFigure).join('\n')}
</div>
` : '');

/**
 * @param {object} d
 *   name, folder (absolute), sources [{kind, from}], roles {role: {hex, confidence, evidence, fixed}}, accentText,
 *   pairs, warnings, ask, fonts [{role, family, weight, tracking, source, licence}],
 *   brandFaces [{family, weight, style, rel, unicodeRange}] (the alias families the strips are set in),
 *   chromeFaces [{family, weight, rel, unicodeRange}], logo (null or { canvas, accent, ink } frame files),
 *   motion { name, durations, enter, curves (curvePlots, optional) }, frames { look: [{file, caption}], tempo: [{file, t}] }
 */
export function reviewPage(d) {
  const hex = (role) => hexOf(d.roles[role]?.hex);
  const fixes = ROLE_ORDER.filter((r) => d.roles[r]?.fixed).length;
  const alias = (role) => `'mm-brand-${role}'`;
  const faceStyle = (role) => {
    const f = d.fonts.find((x) => x.role === role) ?? {};
    return `font-family: ${alias(role)}, ${role === 'display' ? 'serif' : role === 'mono' ? 'monospace' : 'sans-serif'}; font-weight: ${Number(f.weight) || 400}; letter-spacing: ${Number(f.tracking) || 0}em;`;
  };
  const out = [];

  out.push(`<header>
<div class="eyebrow">Brand review</div>
<h1>${esc(d.name)}</h1>
<p class="sources">${d.sources.length ? d.sources.map((s) => `${esc(s.kind)} from ${esc(s.from)}`).join(' · ') : 'brand.json'}</p>
<div class="row">${[
    badge('neutral', plural(fixes, 'fix', 'fixes')),
    d.warnings.length ? badge('warning', plural(d.warnings.length, 'warning', 'warnings')) : badge('pass', 'no warnings'),
    d.ask.length ? badge('question', plural(d.ask.length, 'question', 'questions')) : badge('pass', 'nothing to answer'),
    badge('neutral', `accent text ${d.accentText === false ? 'off' : 'on'}`),
  ].join('')}</div>
</header>`);

  if (d.warnings.length || d.ask.length) {
    out.push(`<section class="card">
<h2>Look out</h2>
<ul class="alerts">
${d.warnings.map((w) => `<li>${badge('warning', 'warning')}<span>${esc(w.text)}</span></li>`).join('\n')}
${d.ask.map((q) => `<li>${badge('question', 'question')}<span>${esc(q.question)} <span class="use">answer below</span></span></li>`).join('\n')}
</ul>
</section>`);
  }

  const swatch = (role, small = false, label = role) => {
    const r = d.roles[role];
    const [kind, text] = CONFIDENCE[r.confidence] ?? ['neutral', r.confidence];
    return `<div class="sw${small ? ' small' : ''}">
<div class="chip" style="background:${hexOf(r.hex)}"></div>
<div class="role">${esc(label)}</div>
<div class="hex">${esc(r.hex)}</div>
${badge(kind, text)}
<p class="ev" title="${attr(r.evidence)}">${esc(r.evidence)}</p>${r.fixed ? `
<p class="fixedfrom" title="${attr(r.fixed.why)}">fixed from <i class="mini" style="background:${hexOf(r.fixed.from)}" title="${attr(r.fixed.why)}"></i><span class="mono">${esc(r.fixed.from)}</span></p>` : ''}
</div>`;
  };
  out.push(`<section class="card">
<h2>Palette</h2>
<div class="swatches">
${ROLE_ORDER.map((r) => swatch(r)).join('\n')}
${d.roles.surfaceInk ? swatch('surfaceInk', true, 'surfaceInk (derived)') : ''}
</div>
</section>`);

  const sample = (p) => {
    const bg = hexOf(d.roles[p.bg]?.hex), fg = hexOf(d.roles[p.fg]?.hex);
    if (p.fg === 'line' && p.bg === 'canvas') return `<div class="sample" style="background:${bg}"><div class="rule" style="background:${fg}"></div></div>`;
    const display = p.fg === 'accent' && p.bg === 'canvas';
    return `<div class="sample" style="background:${bg};color:${fg};${faceStyle(display ? 'display' : 'text')}font-size:${display ? 32 : 18}px">Aa Brand text</div>`;
  };
  out.push(`<section class="card">
<h2>Contrast</h2>
<table>
<thead><tr><th>Sample</th><th>Pair</th><th>Ratio</th><th>Need</th><th>Verdict</th></tr></thead>
<tbody>
${d.pairs.map((p) => `<tr class="pair">
<td>${sample(p)}</td>
<td><code>${esc(p.fg)} on ${esc(p.bg)}</code><div class="use">${esc(p.use)}</div></td>
<td class="ratio">${ratioText(p.ratio, p.need)}</td>
<td class="mono">needs ${p.need} : 1${p.aim ? `<br>aim ${p.aim} : 1` : ''}</td>
<td>${badge(p.pass ? 'pass' : 'fail', p.pass ? 'pass' : 'fail')}</td>
</tr>`).join('\n')}
</tbody>
</table>
</section>`);

  const strip = {
    display: () => `<div class="aa">Aa</div><div class="pangram">The quick brown fox jumps over the lazy dog</div>`,
    text: () => `<p class="para">Good type is the part of a brand people read without noticing it. It carries the idea, keeps its place on a crowded screen, and still sounds like the same voice on a phone, a slide and a poster.</p>`,
    mono: () => `<div class="monoline">0123456789 {} [] =&gt; 12.4 : 1 mm brand sheet</div>`,
  };
  out.push(`<section class="card">
<h2>Type</h2>
${['display', 'text', 'mono'].map((role) => {
    const f = d.fonts.find((x) => x.role === role);
    if (!f) return '';
    return `<div class="face">
<div class="strip" style="background:${hex('canvas')};color:${hex('ink')};${faceStyle(role)}">${strip[role]()}</div>
<div class="facemeta">
<div><div class="k">${esc(role)}</div><strong>${esc(f.family)}</strong></div>
<div><div class="k">weight</div>${esc(f.weight)}</div>
<div><div class="k">source</div>${esc(f.source)}</div>
<div>${licenceBadge(f.licence)}</div>
</div>
</div>${f.source === 'stand-in' ? `
<p class="banner">Stand-in face: ${esc(f.family)} is a bundled face standing in for the brand's. Add the brand's own with <code>mm brand font &lt;folder&gt; &lt;file&gt; --family … --role …</code>.</p>` : ''}`;
  }).join('\n')}
</section>`);

  out.push(`<section class="card">
<h2>Look</h2>
<div class="shots look">
${d.frames.look.map((f) => `<figure><img src="${attr(f.file)}" alt="${attr(f.caption)}"><figcaption>${esc(f.caption)}</figcaption></figure>`).join('\n')}
</div>${d.logo ? `
<div class="shots logos">
${[['canvas', 'on canvas'], ['accent', 'on accent'], ['ink', 'mono on ink']].map(([k, c]) => `<figure><img src="${attr(d.logo[k])}" alt="${attr(`logo ${c}`)}"><figcaption>${esc(c)}</figcaption></figure>`).join('\n')}
</div>` : ''}
</section>`);

  const m = d.motion;
  out.push(`<section class="card">
<h2>Motion</h2>
<p><strong>${esc(m.name)}</strong></p>
<table class="timing">
<thead><tr>${['quick', 'standard', 'slow', 'hold', 'enter easing'].map((h) => `<th>${h}</th>`).join('')}</tr></thead>
<tbody><tr>${['quick', 'standard', 'slow', 'hold'].map((k) => `<td class="mono">${esc(m.durations?.[k] ?? '')} ms</td>`).join('')}<td class="mono">${esc(m.enter ?? '')}</td></tr></tbody>
</table>
${curvesHtml(m.curves)}<h3>Tempo</h3>
<div class="tempo">
${d.frames.tempo.map((f) => `<figure style="margin:0"><img src="${attr(f.file)}" alt="${attr(`${f.t.toFixed(2)} s`)}" style="border-radius:8px;box-shadow:0 0 0 1px var(--line);display:block"><figcaption>${f.t.toFixed(2)} s</figcaption></figure>`).join('\n')}
</div>
</section>`);

  if (d.ask.length) {
    out.push(`<section class="card">
<h2>Questions</h2>
${d.ask.map((q) => `<div class="q">
<p>${esc(q.question)}</p>
${q.options.map((o) => {
    const cmd = o.command ?? `mm brand set "${d.folder}" ${q.role}=${o.value}`;
    return `<div class="opt">${/^#[0-9a-f]{6}$/i.test(o.value) ? `<span class="chip20" style="background:${hexOf(o.value)}"></span>` : '<span></span>'}<span class="label">${esc(o.label)}</span><code>${esc(cmd)}</code><button type="button" data-copy="${attr(cmd)}">Copy</button></div>`;
  }).join('\n')}
</div>`).join('\n')}
</section>`);
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<title>Brand review: ${esc(d.name)}</title>
<style>
${faceCss([...d.chromeFaces, ...d.brandFaces])}
${CSS}</style>
</head>
<body>
<div class="wrap">
${out.join('\n')}
<footer>Refresh: <code>mm brand sheet ${esc(d.folder)}</code></footer>
</div>
<script>
${SCRIPT}
</script>
</body>
</html>
`;
}
