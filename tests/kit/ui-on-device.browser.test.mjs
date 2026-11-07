// A ui story as a screen action: it is drawn inside the device's screen, stays there once finished,
// reads the same from any seek path, and keeps its words at the format's body floor.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { floorsFor } from '../../scripts/check/_lib.mjs';

const PIECE = join(ROOT, 'fixtures/ui-on-device');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

const read = (page, t) => page.evaluate((x) => {
  window.mm.seek(x);
  const scr = document.querySelector('[data-screen]');
  const root = scr.querySelector('.mm-ui');
  if (!root) return null;
  const a = root.getBoundingClientRect(), b = scr.getBoundingClientRect();
  const k = document.querySelector('.mm-stage').getBoundingClientRect().width / document.querySelector('.mm-stage').offsetWidth;
  return { html: root.outerHTML, inside: a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1, font: parseFloat(getComputedStyle(root).fontSize) * (a.width / root.offsetWidth) / k };
}, t);

for (const format of ['16x9', '9x16']) test(`a ui story on a device screen, ${format}: inside the screen, stays, and at the floor`, async () => {
  const o = await openPiece(PIECE, { server, browser, format });
  try {
    assert.deepEqual((await o.mm.meta()).warnings, []);
    assert.equal(await read(o.page, 0.1), null, 'nothing before its action starts');
    const end = await read(o.page, 8.5);
    assert.ok(end, 'the finished story is still there after its action ends');
    assert.ok(end.inside, 'the panel sits inside the screen');
    assert.match(end.html, /Thursday/);
    assert.ok(end.font >= floorsFor('film', format).body - 0.5, `type at ${end.font}px`);
  } finally { await o.close(); }
});

test('a ui story on a device screen reads the same from any seek path', async () => {
  const o = await openPiece(PIECE, { server, browser, format: '16x9' });
  try {
    const ts = [0.5, 1.2, 2.4, 3.1, 4.8, 6.2, 8.1];
    const forward = [];
    for (const t of ts) forward.push((await read(o.page, t))?.html);
    for (const i of [3, 0, 6, 2, 5, 1, 4]) assert.equal((await read(o.page, ts[i]))?.html, forward[i], `t=${ts[i]}`);
  } finally { await o.close(); }
});

// every recipe with its demo's words on the devices that can hold them; a phone needs a tall frame
const HOSTS = [['devices/browser', '16x9'], ['devices/laptop', '16x9'], ['devices/phone', '9x16']];
for (const name of readdirSync(join(ROOT, 'patterns/ui'))) for (const [device, format] of HOSTS) {
  test(`ui/${name} on ${device}, ${format}: the finished story fits the screen`, async () => {
    const demo = JSON.parse(readFileSync(join(ROOT, 'patterns/ui', name, 'demo/story.json'), 'utf8'));
    const beat = demo.scenes[0].beats.find((b) => b.fx === `ui/${name}`);
    const { default: mod } = await import(join(ROOT, 'patterns/ui', name, 'pattern.js'));
    const dir = join(ROOT, 'pieces', `.tmp-ui-device-${name}-${device.split('/')[1]}`);
    mkdirSync(dir, { recursive: true });
    for (const f of ['index.html', 'piece.js', 'piece.css', 'style.json']) cpSync(join(PIECE, f), join(dir, f));
    const story = JSON.parse(readFileSync(join(PIECE, 'story.json'), 'utf8'));
    story.formats = [format];
    const scene = story.scenes[0];
    scene.duration = Math.ceil(mod.dur) + 2;
    scene.beats[0].fx = device;
    scene.beats[0].screen = [{ do: `ui/${name}`, at: 0.3, ...(beat.text != null ? { params: { ...beat.params, rows: beat.params?.rows ?? beat.text } } : { params: beat.params }) }];
    writeFileSync(join(dir, 'story.json'), JSON.stringify(story));
    const o = await openPiece(dir, { server, browser, format });
    try {
      const bad = await o.page.evaluate((t) => {
        window.mm.seek(t);
        const scr = document.querySelector('[data-screen]'), root = scr.querySelector('.mm-ui'), out = [];
        if (root.scrollWidth > root.clientWidth + 1) out.push(`wider than the screen by ${root.scrollWidth - root.clientWidth}px`);
        if (root.scrollHeight > root.clientHeight + 1) out.push(`taller than the screen by ${root.scrollHeight - root.clientHeight}px`);
        const box = root.getBoundingClientRect(), glass = scr.getBoundingClientRect();
        if (box.right > glass.right + 1 || box.bottom > glass.bottom + 1) out.push('the panel leaves the screen');
        for (const n of root.querySelectorAll('*')) {
          if (n.children.length || !n.textContent.trim() || !n.checkVisibility({ checkOpacity: true })) continue;
          const r = n.getBoundingClientRect();
          if (r.right > box.right + 1 || n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible') out.push(`"${n.textContent.trim().slice(0, 24)}" is cut`);
        }
        return out;
      }, scene.duration - 0.05);
      assert.deepEqual(bad, []);
    } finally { await o.close(); rmSync(dir, { recursive: true, force: true }); }
  });
}
