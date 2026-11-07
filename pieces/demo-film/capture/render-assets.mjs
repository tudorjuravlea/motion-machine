// Renders the pictures the demo film and deck put on screen: every one is the
// machine's own output or a fixture it read, drawn here by the same kit and Chromium flags the
// exporter uses, and written to pieces/demo-film/assets/media/ (the deck gets a copy).
//   node pieces/demo-film/capture/render-assets.mjs [name …]
// Names: swap posters site palette contact check library (default: all). Facts: capture/assets.json.
// Before `check`: node scripts/mm.mjs check pieces/golden-film-kinetic (the picture reads its out/check.json).
// Before `library`: node scripts/pattern-stills.mjs <group>/<name> --style nocturne-kinetic for every pattern
// (the wall reads patterns/<group>/<name>/demo/out/nocturne-kinetic/).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, openPiece, framePng, launchBrowser, serveRoot } from '../../../scripts/lib/browser.mjs';
import { composeSheet } from '../../../scripts/lib/sheet.mjs';
import { list } from '../../../scripts/pattern-lint.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'assets', 'media');
const DECK = join(ROOT, 'pieces/demo-deck/assets/media');
mkdirSync(OUT, { recursive: true });
const font = (p) => pathToFileURL(join(ROOT, 'styles/fonts', p)).href;
const FACES = `
@font-face { font-family: "Plex"; font-weight: 400; src: url("${font('ibm-plex-mono/ibm-plex-mono-latin-400-normal.woff2')}"); }
@font-face { font-family: "Manrope"; font-weight: 400; src: url("${font('manrope/manrope-latin-400-normal.woff2')}"); }
@font-face { font-family: "Manrope"; font-weight: 700; src: url("${font('manrope/manrope-latin-700-normal.woff2')}"); }
@font-face { font-family: "Fraunces"; font-weight: 700; src: url("${font('fraunces/fraunces-latin-700-normal.woff2')}"); }`;
const log = {};
const server = await serveRoot(ROOT);
const browser = await launchBrowser();
const save = (name, png, note) => { writeFileSync(join(OUT, name), png); log[name] = note; console.log(`${name}: ${note}`); };

// A piece's instant in one format, through the exporter's own frame path.
async function frames(piece, format, pick) {
  const o = await openPiece(join(ROOT, 'pieces', piece), { server, browser, format });
  try {
    const { schedule } = await o.mm.meta();
    const out = [];
    for (const t of pick(schedule)) out.push({ t, png: await framePng(o.page, t) });
    return out;
  } finally { await o.close(); }
}
const frame30 = (t) => Math.round(t * 30) / 30;

// An HTML page of our own (palette, report, mosaic) shot at its natural size.
async function shoot(html, width, height) {
  const file = join(HERE, '.render.html');
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${FACES}\nhtml,body{margin:0}</style>${html}`);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

const jobs = {
  // One story, three brands: the three swap pieces at the same rest (scene 2, "Brand, worn with motion.").
  async swap() {
    for (const [piece, name] of [['demo-swap-editorial', 'swap-editorial'], ['demo-swap-kinetic', 'swap-kinetic'], ['demo-swap-calm-product', 'swap-calm-product']]) {
      const [f] = await frames(piece, '16x9', (s) => [frame30(s.rests[1])]);
      save(`${name}.png`, f.png, `pieces/${piece}, 16x9, rest of scene 2 (halves) at ${f.t.toFixed(3)} s`);
    }
  },
  // The golden editorial film's poster instant (its first rest) in 9x16 and 16x9.
  async posters() {
    for (const format of ['9x16', '16x9']) {
      const [f] = await frames('golden-film-editorial', format, (s) => [frame30(s.rests[0])]);
      save(`golden-editorial-${format}.png`, f.png, `pieces/golden-film-editorial, ${format}, first rest (the poster instant) at ${f.t.toFixed(3)} s`);
      // The device screens are not 9:16 and 16:9 (phone 0.454, laptop 1.456, measured in the demo
      // film): extend each frame with the film's own canvas colour to the screen's shape plus 10 %
      // of width, so object-fit: cover and a 1.08 push-in crop canvas, never the poster's type.
      const canvas = JSON.parse(readFileSync(join(ROOT, 'pieces/golden-film-editorial/style.json'), 'utf8')).color.canvas.slice(1);
      const [w, h, r] = format === '9x16' ? [1080, 1920, 0.4541] : [1920, 1080, 1.4555];
      const W = Math.round(w * 1.1 / 2) * 2, H = Math.max(h, Math.round(W / r / 2) * 2);
      const src = join(OUT, `golden-editorial-${format}.png`), dst = join(OUT, `golden-editorial-${format}-screen.png`);
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', src, '-vf', `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x${canvas}`, dst]);
      log[`golden-editorial-${format}-screen.png`] = `golden-editorial-${format}.png extended with its canvas #${canvas} to ${W} x ${H} (the ${format === '9x16' ? 'phone' : 'laptop'} screen's shape, 10 % side margin)`;
    }
  },
  // The fixture site mm brand capture read, as Chromium draws it.
  async site() {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    await page.goto(`${server.url}/fixtures/capture/site/index.html`);
    await page.evaluate(() => document.fonts.ready);
    save('site-harbour-pine.png', await page.screenshot({ type: 'png' }), 'fixtures/capture/site/index.html at 1440 x 900');
    await page.close();
  },
  // The seven colour roles mm brand capture read from that site, as swatches.
  async palette() {
    const cap = JSON.parse(readFileSync(join(HERE, 'harbour-pine.json'), 'utf8'));
    const lum = (hex) => { const c = hex.slice(1).match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const on = (hex) => (lum(hex) > 0.25 ? cap.color.ink : cap.color.accentInk);
    const roles = ['accent', 'canvas', 'ink', 'muted', 'surface', 'line', 'accentInk'];
    const cell = (r, big) => `<div class="s${big ? ' big' : ''}" style="background:${cap.color[r]};color:${on(cap.color[r])}"><b>${r}</b><span>${cap.color[r]}</span></div>`;
    const html = `<style>body{background:#0E0C12}.g{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:2fr 1fr 1fr;gap:16px;width:1200px;height:1200px;box-sizing:border-box;padding:16px}
      .s{border-radius:14px;display:flex;flex-direction:column;justify-content:flex-end;padding:28px;font-family:Manrope;box-shadow:inset 0 0 0 2px rgba(0,0,0,.08)}.s b{font-weight:700;font-size:34px}.s span{font-family:Plex;font-size:40px;margin-top:6px}
      .big{grid-column:1/span 3}.big b{font-size:56px}.big span{font-size:96px}</style>
      <div class="g">${cell(roles[0], true)}${roles.slice(1).map((r) => cell(r)).join('')}</div>`;
    save('palette-harbour-pine.png', await shoot(html, 1200, 1200), 'pieces/demo-film/capture/harbour-pine.json color roles (as captured, before the muted fix)');
  },
  // A contact sheet of the golden kinetic film: one frame a second, each labelled with its t.
  async contact() {
    const fs = await frames('golden-film-kinetic', '16x9', () => Array.from({ length: 30 }, (_, i) => i + 0.5));
    const sheet = await composeSheet(fs.map((f) => ({ png: f.png, label: `t = ${f.t.toFixed(1)} s` })), { columns: 6, tileWidth: 400, gap: 10, margin: 14, labelHeight: 30, browser });
    save('contact-golden-kinetic.png', sheet.png, 'pieces/golden-film-kinetic, 16x9, t = 0.5 to 29.5 s every 1 s, through framePng');
  },
  // The gate's report on the golden kinetic film: its 16 W- rules as measured (a slice; the totals
  // line counts every rule).
  async check() {
    const c = JSON.parse(readFileSync(join(ROOT, 'pieces/golden-film-kinetic/out/check.json'), 'utf8'));
    const n = {}; for (const r of c.rules) n[r.status] = (n[r.status] ?? 0) + 1;
    const ev = (r) => { const e = r.evidence ?? {}; if (e.reason) return e.reason; if (e.measured != null) return `${e.measured}${e.threshold != null ? ` / ${e.threshold}` : ''}`; const k = Object.keys(e).filter((x) => x !== 'format')[0]; return k ? `${k}: ${JSON.stringify(e[k])}` : ''; };
    const row = (r) => `<div class="r ${r.status}"><b>${r.id}</b><i>${r.status}</i><span>${ev(r).replace(/[<&]/g, '').slice(0, 34)}</span></div>`;
    const html = `<style>body{background:#1A1720;color:#F3ECE2;font-family:Plex}.w{width:1100px;padding:40px 48px;box-sizing:border-box}
      h1{font:700 36px Manrope;margin:0 0 6px;color:#F3ECE2}p{margin:0 0 22px;font-size:26px;color:#9C95A6}
      .r{display:grid;grid-template-columns:290px 120px 1fr;align-items:baseline;font-size:33px;line-height:60px;border-bottom:1px solid #2C2834}
      .r b{font-weight:400}.r i{font-style:normal}.r span{color:#9C95A6;font-size:22px;white-space:nowrap;overflow:hidden}
      .PASS i{color:#F3ECE2}.WARN i,.FAIL i{color:#FF5B29}.SKIP i,.SKIP b{color:#9C95A6}
      .t{margin-top:24px;font:700 34px Manrope}</style>
      <div class="w"><h1>mm check pieces/golden-film-kinetic</h1><p>out/check.json · the ${c.rules.filter((r) => r.id.startsWith('W-')).length} W- rules of ${c.rules.length}</p>${c.rules.filter((r) => r.id.startsWith('W-')).map(row).join('')}
      <div class="t">${['PASS', 'WARN', 'SKIP', 'FAIL'].filter((s) => n[s]).map((s) => `${n[s]} ${s}`).join(' · ')} of ${c.rules.length}</div></div>`;
    const page = await browser.newPage({ viewport: { width: 1100, height: 400 }, deviceScaleFactor: 1 });
    const file = join(HERE, '.render.html');
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${FACES}\nhtml,body{margin:0}</style>${html}`);
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    save('check-golden-kinetic.png', await page.screenshot({ type: 'png', fullPage: true }), `pieces/golden-film-kinetic/out/check.json ${JSON.stringify(n)}`);
    await page.close();
  },
  // The library as a wall: every pattern, a still of its demo in this film's style (sound has none).
  async library() {
    const ids = list();   // the complete patterns, as `mm pattern list` names them
    const cols = Math.ceil(ids.length / 10), width = cols * 320;   // ten rows, wide enough for the longest label
    // Which still shows the pattern working: an entrance mid-way in, an exit, emphasis or text at
    // its last mid-frame, a transition at its first mid-frame after the first rest (the cut), the
    // rest for layouts, devices, moves and data.
    const at = (f) => Number(f.replace(/^\d+-(rest|mid)-/, '').replace('.png', '').replace('-', '.'));
    const choose = (id, files) => {
      const mids = files.filter((f) => f.includes('-mid-')).sort((a, b) => at(a) - at(b)), rests = files.filter((f) => f.includes('-rest-')).sort((a, b) => at(a) - at(b));
      const g = id.split('/')[0];
      if (g === 'entrances') return mids[0];
      if (g === 'exits' || g === 'emphasis' || g === 'text') return mids.at(-1);
      if (g === 'transitions') return mids.find((f) => rests[0] && at(f) > at(rests[0]));
      return rests[0];
    };
    const cells = ids.map((id) => {
      const dir = join(ROOT, 'patterns', id, 'demo/out/nocturne-kinetic');
      const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png') && !/ \d\.png$/.test(f)).sort() : [];
      const pick = choose(id, files) ?? files[0];
      const img = pick ? `<img src="data:image/png;base64,${readFileSync(join(dir, pick)).toString('base64')}">` : `<div class="snd">♪</div>`;
      return `<div class="c">${img}<span>${id}</span></div>`;
    });
    const html = `<style>body{background:#0E0C12}.m{display:grid;grid-template-columns:repeat(${cols},1fr);gap:10px;width:${width}px;padding:14px;box-sizing:border-box}
      .c{background:#1A1720;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}.c img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block}
      .snd{aspect-ratio:16/10;display:flex;align-items:center;justify-content:center;font:700 96px Fraunces;color:#FF5B29}
      .c span{font:400 19px Plex;color:#F3ECE2;padding:6px 10px 8px;white-space:nowrap;overflow:hidden}</style><div class="m">${cells.join('')}</div>`;
    const file = join(HERE, '.render.html');
    writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>${FACES}\nhtml,body{margin:0}</style>${html}`);
    const page = await browser.newPage({ viewport: { width, height: 400 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(file).href);
    await page.evaluate(() => document.fonts.ready);
    save('library-wall.png', await page.screenshot({ type: 'png', fullPage: true }), `${ids.length} patterns from patterns/*/*/PATTERN.md; stills from each demo/out/nocturne-kinetic (mm pattern stills), sound patterns drawn as a note`);
    await page.close();
  },
};

try {
  const want = process.argv.slice(2);
  for (const [name, job] of Object.entries(jobs)) if (!want.length || want.includes(name)) await job();
} finally {
  await browser.close(); await server.close();
  const f = join(HERE, '.render.html'); if (existsSync(f)) (await import('node:fs')).rmSync(f);
}
const notes = join(HERE, 'assets.json');
const prev = existsSync(notes) ? JSON.parse(readFileSync(notes, 'utf8')) : {};
writeFileSync(notes, JSON.stringify({ ...prev, ...log }, null, 2) + '\n');
mkdirSync(DECK, { recursive: true });
cpSync(OUT, DECK, { recursive: true });
