// The speaker-frame layer of the kit (the DOM half of speaker.js). A talking layout carries an
// `<img data-footage>`; a scene may give a `frame` (hero, side, inset, bottom, hidden). On every seek the
// kit puts each visible footage picture where speaker.js says the speaker stands at t, writes the
// scene's custom properties, and moves the elements a layout marks `data-face-safe` clear of the face.
// Nothing here keeps state between seeks: the pose is poseAt() over the scene list, and every value it
// writes is written again on the next seek.
//
// Custom properties on the scene's <section> (px of the frame):
//   --mm-speaker-x|y|w|h   the speaker's box now
//   --mm-panel-x|y|w|h     the region of the scene's own mode that the panel slot fills (not animated:
//                          the panel lands with its beat)
//   --mm-face-x|y|w|h      the face box now (the matte's head, else a default), padded
//   --mm-face-cx|cy        its centre
// and on the section `data-frame="<mode>"` when the story uses speaker frames at all.
import { ease } from './ease.js';
import { paramsOf } from './params.js';
import { faceOfClip, clipAt } from './footage.js';
import { KNOBS, FACE_DEFAULT, LEAD_S, MOVE_S, resolveFrame, modeBox, panelBox, poseAt, drifted, widest, faceRect, clearFace, parseFace } from './speaker.js';

const px = (v) => `${Math.round(v * 100) / 100}px`;
const LAYOUT_CARD = (ref) => ({ group: 'layouts', name: ref.split('/')[1], params: KNOBS });

/**
 * Finds the scenes that show the footage and resolves each one's frame. Returns null for a deck or when
 * no layout shows footage. `S` is the kit's mounted state.
 */
export function mountSpeaker(S, warnings) {
  const { story, style, footage, scenes, sched } = S;
  if (!footage || story.kind === 'deck') return null;
  const own = [];
  story.scenes.forEach((sc, i) => {
    const els = [...scenes[i].el.querySelectorAll('img[data-footage]')];
    if (!els.length) return;
    const knobs = paramsOf(LAYOUT_CARD(sc.layout), null, style);
    const hasPanel = sc.beats.some((b) => b.slot === 'panel');
    const frame = resolveFrame(sc.frame, knobs, hasPanel);
    if (frame.bad) warnings.push(`frame: scene "${sc.id}" asks for the unknown mode "${frame.bad}"; it is hero`);
    // the layout's own pose, read before any frame is written: the box the hero mode returns to
    const hero = els[0] && { x: els[0].offsetLeft, y: els[0].offsetTop, w: els[0].offsetWidth, h: els[0].offsetHeight };
    own.push({ i, els, frame, hero, knobs, sec: scenes[i].el, camera: scenes[i].camera, at: sched.scenes[i].start });
  });
  if (!own.length) return null;
  // the story uses speaker frames when a scene names one, or a brand sets a default mode
  const moves = story.scenes.some((sc) => sc.frame != null) || own.some((o) => ['frame', 'panelFrame'].some((k) => style.patterns?.[`layouts/${story.scenes[o.i].layout.split('/')[1]}`]?.[k] != null));
  const dur = style.motion?.durations?.standard ? style.motion.durations.standard / 1000 : MOVE_S;
  return {
    scenes: own, moves, dur, keys: own.map((o) => ({ at: o.at, frame: o.frame })),
    ease: (p) => ease('move', p, style),
    shares: parseFace(own[0].knobs.face) ?? FACE_DEFAULT[S.format] ?? FACE_DEFAULT['9x16'],
  };
}

/** Puts every visible footage picture where the speaker stands at t, and writes the scene's custom properties. */
export function applySpeaker(S, t) {
  const sp = S.speaker;
  S.face = null;
  if (!sp) return;
  const { w: W, h: H, safe } = S.spec;
  const f = S.footage, k = clipAt(f.edit, t);
  const matteFace = faceOfClip(f, k);
  for (const o of sp.scenes) {
    if (!S.vis[o.i]) continue;
    const c = { W, H, safe, hero: o.hero, ease: sp.ease, dur: sp.dur, lead: LEAD_S };
    const pose = sp.moves ? poseAt(sp.keys, t, c) : { ...o.hero, o: 1 };
    const box = sp.moves ? drifted(pose, t, o.frame.drift, { W, H }) : pose;
    if (sp.moves) {
      o.sec.dataset.frame = o.frame.mode;
      for (const el of o.els) {
        el.style.left = px(box.x); el.style.top = px(box.y); el.style.width = px(box.w); el.style.height = px(box.h);
        el.style.opacity = box.o < 1 ? String(Math.round(box.o * 1000) / 1000) : '';
      }
      const panel = panelBox(o.frame, c);
      for (const [n, v] of [['x', panel.x], ['y', panel.y], ['w', panel.w], ['h', panel.h]]) o.sec.style.setProperty(`--mm-panel-${n}`, px(v));
    }
    const face = faceRect(widest(pose, sp.moves ? o.frame.drift : 0, { W, H }), { rec: { w: f.meta.w, h: f.meta.h }, face: matteFace, shares: sp.shares });
    for (const [n, v] of [['x', box.x], ['y', box.y], ['w', box.w], ['h', box.h]]) o.sec.style.setProperty(`--mm-speaker-${n}`, px(v));
    if (face) {
      for (const [n, v] of [['x', face.x], ['y', face.y], ['w', face.w], ['h', face.h], ['cx', face.x + face.w / 2], ['cy', face.y + face.h / 2]]) o.sec.style.setProperty(`--mm-face-${n}`, px(v));
    }
    // a guessed face (no matte) moves things only where the story has chosen speaker frames: a talking piece made before them is left as its layout draws it
    const judged = sp.moves || matteFace;
    o.face = judged ? face : null;
    o.card = sp.moves && o.frame.mode === 'inset' && box.o >= 0.5 ? { x: box.x, y: box.y, w: box.w, h: box.h } : null;   // a card is a picture: plates keep off all of it, not just the head
    if (face && judged) S.face = { ...face, source: matteFace ? 'matte' : 'default' };
  }
}

// the box of an element in camera px, from layout offsets only, so entrances, moves and the camera's own
// transform never feed back into where it is placed
function boxOf(el, camera) {
  let x = 0, y = 0, n = el;
  while (n && n !== camera) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

/**
 * Moves what a layout marks `data-face-safe` clear of the face, by the element's own `left` and `top`
 * (the element is `position: relative`; an entrance writes transform, translate and opacity, never these,
 * so the two compose). The element's place is read from layout offsets with its nudge taken off first.
 * In inset mode the whole card is the obstacle. Elements are placed in document order, and each placed one is an obstacle to the next. The face is the
 * shot's, so a graphic whose time spans a cut moves to the new shot's place at the cut.
 */
export function placeFaceSafe(S) {
  const sp = S.speaker;
  if (!sp) return;
  const { w: W, h: H, safe } = S.spec;
  const bounds = { x: safe, y: safe, w: W - 2 * safe, h: H - 2 * safe };
  for (const o of sp.scenes) {
    if (!S.vis[o.i]) continue;
    const placed = [];
    for (const el of o.camera.querySelectorAll('[data-face-safe]')) {
      el.style.left = ''; el.style.top = '';
      if (!el.offsetWidth || el.hasAttribute('data-empty')) continue;
      const r = boxOf(el, o.camera);
      const { dx, dy } = clearFace(r, [o.card ?? o.face, ...placed], bounds);
      if (dx || dy) { el.style.left = px(dx); el.style.top = px(dy); }
      if (el.style.visibility !== 'hidden' && el.style.opacity !== '0') placed.push({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h });
    }
  }
}
