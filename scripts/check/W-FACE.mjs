// W-FACE (SPEC §7): text over the speaker's face. A film that shows footage through a talking layout
// has a face box at every instant (the kit's `mm.faceBox()`: the head from the person matte, else a
// centred default, padded). Text whose box covers more than FACE_COVER of that box warns. Text with a
// plate of its own is measured by the plate. Decoration (`data-decor`, the cut-out layout's backdrop
// words, which stand behind the speaker) and device chrome are not text over the face. The instants are
// the rests, every scene's last instant and every scene's middle, so a shot that cuts in mid-scene is read
// too. A story with no footage, or one whose speaker is never on screen, is SKIP.
import { rule } from '../lib/report.mjs';
import { auditInstants, restInstants, round, settledTexts } from './_lib.mjs';

export const scope = 'format';
/** A text box covering more than this share of the face box is text over the face. */
export const FACE_COVER = 0.1;
const MAX_INSTANTS = 24;

/** The share of the face box `box` covers; both { x, y, w, h }. */
export function faceCover(box, face) {
  const w = Math.min(box.x + box.w, face.x + face.w) - Math.max(box.x, face.x);
  const h = Math.min(box.y + box.h, face.y + face.h) - Math.max(box.y, face.y);
  return w > 0 && h > 0 && face.w > 0 && face.h > 0 ? (w * h) / (face.w * face.h) : 0;
}

export default async function (ctx) {
  if (ctx.kind === 'deck' || ctx.schedule.kind === 'deck') return rule('W-FACE', 'SKIP', { reason: 'a deck does not play footage' });
  if (!ctx.story.footage) return rule('W-FACE', 'SKIP', { reason: 'the story has no footage: there is no speaker to keep clear of' });
  const mids = ctx.schedule.scenes.map((sc) => round((sc.start + sc.end) / 2, 6));
  const instants = [...new Set([...restInstants(ctx.schedule), ...auditInstants(ctx.schedule), ...mids])].sort((a, b) => a - b);
  const stride = Math.max(1, Math.ceil(instants.length / MAX_INSTANTS));
  let seen = 0;
  const hits = [];
  for (const t of instants.filter((_, i) => i % stride === 0)) {
    const s = await ctx.sample(t);
    await ctx.mm.seek(t);
    const face = await ctx.page.evaluate(() => (window.mm.faceBox ? window.mm.faceBox() : null));
    if (!face) continue;
    seen++;
    for (const e of settledTexts(s)) {
      if (e.decor || e.chrome) continue;
      const box = e.ownBg && e.box ? e.box : e.ink;
      const cover = faceCover(box, face);
      if (cover > FACE_COVER) hits.push({ instant: round(t), selector: e.selector, measured: round(cover, 3), threshold: FACE_COVER, face: { x: round(face.x), y: round(face.y), w: round(face.w), h: round(face.h), source: face.source } });
    }
  }
  if (!seen) return rule('W-FACE', 'SKIP', { reason: 'the speaker is not on screen at any instant read (a hidden speaker has no face to keep clear of)' });
  if (hits.length) {
    const h = hits.sort((a, b) => b.measured - a.measured)[0];
    return rule('W-FACE', 'WARN', { ...h, all: hits.slice(0, 20), reason: `${h.selector} covers ${round(h.measured * 100)} % of the speaker's face box at ${h.instant} s (over ${FACE_COVER * 100} %); mark the element data-face-safe, give it a frame mode that leaves the face clear, or move it` });
  }
  return rule('W-FACE', 'PASS', { instants: seen, threshold: FACE_COVER });
}
