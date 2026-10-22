// mount() reads the story it is given and never writes to it: a host that reuses the object (the
// studio, a test) sees the same story after the mount, even when the kit adds an implicit
// screen/play for a recording.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { PAGE, mediaAssets } from './media-assets.mjs';

let server, browser;
before(async () => { mediaAssets('rec'); server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

test('mounting a story with a recording leaves the caller\'s story object unchanged', async () => {
  const o = await openPiece(PAGE, { server, browser, format: '16x9', query: { story: 'film' } });
  try {
    const out = await o.page.evaluate(async () => {
      const { mount } = await import('../../../runtime/kit/kit.js');
      const load = (f) => fetch(new URL(f, location.href)).then((r) => r.json());
      const story = await load('screen.json');
      const style = await load('../../../styles/presets/editorial.json');
      for (const face of Object.values(style.type)) for (const f of face.files) f.src = `../../../${f.src}`;
      const before = JSON.stringify(story);
      const root = document.createElement('div');
      document.body.append(root);
      await mount({ story, style, root, patternsBase: new URL('../../../patterns/', location.href) });
      const planned = window.mm.schedule.events.some((e) => e.pattern === 'screen/play');
      return { same: JSON.stringify(story) === before, planned };
    });
    assert.ok(out.planned, 'the kit scheduled the recording\'s implicit play');
    assert.ok(out.same, 'the story object is unchanged by mount');
  } finally { await o.close(); }
});
