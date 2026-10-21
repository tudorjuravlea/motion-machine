// node scripts/pattern-stills.mjs <group>/<name> --style styles/presets/<p>.json [--format 16x9]
// Scaffolds a throwaway piece in patterns/<group>/<name>/demo/out/.piece/ (the demo's story and its
// assets/, the given style, the repo's patterns/ and fonts), photographs every rest and every mid-entrance, and
// writes demo/out/<style>-contact.png plus the frames in demo/out/<style>/.
// `--style all` runs the three shipped presets. Exit 2 on usage or a missing demo.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, openPiece } from './lib/browser.mjs';
import { composeSheet } from './lib/sheet.mjs';
import { UsageError, relativiseFonts, resolveStyle, runMain, slug } from './lib/cli.mjs';
import { photograph } from './stills.mjs';

const posix = (p) => p.split(sep).join('/');

const indexHtml = (rel, patternsRel) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>pattern demo</title>
</head>
<body>
  <script type="module">
    import { mount } from '${rel}runtime/kit/kit.js';
    const load = (f) => fetch(new URL(f, import.meta.url)).then((r) => r.json());
    const [story, style] = await Promise.all([load('story.json'), load('style.json')]);
    await mount({ story, style, patternsBase: new URL('${patternsRel}', import.meta.url) });
  </script>
</body>
</html>
`;

export async function patternStills(name, styleArg, { format, patterns = join(ROOT, 'patterns') } = {}) {
  const demo = join(patterns, name, 'demo');
  if (!existsSync(join(demo, 'story.json'))) throw new UsageError(`${relative(ROOT, demo)}/story.json not found`);
  const styleFile = resolveStyle(styleArg);
  const styleName = basename(styleFile, '.json');
  const outDir = join(demo, 'out'), pieceDir = join(outDir, '.piece');
  rmSync(pieceDir, { recursive: true, force: true });
  mkdirSync(pieceDir, { recursive: true });
  const rel = posix(relative(pieceDir, ROOT)) + '/';
  const patternsRel = posix(relative(pieceDir, patterns)) + '/';
  cpSync(join(demo, 'story.json'), join(pieceDir, 'story.json'));
  if (existsSync(join(demo, 'assets'))) cpSync(join(demo, 'assets'), join(pieceDir, 'assets'), { recursive: true });   // a demo's beat assets (layouts/media)
  writeFileSync(join(pieceDir, 'style.json'), JSON.stringify(relativiseFonts(JSON.parse(readFileSync(styleFile, 'utf8')), styleFile, pieceDir), null, 2) + '\n');
  writeFileSync(join(pieceDir, 'index.html'), indexHtml(rel, patternsRel));

  const opened = await openPiece(pieceDir, { format });
  try {
    const shot = await photograph(opened);
    const frames = join(outDir, styleName);
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    shot.tiles.forEach((t, i) => writeFileSync(join(frames, `${String(i + 1).padStart(2, '0')}-${t.kind}-${slug(t.t)}.png`), t.png));
    const sheet = await composeSheet(shot.tiles, { columns: Math.min(4, shot.tiles.length), tileWidth: 480, browser: opened.browser });
    const contact = join(outDir, `${styleName}-contact.png`);
    writeFileSync(contact, sheet.png);
    const problems = [...opened.errors, ...(await opened.mm.meta()).warnings];
    return { style: styleName, format: opened.format, contact, frames, tiles: shot.tiles.length, rests: shot.rests, midEntrances: shot.midEntrances, problems };
  } finally {
    await opened.close();
    rmSync(pieceDir, { recursive: true, force: true });
  }
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { style: { type: 'string', default: 'editorial' }, format: { type: 'string' }, patterns: { type: 'string' } } });
  const name = positionals[0]?.replace(/^patterns\//, '').replace(/\/$/, '');
  if (!name || !/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(name)) throw new UsageError('usage: pattern-stills.mjs <group>/<name> --style styles/presets/<p>.json [--format 16x9]');
  const styles = values.style === 'all'
    ? readdirSync(join(ROOT, 'styles/presets')).filter((f) => f.endsWith('.json')).map((f) => join(ROOT, 'styles/presets', f))
    : [values.style];
  for (const s of styles) {
    const r = await patternStills(name, s, { format: values.format, patterns: values.patterns ? resolve(values.patterns) : undefined });
    console.log(`${name} · ${r.style} · ${r.format}: ${r.rests} rests, ${r.midEntrances} mid-entrances -> ${relative(ROOT, r.contact)}`);
    for (const p of r.problems) console.log(`  warning: ${p}`);
  }
  return 0;
});
