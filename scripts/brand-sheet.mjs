// `mm brand sheet <folder> [--motion <name|path>]`: the review sheet of a brand folder. In one Chromium session it
// photographs three patterns at rest and the entrance of a statement headline in the brand's composed style (the
// brand folder worn in the motion half, default calm), renders the logo on three grounds when there is one, and
// writes sheets/review.html (self-contained, fonts beside it), sheets/review.png and sheets/frames/.
// The data is sources/onboard.json when the folder has one; otherwise the roles are read from brand.json and put
// through the same role rules, so a plain `mm brand init` folder gets a sheet too.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ROOT, framePng, launchBrowser, openPiece, serveRoot } from './lib/browser.mjs';
import { ROLES, pairsOf, reviewRoles } from './lib/brand-roles.mjs';
import { CHROME_FACES, reviewPage } from './lib/brand-sheet-page.mjs';
import { UsageError, findFontSrc, runMain } from './lib/cli.mjs';
import { workDir } from './lib/project.mjs';
import { composeToFile, resolveHalf } from './compose.mjs';
import { newPiece } from './new.mjs';

const readJson = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new UsageError(`${file}: ${e.message}`); } };
const familyDir = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const LOOKS = [['look-title', 'layouts/title-stack', 'Title'], ['look-statement', 'layouts/statement', 'Statement'], ['look-stat', 'layouts/stat-hero', 'Stat']];
const TEMPO_FRAMES = 8;

/** The licence a font family's LICENSE.txt grants, in the words the sheet shows. */
function licenceOf(fontFile) {
  const file = join(dirname(fontFile), 'LICENSE.txt');
  if (!existsSync(file)) return 'unknown';
  const text = readFileSync(file, 'utf8');
  if (/SIL Open Font License|\bOFL\b/i.test(text)) return 'SIL OFL 1.1';
  if (/Apache License/i.test(text)) return 'Apache 2.0';
  return 'unknown';
}

/**
 * Everything the page shows that is not a picture: { name, sources, roles, accentText, pairs, warnings, ask, fonts }
 * plus the brand's font files to copy ({ role, family, abs, weight, style, unicodeRange }).
 */
export function sheetData(dir, brand, onboard) {
  const files = [];
  const fonts = ['display', 'text', 'mono'].map((role) => {
    const face = brand.type?.[role];
    if (!face) return null;
    let licence = 'unknown';
    for (const f of face.files ?? []) {
      const abs = findFontSrc(f.src, join(dir, 'brand.json'));
      if (!abs) { console.error(`mm brand sheet: font file missing: ${f.src}`); continue; }
      if (licence === 'unknown') licence = licenceOf(abs);
      files.push({ role, family: face.family, abs, weight: f.weight ?? face.weight, style: f.style, unicodeRange: f.unicodeRange });
    }
    const named = onboard?.fonts?.find((x) => x.role === role);
    return { role, family: named?.family ?? face.family, weight: face.weight, tracking: face.tracking, source: named?.source ?? 'brand', licence: named?.licence ?? licence };
  }).filter(Boolean);

  if (onboard) {
    for (const r of ROLES) if (!/^#[0-9a-f]{6}$/i.test(String(onboard.roles?.[r]?.hex))) throw new UsageError(`sources/onboard.json has no usable colour for the role ${r}`);
    const hexes = Object.fromEntries(Object.entries(onboard.roles).map(([r, v]) => [r, v.hex]));
    return {
      name: onboard.brand ?? brand.name, sources: onboard.sources ?? [], roles: onboard.roles, accentText: onboard.accentText !== false,
      pairs: onboard.pairs ?? pairsOf(hexes), warnings: onboard.warnings ?? [], ask: onboard.ask ?? [], fonts, files,
    };
  }
  const input = Object.fromEntries(ROLES.map((r) => [r, { hex: brand.color[r], confidence: 'measured', source: 'brand.json', evidence: `color.${r} in brand.json`, fixed: null }]));
  const { roles, accentText, warnings, ask } = reviewRoles(input);
  const hexes = Object.fromEntries(Object.entries(roles).map(([r, v]) => [r, v.hex]));
  return { name: brand.name, sources: [], roles, accentText, pairs: pairsOf(hexes), warnings, ask, fonts, files };
}

/** A page that shows `svg` (as an image, so its own script never runs) on a ground, screenshot at 960 x 540. */
async function logoFrame(browser, svg, { ground, silhouette = null }) {
  const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  const mark = silhouette
    ? `<div style="width:672px;height:270px;background:${silhouette};-webkit-mask:url(${uri}) center/contain no-repeat;mask:url(${uri}) center/contain no-repeat"></div>`
    : `<img src="${uri}" style="height:270px;max-width:672px;object-fit:contain">`;
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  try {
    await page.setContent(`<body style="margin:0;width:960px;height:540px;background:${ground};display:flex;align-items:center;justify-content:center">${mark}</body>`);
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {}))));
    return await page.screenshot({ type: 'png' });
  } finally { await page.close(); }
}

/** Renders the sheet for the brand folder; returns { sheets, html, png, frames, problems }. */
export async function sheetBrand(folderArg, { motion = 'calm', cwd = process.cwd() } = {}) {
  const dir = resolve(cwd, folderArg ?? '');
  if (!folderArg || !existsSync(join(dir, 'brand.json'))) throw new UsageError(`${dir} holds no brand.json; make a brand folder with: mm brand init <folder>`);
  const brand = readJson(join(dir, 'brand.json'));
  const onboardFile = join(dir, 'sources', 'onboard.json');
  const onboard = existsSync(onboardFile) ? readJson(onboardFile) : null;
  const data = sheetData(dir, brand, onboard);
  const motionHalf = readJson(resolveHalf('motion', motion));

  const logoRel = onboard ? onboard.logo?.file : (existsSync(join(dir, 'logo', 'logo.svg')) ? 'logo/logo.svg' : null);
  const logoSvg = logoRel && existsSync(join(dir, logoRel)) ? readFileSync(join(dir, logoRel), 'utf8') : null;
  const monoSvg = onboard?.logo?.mono && existsSync(join(dir, onboard.logo.mono)) ? readFileSync(join(dir, onboard.logo.mono), 'utf8') : null;

  const sheets = join(dir, 'sheets'), frames = join(sheets, 'frames');
  rmSync(sheets, { recursive: true, force: true });
  mkdirSync(frames, { recursive: true });

  // the brand's composed style, in a hidden work piece inside the engine (the kit is served from the engine's root)
  const work = workDir(ROOT, dir, 'sheet'), staging = `${work}.compose`;
  const problems = [];
  let server = null, browser = null;
  try {
    composeToFile({ brand: join(dir, 'brand.json'), motion, out: join(staging, 'style.json'), from: { brand: 'brand.json', motion: basename(motion) } });
    rmSync(work, { recursive: true, force: true });
    mkdirSync(dirname(work), { recursive: true });
    newPiece({ kind: 'film', style: join(staging, 'style.json'), id: 'sheet', dir: work });

    server = await serveRoot(ROOT);
    browser = await launchBrowser();
    const tempo = [];
    for (const [file, pattern] of LOOKS) {
      const story = readJson(join(ROOT, 'patterns', pattern, 'demo', 'story.json'));
      story.id = 'sheet';
      story.scenes = [story.scenes[0]];
      writeFileSync(join(work, 'story.json'), `${JSON.stringify(story, null, 2)}\n`);
      const opened = await openPiece(work, { format: '16x9', browser, server });
      try {
        const sched = await opened.page.evaluate(() => ({ rests: window.mm.schedule.rests, events: window.mm.schedule.events }));
        writeFileSync(join(frames, `${file}.png`), await framePng(opened.page, sched.rests[0]));
        if (file === 'look-statement') {
          const head = sched.events.find((e) => e.kind === 'arrive' && /data-slot="headline"/.test(e.selector ?? ''));
          const end = head ? head.t + (head.d ?? 0) : 1;
          for (let k = 0; k < TEMPO_FRAMES; k++) {
            const t = (end * k) / (TEMPO_FRAMES - 1);
            writeFileSync(join(frames, `tempo-${k}.png`), await framePng(opened.page, t));
            tempo.push({ file: `frames/tempo-${k}.png`, t });
          }
        }
        problems.push(...opened.errors);
      } finally { await opened.close(); }
    }

    let logo = null;
    if (logoSvg) {
      const c = data.roles;
      writeFileSync(join(frames, 'logo-canvas.png'), await logoFrame(browser, logoSvg, { ground: c.canvas.hex }));
      writeFileSync(join(frames, 'logo-accent.png'), await logoFrame(browser, logoSvg, { ground: c.accent.hex }));
      writeFileSync(join(frames, 'logo-ink.png'), await logoFrame(browser, monoSvg ?? logoSvg, { ground: c.ink.hex, silhouette: c.canvas.hex }));
      logo = { canvas: 'frames/logo-canvas.png', accent: 'frames/logo-accent.png', ink: 'frames/logo-ink.png' };
    }

    // every face the page uses sits beside it, so the sheet opens from a folder with nothing else
    const copy = (from, rel) => { mkdirSync(join(sheets, dirname(rel)), { recursive: true }); copyFileSync(from, join(sheets, rel)); return rel; };
    const chromeFaces = CHROME_FACES.map((f) => ({ ...f, rel: copy(join(ROOT, 'styles', 'fonts', f.dir, f.file), `assets/fonts/${f.dir}/${f.file}`) }));
    const brandFaces = data.files.map((f) => ({ family: `mm-brand-${f.role}`, weight: f.weight, style: f.style, unicodeRange: f.unicodeRange, rel: copy(f.abs, `assets/fonts/${familyDir(f.family)}/${basename(f.abs)}`) }));

    const m = motionHalf.motion ?? {};
    const html = reviewPage({
      ...data, folder: dir, logo, chromeFaces, brandFaces,
      motion: { name: motionHalf.name ?? basename(motion, '.json'), durations: m.durations, enter: m.easings?.enter },
      frames: { look: LOOKS.map(([file, , caption]) => ({ file: `frames/${file}.png`, caption })), tempo },
    });
    writeFileSync(join(sheets, 'review.html'), html);

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    try {
      page.on('requestfailed', (r) => problems.push(`${r.url()}: ${r.failure()?.errorText ?? 'failed'}`));
      await page.goto(pathToFileURL(join(sheets, 'review.html')).href, { waitUntil: 'load' });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
      writeFileSync(join(sheets, 'review.png'), await page.screenshot({ fullPage: true, type: 'png' }));
    } finally { await page.close(); }
    return { sheets, html: join(sheets, 'review.html'), png: join(sheets, 'review.png'), frames, problems };
  } finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
    rmSync(work, { recursive: true, force: true });
    rmSync(staging, { recursive: true, force: true });
  }
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { motion: { type: 'string' } } });
  if (positionals.length !== 1) throw new UsageError('name the brand folder: mm brand sheet <folder> [--motion <name|path>]');
  const r = await sheetBrand(positionals[0], { motion: values.motion });
  for (const p of r.problems) console.error(`mm brand sheet: ${p}`);
  console.log(`wrote ${r.html}\n  ${r.png}`);
  return 0;
});
