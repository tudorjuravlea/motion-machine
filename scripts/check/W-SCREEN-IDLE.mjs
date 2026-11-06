// W-SCREEN-IDLE (SPEC §7, provisional): a device whose screen shows a still picture and runs no screen action and no playing
// recording for the whole scene. A camera move over a frozen screenshot is not the product working. A device is a beat
// through devices/{phone,laptop,browser,screen-zoom} or 3d/{phone,laptop,tablet}; its picture is the beat's `asset` (a
// file or a footage folder). A recording that plays is a screen/play, which the kit adds to a frame sequence; any screen
// action (scroll, tap, swap, zoom-to, callout, compare, pointer, play) counts as the screen working, and so does a
// devices/cursor beat in the same scene. A footage folder is read from its media.json: a frame sequence plays, a captured
// page is a still until an action moves it, and a folder with no media.json is not read. A device with no picture shows nothing frozen and is not read. A deck is SKIP.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rule } from '../lib/rule.mjs';

export const DEVICES = ['devices/phone', 'devices/laptop', 'devices/browser', 'devices/screen-zoom', '3d/phone', '3d/laptop', '3d/tablet'];
const VIDEO = /\.(mp4|webm|mov|m4v)$/i;

export default async function (ctx) {
  if (ctx.story.kind === 'deck') return rule('W-SCREEN-IDLE', 'SKIP', { reason: 'a deck\'s screen moves on presses; an idle screen is a film reading' });
  const devices = [];
  for (const sc of ctx.story.scenes) {
    const cursor = sc.beats.some((b) => b.fx === 'devices/cursor');
    for (const b of sc.beats) if (DEVICES.includes(b.fx)) devices.push({ sc, b, cursor });
  }
  if (!devices.length) return rule('W-SCREEN-IDLE', 'SKIP', { reason: 'no scene shows a device' });
  const kindOf = (asset) => {
    if (!asset.endsWith('/')) return VIDEO.test(asset) ? 'video' : 'still';
    const file = join(ctx.dir ?? '', asset, 'media.json');
    try { return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).kind ?? null : null; } catch { return null; }
  };
  const screens = devices.filter(({ b }) => b.asset && kindOf(b.asset) != null);
  if (!screens.length) return rule('W-SCREEN-IDLE', 'SKIP', { reason: `${devices.length} device${devices.length === 1 ? '' : 's'} show no picture that can be read (no asset, or a folder without media.json): no screen to be frozen` });
  const idle = screens.filter(({ b, cursor }) => !(b.screen ?? []).length && !cursor && !['video', 'sequence'].includes(kindOf(b.asset)));
  if (idle.length) {
    const { sc, b } = idle[0];
    const selector = `[data-scene="${sc.id}"] [data-slot="${b.slot}"]`;
    return rule('W-SCREEN-IDLE', 'WARN', {
      selector, scene: sc.id, asset: b.asset, measured: idle.length, threshold: 0, scenes: idle.map((d) => d.sc.id),
      reason: `${selector} shows ${b.asset} on a ${b.fx.split('/')[1]} for all of ${sc.id} (${sc.duration} s) with no screen action: a frozen screen under a moving camera is not the product working`,
    });
  }
  return rule('W-SCREEN-IDLE', 'PASS', { screens: screens.length, idle: 0 });
}
