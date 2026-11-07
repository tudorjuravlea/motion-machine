// text/handwrite: each line's outline is traced in turn over the first 75 % of the
// entrance, then the fill comes in; at p = 1 the slot is its plain text again.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';

const PAGE = join(ROOT, 'tests/kit/media');
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });
const open = () => openPiece(PAGE, { server, browser, format: '9x16', query: { story: 'handwrite' } });
const itemOf = (sched, scene) => sched.items.find((it) => it.scene === scene && !it.parent && it.beat?.slot === 'headline');
const at = async (o, scene, q) => { const it = itemOf((await o.mm.meta()).schedule, scene); await o.mm.seek(it.start + q * it.d); return o.page.evaluate((id) => {
  const el = document.querySelector(`[data-scene="${id}"] [data-slot="headline"]`);
  const lines = [...el.querySelectorAll('svg text')].map((t) => ({ text: t.textContent, off: parseFloat(t.getAttribute('stroke-dashoffset')), len: parseFloat(t.getAttribute('stroke-dasharray')) }));
  return { svg: !!el.querySelector('svg'), text: el.textContent.replace(/\s+/g, ' ').trim(), fill: getComputedStyle(el.querySelector('.mm-handwrite__text') ?? el).color, lines };
}, scene); };
const alpha = (c) => { const m = c.match(/rgba?\(([^)]+)\)/)[1].split(',').map(Number); return m.length > 3 ? m[3] : 1; };

test('at p = 1 the word is plain filled text with no drawing left', async () => {
  const o = await open();
  try {
    const r = await at(o, 'one', 1);
    assert.equal(r.svg, false); assert.equal(r.text, 'hello'); assert.equal(alpha(r.fill), 1);
  } finally { await o.close(); }
});

test('at p = 0.4 the line is partly traced and not yet filled', async () => {
  const o = await open();
  try {
    const r = await at(o, 'one', 0.4);
    assert.ok(r.svg && r.lines.length === 1, JSON.stringify(r));
    assert.ok(r.lines[0].off > 0 && r.lines[0].off < r.lines[0].len, JSON.stringify(r.lines[0]));
    assert.equal(alpha(r.fill), 0);
  } finally { await o.close(); }
});

test('a slot that wraps traces each line in turn', async () => {
  const o = await open();
  try {
    const early = await at(o, 'two', 0.15);
    assert.ok(early.lines.length >= 2, `lines: ${early.lines.length}`);
    assert.ok(early.lines[0].off < early.lines[0].len, 'line 1 has started');
    assert.equal(early.lines[1].off, early.lines[1].len, 'line 2 waits');
    const late = await at(o, 'two', 0.74);
    assert.ok(late.lines.every((l) => l.off < l.len), 'every line has been traced by 0.74');
    assert.equal(late.lines.map((l) => l.text).join(' '), 'Plan the week in one place');
  } finally { await o.close(); }
});
