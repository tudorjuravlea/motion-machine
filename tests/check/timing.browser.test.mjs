// scripts/check/timing.mjs runs in Chromium. The page builds each format's schedule the
// way the studio will (story.json, style.json and the beat grid fetched; forFormat, resolveStory,
// addImplicitPlays with the recordings' media.json, the pattern modules imported from the piece's
// patterns base; schedule) and calls timingRules; the verdicts equal Node's for two pieces.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { relative } from 'node:path';
import { ROOT, launchBrowser, serveRoot } from '../../scripts/lib/browser.mjs';
import { refsOf } from '../../scripts/check/_lib.mjs';
import { loadGrid } from '../../scripts/sound.mjs';
import { timingRules } from '../../scripts/check/timing.mjs';
import { prepare } from './_timing-snapshot.mjs';

let browser, server, page;

before(async () => {
  browser = await launchBrowser();
  server = await serveRoot(ROOT);
  page = await browser.newPage();
  await page.goto(`${server.url}/contracts/story.schema.json`);   // any file: the page only needs the origin
});

after(async () => { await browser?.close(); await server?.close(); });

// Runs in the page: everything the studio has is a URL.
async function inPage({ piece, format, patternsBase, refs }) {
  const [{ resolveStory, forFormat, schedule, addImplicitPlays }, { timingRules }, { beatsOf }] = await Promise.all([
    import('/runtime/kit/schedule.js'), import('/scripts/check/timing.mjs'), import('/scripts/lib/cues.mjs')]);
  const json = async (url) => { const r = await fetch(url); return r.ok ? r.json() : null; };
  const written = await json(`/${piece}/story.json`);
  const style = await json(`/${piece}/style.json`);
  const story = resolveStory(forFormat(written, format), style);
  const folders = [...new Set(story.scenes.flatMap((sc) => sc.beats.flatMap((b) => [b.asset, ...(b.screen ?? []).map((a) => (a.do === 'screen/swap' ? a.params?.to : null))])).filter((a) => a?.endsWith('/')))];
  const metas = new Map(await Promise.all(folders.map(async (a) => [a, await json(`/${piece}/${a}media.json`).catch(() => null)])));
  addImplicitPlays(story, (a) => metas.get(a) ?? null);
  const patterns = {};
  for (const ref of refs) { try { patterns[ref] = (await import(`/${patternsBase}/${ref}/pattern.js`)).default; } catch { /* absent: the kit's default timing */ } }
  let grid = { beats: null, declared: false };
  if (written.audio?.beats) {
    const j = await json(`/${piece}/${written.audio.beats}`);
    grid = j ? { beats: beatsOf(j), declared: true } : { beats: null, declared: true, missing: written.audio.beats };
  }
  const rows = await timingRules({ schedule: schedule(story, style, { patterns: Object.fromEntries(Object.entries(patterns).filter(([, m]) => m)) }), story, style, grid });
  return JSON.parse(JSON.stringify(rows));
}

for (const piece of ['pieces/golden-film-kinetic', 'pieces/demo-film', 'pieces/demo-deck']) {
  test(`timing.mjs in Chromium gives Node's verdicts: ${piece}, every format`, async () => {
    for (const [format, ctx] of Object.entries(await prepare(piece))) {
      const node = JSON.parse(JSON.stringify(await timingRules({ schedule: ctx.schedule, story: ctx.story, style: ctx.style, grid: loadGrid(ctx.dir, ctx.story) })));
      const refs = [...new Set(refsOf(ctx.story).map((r) => r.ref))].filter((r) => r && !r.startsWith('layouts/') && !r.startsWith('sound/'));
      const patternsBase = relative(ROOT, ctx.patternsBase);
      const web = await page.evaluate(inPage, { piece, format, patternsBase, refs });
      assert.deepEqual(web, node, `${piece} ${format}`);
      assert.ok(node.some((r) => r.status !== 'SKIP'), 'something was measured');
    }
  });
}
