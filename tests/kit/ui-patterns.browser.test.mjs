// Every ui/ pattern, in every format of its demo: a frame is the same however it is reached, nothing
// is cut by its own panel at the rest, and the panel stays inside the safe margin.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { ROOT, serveRoot, openPiece, launchBrowser } from '../../scripts/lib/browser.mjs';
import { demoPiece } from '../../scripts/pattern-stills.mjs';

const NAMES = readdirSync(join(ROOT, 'patterns/ui'));
let server, browser;
before(async () => { server = await serveRoot(ROOT); browser = await launchBrowser(); });
after(async () => { await browser?.close(); await server?.close(); });

const frameOf = (page, t) => page.evaluate((x) => {
  window.mm.seek(x);
  const root = document.querySelector('.mm-ui');   // the panel as drawn: one still hidden before its beat counts as absent
  return { t: x, html: root?.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) ? root.outerHTML : '' };
}, t);

for (const name of NAMES) {
  const { formats } = JSON.parse(readFileSync(join(ROOT, 'patterns/ui', name, 'demo/story.json'), 'utf8'));
  test(`ui/${name}: any frame is the same from any path`, async () => {
    const { pieceDir } = demoPiece(`ui/${name}`, 'editorial');
    const o = await openPiece(pieceDir, { server, browser, format: formats[0] });
    try {
      const { duration } = await o.mm.meta();
      const ts = Array.from({ length: 24 }, (_, i) => Math.round((i / 23) * duration * 30) / 30);
      const forward = [];
      for (const t of ts) forward.push(await frameOf(o.page, t));
      assert.ok(forward.at(-1).html.length > 0, 'the panel is on the page');
      const order = ts.map((_, i) => (i * 7) % ts.length);
      for (const i of order) assert.equal((await frameOf(o.page, ts[i])).html, forward[i].html, `t=${ts[i]} differs when reached out of order`);
      const back = [...ts.keys()].reverse();
      for (const i of back) assert.equal((await frameOf(o.page, ts[i])).html, forward[i].html, `t=${ts[i]} differs going backward`);
    } finally { await o.close(); }
  });
  for (const format of formats) test(`ui/${name} ${format}: the rest fits its panel and the frame`, async () => {
    const { pieceDir } = demoPiece(`ui/${name}`, 'editorial');
    const o = await openPiece(pieceDir, { server, browser, format });
    try {
      const { duration } = await o.mm.meta();
      const bad = await o.page.evaluate((t) => {
        window.mm.seek(t);
        const root = document.querySelector('.mm-ui');
        const stage = document.querySelector('.mm-stage').getBoundingClientRect();
        const safe = parseFloat(getComputedStyle(root).getPropertyValue('--mm-safe'));
        const k = stage.width / document.querySelector('.mm-stage').offsetWidth;
        const r = root.getBoundingClientRect(), out = [];
        if (r.left - stage.left < safe * k - 1 || stage.right - r.right < safe * k - 1 || r.top - stage.top < safe * k - 1 || stage.bottom - r.bottom < safe * k - 1) out.push(`panel outside the safe margin: ${Math.round(r.width)}×${Math.round(r.height)}`);
        if (root.scrollWidth > root.clientWidth + 1) out.push(`content wider than the panel by ${root.scrollWidth - root.clientWidth}px`);
        if (root.scrollHeight > root.clientHeight + 1) out.push(`content taller than the panel by ${root.scrollHeight - root.clientHeight}px`);
        for (const n of root.querySelectorAll('*')) {
          if (n.children.length || !n.textContent.trim() || getComputedStyle(n).overflow === 'visible') continue;
          if (n.scrollWidth > n.clientWidth + 1) out.push(`"${n.textContent.trim().slice(0, 24)}" is cut`);
        }
        return out;
      }, duration - 0.05);
      assert.deepEqual(bad, []);
    } finally { await o.close(); }
  });
}

const atRest = async (name, format, read, arg) => {
  const { pieceDir } = demoPiece(`ui/${name}`, 'editorial');
  const o = await openPiece(pieceDir, { server, browser, format });
  try {
    const { duration } = await o.mm.meta();
    return await o.page.evaluate(read, { end: duration - 0.05, arg });
  } finally { await o.close(); }
};

test('ui/status: the pill ends on the row\'s right edge, however long its last word', async () => {
  const gap = await atRest('status', '16x9', ({ end }) => {
    window.mm.seek(end);
    const pill = document.querySelector('.mm-ui-status__pill').getBoundingClientRect();
    const row = document.querySelector('.mm-ui-status__pill').closest('.mm-ui-status__row').getBoundingClientRect();
    return Math.abs(row.right - pill.right);
  });
  assert.ok(gap < 1, `the pill stops ${gap}px short of the row's edge`);
});

test('ui/table-edit 9x16: no filler bar is squeezed to nothing', async () => {
  const flat = await atRest('table-edit', '9x16', ({ end }) => {
    window.mm.seek(end);
    return [...document.querySelectorAll('.mm-ui-table-edit .mm-ui__bar')].filter((b) => getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width < 8).length;
  });
  assert.equal(flat, 0);
});

test('ui/presence: a flag is only seen once its cursor is inside the panel', async () => {
  const seen = await atRest('presence', '16x9', () => {
    const cut = [];
    for (let t = 0.1; t < 2; t += 0.1) {
      window.mm.seek(t);
      const root = document.querySelector('.mm-ui').getBoundingClientRect();
      for (const f of document.querySelectorAll('.mm-ui-presence__flag')) {
        const r = f.getBoundingClientRect();
        if (Number(f.style.opacity || 1) > 0.02 && (r.left < root.left - 0.5 || r.right > root.right + 0.5)) cut.push(t);
      }
    }
    return cut;
  });
  assert.deepEqual(seen, []);
});

test('ui/form-fix: the mark takes the alert role, and that role is the accent when a brand has none', async () => {
  const c = await atRest('form-fix', '16x9', ({ end }) => {
    window.mm.seek(end);
    const root = document.querySelector('.mm-ui');
    const css = getComputedStyle(root);
    const mark = root.querySelector('.mm-ui-form-fix__mark');
    const before = getComputedStyle(mark).backgroundColor;
    root.style.setProperty('--mm-color-alert', 'rgb(1, 2, 3)');
    return { role: css.getPropertyValue('--mm-color-alert'), before, after: getComputedStyle(mark).backgroundColor, accent: (() => { const p = document.createElement('i'); p.style.color = 'var(--mm-color-accent)'; root.append(p); const v = getComputedStyle(p).color; p.remove(); return v; })() };
  });
  assert.equal(c.before, c.accent, 'with no alert role the mark is the accent');
  assert.equal(c.after, 'rgb(1, 2, 3)', 'the mark reads the alert role');
});

test('ui/exchange: both arrows carry their heads, and the lines stay inside the panel', async () => {
  const c = await atRest('exchange', '16x9', ({ end }) => {
    window.mm.seek(end);
    const root = document.querySelector('.mm-ui');
    const heads = [...root.querySelectorAll('path.mm-ui__end')].filter((h) => h.getBBox().width > 0).length;
    return { heads, wide: root.querySelector('.mm-ui__lines').getBoundingClientRect().width <= root.clientWidth + 0.5 };
  });
  assert.deepEqual(c, { heads: 2, wide: true });
});
