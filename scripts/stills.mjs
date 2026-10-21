// mm stills [piece] [--format 16x9]: every rest, every mid-entrance, a 12-frame strip through each
// move, a contact sheet and a phone-width sheet (SPEC §8).
//   out/stills/*.png · out/stills/strip-*.png · out/stills/stills.json · out/contact.png · out/phone.png
// `photograph` is shared with pattern-stills.mjs.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { openPiece, framePng } from './lib/browser.mjs';
import { composeSheet } from './lib/sheet.mjs';
import { resolvePiece, runMain, slug } from './lib/cli.mjs';

export const PHONE_TILE = 378;
export const STRIP_FRAMES = 12;

const r3 = (x) => Math.round(x * 1000) / 1000;
const pad = (n) => String(n).padStart(2, '0');
const nameOf = (selector = '') => {
  const m = /data-scene="([^"]+)"\](?: \[data-slot="([^"]+)"\])?/.exec(selector);
  return m ? [m[1], m[2]].filter(Boolean).join('/') : selector;
};

/**
 * The instants worth photographing, from a schedule (plain JSON: events, rests, kind).
 * Mid-entrances are the midpoints of every `arrive` event and of every transition that takes time,
 * one per distinct instant. Strips cover every `move` event (camera moves and emphasis).
 */
export function momentsOf(sched) {
  const deck = sched.kind === 'deck';
  const unit = deck ? 'press' : 's';
  const rests = sched.rests.map((t, i) => ({ kind: 'rest', t, label: `rest ${i} · ${deck ? 'press ' : ''}${r3(t)}${deck ? '' : 's'}` }));
  const mids = [], seen = new Set(), strips = [];
  for (const e of sched.events) {
    const from = deck ? e.from : e.t, to = deck ? e.to : e.t + (e.d ?? 0);
    if ((e.kind === 'arrive' || e.screen || (e.kind === 'cut' && e.d > 0)) && to > from) {   // a screen action gets a mid too
      const t = r3((from + to) / 2);
      if (seen.has(t)) continue;
      seen.add(t);
      mids.push({ kind: 'mid', t, label: `mid ${e.kind === 'cut' ? 'cut' : (e.fx ?? e.pattern ?? '').split('/').pop()} ${nameOf(e.selector)} · ${deck ? 'press ' : ''}${t}${deck ? '' : unit}` });
    } else if (e.kind === 'move' && to > from) {
      strips.push({ from, to, name: `${nameOf(e.selector)} ${e.pattern ?? ''}`.trim() });
    }
  }
  return { rests, mids, strips };
}

/** Photographs a piece opened by `openPiece`: returns tiles (rests then mid-entrances) and strips. */
export async function photograph(opened) {
  const sched = await opened.page.evaluate(() => {
    const s = window.mm.schedule;
    return { kind: s.kind, rests: s.rests, events: s.events, duration: s.duration ?? null, presses: s.presses ?? null };
  });
  const { rests, mids, strips } = momentsOf(sched);
  const tiles = [];
  for (const m of [...rests, ...mids]) tiles.push({ ...m, png: await framePng(opened.page, m.t) });
  const stripSheets = [];
  for (const [i, s] of strips.entries()) {
    const frames = [];
    for (let k = 0; k < STRIP_FRAMES; k++) {
      const t = s.from + ((s.to - s.from) * k) / (STRIP_FRAMES - 1);
      frames.push({ png: await framePng(opened.page, t), label: `${k + 1}/${STRIP_FRAMES} · ${r3(t)}` });
    }
    stripSheets.push({ name: s.name, index: i, frames, from: s.from, to: s.to });
  }
  return { tiles, rests: rests.length, midEntrances: mids.length, strips: stripSheets, kind: sched.kind };
}

export async function stills(dir, { format } = {}) {
  const opened = await openPiece(dir, { format });
  try {
    const shot = await photograph(opened);
    const outDir = join(dir, 'out'), frames = join(outDir, 'stills');
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    shot.tiles.forEach((t, i) => writeFileSync(join(frames, `${pad(i + 1)}-${t.kind}-${slug(t.t)}.png`), t.png));
    const stripFiles = [];
    for (const s of shot.strips) {
      const sheet = await composeSheet(s.frames, { columns: 6, tileWidth: 320, browser: opened.browser });
      const file = join(frames, `strip-${pad(s.index + 1)}-${slug(s.name)}.png`);
      writeFileSync(file, sheet.png);
      stripFiles.push(file);
    }
    const contact = await composeSheet(shot.tiles, { columns: 4, tileWidth: 480, browser: opened.browser });
    const phone = await composeSheet(shot.tiles, { columns: 5, tileWidth: PHONE_TILE, gap: 8, margin: 8, browser: opened.browser });
    writeFileSync(join(outDir, 'contact.png'), contact.png);
    writeFileSync(join(outDir, 'phone.png'), phone.png);
    const summary = {
      format: opened.format, kind: shot.kind, rests: shot.rests, midEntrances: shot.midEntrances, strips: stripFiles.length,
      contact: { file: 'out/contact.png', width: contact.width, height: contact.height, tiles: contact.tiles },
      phone: { file: 'out/phone.png', width: phone.width, height: phone.height, tileWidth: PHONE_TILE, tiles: phone.tiles },
    };
    writeFileSync(join(frames, 'stills.json'), JSON.stringify(summary, null, 2) + '\n');
    return summary;
  } finally {
    await opened.close();
  }
}

runMain(import.meta, async () => {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { format: { type: 'string' } } });
  const dir = resolvePiece(positionals[0]);
  const s = await stills(dir, { format: values.format });
  console.log(`stills: ${s.rests} rests, ${s.midEntrances} mid-entrances, ${s.strips} strips (${s.format})`);
  console.log(`  ${join(dir, 'out/contact.png')}\n  ${join(dir, 'out/phone.png')}`);
  return 0;
});
