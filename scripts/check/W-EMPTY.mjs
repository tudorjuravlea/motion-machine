// W-EMPTY: a film run of more than 6 frames (at 30 fps) whose rendered ink, the
// pixels farther than ΔE 2 from the canvas colour, is under 0.5 % of the frame. Frames are captured
// at quarter scale; every third frame is read first (any run of 7 holds two of them) and the
// candidates are then read frame by frame.
import { rule } from '../lib/report.mjs';
import { cdpOf, parseColor, round } from './_lib.mjs';
import { countPixels, decodePng, deltaE, rgbToLab } from './_pixels.mjs';

export const scope = 'format';
export const FPS = 30;
export const RUN_MAX = 6;
export const INK_MIN = 0.005;
const DE = 2;

export default async function (ctx) {
  if (ctx.kind === 'deck') return rule('W-EMPTY', 'SKIP', { reason: 'a deck has rests, not a run of frames (G-HOOK covers rest 0)' });
  const cdp = await cdpOf(ctx);
  const canvas = rgbToLab(...parseColor(ctx.style.color.canvas).slice(0, 3));
  const { width, height } = ctx.page.viewportSize();
  const frames = Math.floor(ctx.schedule.duration * FPS + 1e-6) + 1;
  const ink = new Map();
  const inkAt = async (n) => {
    if (ink.has(n)) return ink.get(n);
    await ctx.mm.seek(Math.min(n / FPS, ctx.schedule.duration));
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 0.25 } });
    const img = decodePng(Buffer.from(data, 'base64'));
    const { counted, total } = countPixels(img, (r, g, b) => deltaE(rgbToLab(r, g, b), canvas) > DE);
    const v = counted / total;
    ink.set(n, v);
    return v;
  };
  const empty = async (n) => (await inkAt(n)) < INK_MIN;
  const coarse = [];
  for (let n = 0; n < frames; n += 3) coarse.push([n, await empty(n)]);
  let worst = null;
  for (let i = 0; i + 1 < coarse.length; i++) {
    if (!coarse[i][1] || !coarse[i + 1][1]) continue;
    let a = coarse[i][0], b = coarse[i + 1][0];
    for (let n = a + 1; n < b; n++) if (!(await empty(n))) { a = -1; break; }
    if (a < 0) continue;
    while (a > 0 && (await empty(a - 1))) a--;
    while (b + 1 < frames && (await empty(b + 1))) b++;
    const len = b - a + 1;
    if (!worst || len > worst.len) worst = { a, b, len };
    while (i + 1 < coarse.length && coarse[i + 1][0] <= b) i++;
  }
  const ev = { fps: FPS, threshold: `${RUN_MAX} frames under ${INK_MIN * 100} % ink`, framesRead: ink.size };
  if (worst && worst.len > RUN_MAX) {
    const share = Math.max(...Array.from({ length: worst.len }, (_, k) => ink.get(worst.a + k) ?? 0));
    return rule('W-EMPTY', 'WARN', { ...ev, instant: round(worst.a / FPS), measured: worst.len, until: round(worst.b / FPS),
      reason: `${worst.len} frames (${round(worst.a / FPS)}–${round(worst.b / FPS)} s) show under ${INK_MIN * 100} % ink (at most ${round(share * 100, 2)} %)` });
  }
  return rule('W-EMPTY', 'PASS', { ...ev, measured: worst?.len ?? 0 });
}
