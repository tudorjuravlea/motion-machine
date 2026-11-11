// The one-file deck (buildStandalone with `oneFile`, mm export --one-file): a single HTML file with the stylesheets,
// fonts, pictures and sound inside it. Copied alone into an empty folder and opened from file://, it must load with no
// failed request, press, and show its pictures from blob: URLs; the folder deck is the same with or without it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, launchBrowser } from '../../scripts/lib/browser.mjs';
import { buildStandalone } from '../../scripts/lib/standalone.mjs';

const dir = join(ROOT, 'pieces', `.tmp-one-file-${process.pid}`);
const alone = mkdtempSync(join(tmpdir(), 'mm-one-file-'));
let browser, story, style, oneFile, folderHtml;

before(async () => {
  rmSync(dir, { recursive: true, force: true });
  cpSync(join(ROOT, 'pieces', 'demo-deck'), dir, { recursive: true, filter: (s) => !/[\\/]out$/.test(s) });
  story = JSON.parse(readFileSync(join(dir, 'story.json'), 'utf8'));
  style = JSON.parse(readFileSync(join(dir, 'style.json'), 'utf8'));
  buildStandalone(dir, join(dir, 'out', 'plain'), { story, style });
  folderHtml = readFileSync(join(dir, 'out', 'plain', 'index.html'));
  oneFile = join(dir, 'out', 'one.html');
  buildStandalone(dir, join(dir, 'out', 'deck'), { story, style, oneFile });
  browser = await launchBrowser();
});
after(async () => { await browser?.close(); rmSync(dir, { recursive: true, force: true }); rmSync(alone, { recursive: true, force: true }); });

test('the folder deck is byte-for-byte the same with and without oneFile', () => {
  assert.ok(folderHtml.equals(readFileSync(join(dir, 'out', 'deck', 'index.html'))));
});

test('a story with a folder asset is refused for one file, naming the asset', () => {
  const bad = structuredClone(story);
  bad.scenes[0].beats[0].asset = 'assets/app/';
  assert.throws(() => buildStandalone(dir, join(dir, 'out', 'bad'), { story: bad, style, oneFile: join(dir, 'out', 'bad.html') }), /--one-file.*assets\/app\//);
});

test('the file opens alone from file://: no failed request, the press works, a picture is a blob with pixels, each font keeps its licence', async () => {
  const html = join(alone, 'one.html');
  copyFileSync(oneFile, html);   // nothing else beside it
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const failed = [], asked = [], problems = [];
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('request', (r) => asked.push(r.url()));
  page.on('pageerror', (e) => problems.push(String(e)));
  try {
    await page.goto(`file://${html}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.mm?.player);
    assert.deepEqual(failed, []);
    assert.ok(asked.every((u) => /^(file:\/\/\/[^?]*one\.html|blob:|data:)/.test(u)), asked.join('\n'));
    assert.deepEqual(problems, []);
    const warnings = await page.evaluate(() => window.mm.warnings);
    assert.ok(!warnings.some((w) => /did not load/.test(w)), warnings.join('\n'));
    const before = await page.evaluate(() => window.mm.position());
    await page.evaluate(() => window.mm.next());
    await page.waitForFunction((x) => window.mm.position() > x, before, { timeout: 20000 });
    await page.evaluate(() => window.mm.goto?.(0));
    const imgs = await page.evaluate(async () => {
      const list = [...document.querySelectorAll('img[src]')];
      await Promise.all(list.map((i) => i.decode().catch(() => {})));
      return list.map((i) => ({ src: i.src, w: i.naturalWidth }));
    });
    assert.ok(imgs.length > 0, 'the deck has pictures');
    assert.ok(imgs.some((i) => i.src.startsWith('blob:') && i.w > 0), JSON.stringify(imgs.slice(0, 3)));
    assert.ok(await page.evaluate(() => [...document.fonts].some((f) => f.status === 'loaded')), 'a font loaded');
  } finally { await page.close(); }
  const payload = JSON.parse(/<script id="mm-payload" type="application\/json">([\s\S]*?)<\/script>/.exec(readFileSync(oneFile, 'utf8'))[1]);
  const licences = Object.keys(payload.files).filter((k) => /^fonts\/.+\/LICENSE\.txt$/.test(k));
  assert.ok(licences.length > 0, 'a font licence travels in the file');
});
