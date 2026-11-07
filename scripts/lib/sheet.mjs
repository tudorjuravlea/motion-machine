// Contact sheets: a grid of PNG buffers, each with a caption, composed into one PNG.
// No image library: a second headless page lays the tiles out as data URIs and is screenshotted
// whole (the approach that showcase (MIT, same author) proved with its `--stills`; see NOTICE). Pass `browser` to reuse one.
import { chromium } from 'playwright';

/** Width and height of a PNG buffer, read from its IHDR chunk. */
export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('sheet: not a PNG buffer');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param {{png: Buffer, label?: string}[]} tiles
 * @param {object} [o]
 * @param {number} [o.columns=4]   tiles per row
 * @param {number} [o.tileWidth=480] width each frame is scaled to (height follows its aspect)
 * @param {number} [o.gap=12] @param {number} [o.margin=12] @param {number} [o.labelHeight=26]
 * @param {string} [o.background='#14141a'] @param {string} [o.ink='#d9d9e3']
 * @param {import('playwright').Browser} [o.browser]
 * @returns {Promise<{png: Buffer, width: number, height: number, tiles: {label: string, x: number, y: number, w: number, h: number}[]}>}
 */
export async function composeSheet(tiles, o = {}) {
  if (!tiles.length) throw new Error('sheet: no tiles');
  const { columns = 4, tileWidth = 480, gap = 12, margin = 12, labelHeight = 26, background = '#14141a', ink = '#d9d9e3' } = o;
  const cols = Math.max(1, Math.min(columns, tiles.length));
  const rows = Math.ceil(tiles.length / cols);
  const sized = tiles.map((t) => {
    const { width, height } = pngSize(t.png);
    return { ...t, w: tileWidth, h: Math.max(1, Math.round((height * tileWidth) / width)) };
  });
  // Row height is the tallest tile in the row, so mixed aspect ratios still align.
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...sized.slice(r * cols, (r + 1) * cols).map((t) => t.h)));
  const rowY = [];
  let y = margin;
  for (const h of rowH) { rowY.push(y); y += h + labelHeight + gap; }
  const width = margin * 2 + cols * tileWidth + (cols - 1) * gap;
  const height = y - gap + margin;
  const placed = sized.map((t, i) => ({ label: t.label ?? '', x: margin + (i % cols) * (tileWidth + gap), y: rowY[Math.floor(i / cols)], w: t.w, h: t.h }));
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;background:${background};}
    .t{position:absolute;}
    .t img{display:block;box-shadow:0 0 0 1px rgba(255,255,255,.12);}
    .t p{margin:0;height:${labelHeight}px;line-height:${labelHeight}px;font:14px ui-monospace,Menlo,Consolas,monospace;color:${ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  </style><body>${sized.map((t, i) => `<div class="t" style="left:${placed[i].x}px;top:${placed[i].y}px;width:${t.w}px">
    <img width="${t.w}" height="${t.h}" src="data:image/png;base64,${t.png.toString('base64')}"><p>${esc(t.label ?? '')}</p></div>`).join('')}</body>`;
  const ownBrowser = !o.browser;
  const browser = o.browser ?? await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => Promise.all([...document.images].map((i) => i.decode())));
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } });
    await page.close();
    return { png, width, height, tiles: placed };
  } finally {
    if (ownBrowser) await browser.close();
  }
}
