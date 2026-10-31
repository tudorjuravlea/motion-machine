// The kit runtime (SPEC §2, §3, §6, §10). Browser ESM. Builds scenes from layout fragments,
// maps the composed style to --mm-* variables, loads fonts, and paints any instant from t alone.
// No timers, no frame loop, no clock: the live play clock belongs to `mm serve`.

import { spring } from './springs.js';
import { ease } from './ease.js';
import { random, hash } from './random.js';
import { schedule as buildSchedule, resolveStory, forFormat, selectorOf, eachParts, addImplicitPlays, screenIssues } from './schedule.js';
import { initialState, fold, locate, mountLayer, paint } from './screen.js';
import { footageCtx, mountFootage, paintFootage } from './footage.js';
import { mountSpeaker, applySpeaker, placeFaceSafe } from './speaker-layer.js';
import { seeded, seededImport } from './seeded.js';
import { paramsOf as brandParams } from './params.js';
import { boilFrame, BOIL_PERIOD } from './rough.js';
import { fitHeadline, fitWords, bodyFloor, wantsWordFit } from './fit.js';
import { groundOf, groundSpec, firstBeatWindow, isAnimated, paintGround } from './ground.js';
import { surfaceVars, shinePosition } from './surface.js';
import { recipeModule } from './synth.js';
import { fxFilter, needsFx, overTextShares, grainSeed } from './finish.js';
import { rampUrl, warmRamp } from './lens.js';

export { spring, track } from './springs.js';
export { ease } from './ease.js';
export { random } from './random.js';
export { fit } from './fit.js';
export { count } from './count.js';

// SPEC §12: viewport, base size (scale × base), safe margin.
export const FORMATS = {
  '9x16': { w: 1080, h: 1920, base: 168, safe: 72 },
  '1x1': { w: 1080, h: 1080, base: 152, safe: 64 },
  '4x5': { w: 1080, h: 1350, base: 160, safe: 68 },   // the feed portrait; its base and margin sit between 9x16 and 1x1
  '16x9': { w: 1920, h: 1080, base: 136, safe: 64 },
};
const DECK_16x9 = { w: 1920, h: 1080, base: 128, safe: 64 };

export function formatSpec(kind, format) {
  if (kind === 'deck' && format === '16x9') return DECK_16x9;
  const spec = FORMATS[format];
  if (!spec) throw new RangeError(`kit: unknown format "${format}"`);
  return spec;
}

const S = { ready: false };   // mounted state; never carries anything from one seek to the next

// seek(t) stays synchronous and draws the whole frame; a picture it asks for (a sequence
// frame, a texture) may still be decoding. trackDecode() registers that decode, and settle() resolves once
// none is left, so the renderer, the gate and stills read pixels only after it. settle() never
// changes what seek drew.
const pending = new Set();
export function trackDecode(p) {
  const q = Promise.resolve(p).catch(() => {}).finally(() => pending.delete(q));
  pending.add(q);
  return q;
}
// afterSettle: work that must see this seek's decoded pictures (a 3D render copying a screen
// into a texture) runs inside settle(), after the decodes; what it returns is tracked in turn.
let late = [];
export function afterSettle(fn) { late.push(fn); }
export async function settle() {
  for (;;) {
    while (pending.size) await Promise.all([...pending]);
    if (!late.length) return;
    const run = late; late = [];
    for (const fn of run) { const r = fn(); if (r && typeof r.then === 'function') trackDecode(r); }
  }
}
// A picture a seek asked for that did not decode is named in mm.warnings, once per file.
function decodeWarning(src) {
  const msg = `screen: ${src} did not decode`;
  if (!S.warnings.includes(msg)) S.warnings.push(msg);
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Schedule times are whole milliseconds; local time is compared to them with this tolerance, so a
// rest (u = d up to float error) is always drawn finished, never at spring(d) = 0.995.
const TOL = 1e-9;
const fallbackFx = { name: 'fade', group: 'entrances', params: {}, at(el, p) { el.style.opacity = String(clamp01(p)); } };

// ---------------------------------------------------------------------------------------------
// mount

export async function mount({ story, style, root = document.body, patternsBase = new URL('../../patterns/', import.meta.url) }) {
  try {
    return await mountInner({ story, style, root, patternsBase: new URL(patternsBase, document.baseURI) });
  } catch (e) {
    window.mm = { ready: false, error: String(e && e.stack ? e.stack : e) };
    throw e;
  }
}

async function mountInner({ story, style, root, patternsBase }) {
  story = structuredClone(story);   // the kit adds implicit plays to beats; the caller's object stays as it was given
  const html = document.documentElement;
  const q = new URLSearchParams(location.search);
  const format = html.getAttribute('data-format') || q.get('format') || story.formats[0];
  const formatWarning = story.formats.includes(format) ? [] : [`format ${format} is not one of the story's formats`];
  story = resolveStory(forFormat(story, format), style);   // this format's scenes; style:<role> and position, exactly as schedule() reads them
  const screenWarnings = await implicitPlays(story, style);   // a recording with no screen/play gets one, so the schedule sees it
  const warnings = [...formatWarning, ...screenWarnings];
  if (q.has('render') && q.get('render') !== '0') html.setAttribute('data-render', '');
  html.setAttribute('data-format', format);
  html.setAttribute('data-kind', story.kind);
  const spec = formatSpec(story.kind, format);

  const waits = [];
  if (html.hasAttribute('data-render')) waits.push(linkCss(new URL('./render.css', import.meta.url), warnings));
  setVariables(style, spec);
  injectBase(style);
  const fontsP = loadFonts(style);

  // Patterns the story uses, by group.
  const refs = new Set();
  for (const sc of story.scenes) {
    refs.add(sc.layout); refs.add(sc.cut);
    if (sc.move) refs.add(sc.move);
    for (const b of sc.beats) {
      refs.add(b.fx); if (b.exit) refs.add(b.exit); if (b.emphasis) refs.add(b.emphasis);
      if (b.cue) refs.add(`sound/${b.cue}`);   // read for its anchor and durationS
      for (const a of b.screen ?? []) refs.add(a.do);   // screen actions are patterns
    }
  }
  const modules = {};
  const layouts = {};
  const fragments = {};   // text, data and device markup, instantiated for modules with fragment: true
  await Promise.all([...refs].map(async (ref) => {
    const group = ref.split('/')[0];
    if (group !== 'sound') waits.push(linkCss(new URL(`${ref}/pattern.css`, patternsBase), warnings));
    if (group === 'layouts') {
      const r = await fetch(new URL(`${ref}/pattern.html`, patternsBase));
      if (!r.ok) throw new Error(`kit: layout ${ref} has no pattern.html (${r.status})`);
      layouts[ref] = await r.text();
      return;
    }
    try {
      let m;
      if (group === 'sound') {
        // a cue is pattern.js or a recipe.json (data, drawn by synth.js); with a sound profile set the recipe wins
        const code = async () => (await seededImport(new URL(`${ref}/pattern.js`, patternsBase).href)).default;
        const data = async () => {
          const r = await fetch(new URL(`${ref}/recipe.json`, patternsBase));
          if (!r.ok) throw new Error(`neither pattern.js nor recipe.json (${r.status})`);
          return recipeModule(await r.json());
        };
        m = style.sound?.profile ? await data().catch(code) : await code().catch(data);
      } else m = (await seededImport(new URL(`${ref}/pattern.js`, patternsBase).href)).default;
      const fn = group === 'sound' ? 'render' : group === 'screen' ? 'reduce' : 'at';
      if (!m || typeof m[fn] !== 'function') throw new Error(`no default export with ${fn}()`);
      modules[ref] = m;
    } catch (e) {
      // A cue is named by the story, not referenced as a pattern: without its module the cue simply
      // starts on its beat's arrival, so this is not a G-PATTERN-REF warning.
      if (group === 'sound') warnings.push(`cue ${ref.slice(6)}: ${ref} could not be read (${e.message}); it starts on its beat's arrival`);
      else warnings.push(`pattern ${ref} did not load: ${e.message}`);
      return;
    }
    if (modules[ref].fragment === true) {
      const r = await fetch(new URL(`${ref}/pattern.html`, patternsBase));
      if (r.ok) fragments[ref] = await r.text();
      else warnings.push(`pattern ${ref} declares fragment: true but has no pattern.html (${r.status})`);
    }
  }));

  // Scenes: <section data-scene> > .mm-camera > layout fragment, slots filled from beats.
  const stage = document.createElement('div');
  stage.className = 'mm-stage';
  const media = [];
  const screenSpecs = [];
  const eachOpts = {};
  if (style.finish) stage.append(finishDefs(style.finish, style.color, spec));
  if (needsFx(style.finish)) { stage.style.filter = 'url(#mm-fx)'; waits.push(warmRamp()); }   // chroma, bloom and the look: one filter on the frame
  const scenes = story.scenes.map((sc) => {
    const el = document.createElement('section');
    el.className = 'mm-scene';
    el.dataset.scene = sc.id;
    el.dataset.layout = sc.layout;
    if (sc === story.scenes[0]) el.dataset.hook = '';   // the first scene is the hook
    if (style.ground) el.append(groundOf(style.ground, spec, media));   // behind the camera, in every scene, so a cut carries it
    const camera = document.createElement('div');
    camera.className = 'mm-camera';
    camera.innerHTML = layouts[sc.layout];
    const surfaceOf = sc.beats.map((b) => b.params?.surface).find((v) => v === 'glass' || v === 'flat') ?? style.patterns?.[sc.layout]?.surface;
    if (surfaceOf === 'glass' && camera.firstElementChild) camera.firstElementChild.dataset.surface = 'glass';   // the layout's cards marked data-glass wear the brand's surface
    el.append(camera);
    // a brand's defaults for the layout's params (style.patterns["layouts/x"]) land as data-p-* on the layout's root, unless a beat of the scene sets that param itself
    const own = new Set(sc.beats.flatMap((b) => Object.keys(shared(b))));
    for (const [k, v] of Object.entries(style.patterns?.[sc.layout] || {})) if (!own.has(k)) camera.firstElementChild?.setAttribute(`data-p-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(v));
    if (style.finish) el.append(finishOf(style.finish, style.color));   // above the camera, in every scene
    if (style.finish?.misregister > 0) el.dataset.misregister = '';   // the plate prints under the camera's shapes
    stage.append(el);
    for (const b of sc.beats) {
      let slot = camera.querySelector(`[data-slot="${b.slot}"]`);
      if (!slot) {
        warnings.push(`unknown slot: layout ${sc.layout} has no slot "${b.slot}"; appended one`);
        slot = document.createElement('div');
        slot.dataset.slot = b.slot;
        camera.append(slot);
      }
      const prm = b.params || {};
      const each = !!prm.each || slot.hasAttribute('data-each');
      if (fragments[b.fx]) instantiate(slot, fragments[b.fx], b, warnings);
      else if (each && b.text != null) splitInto(slot, eachParts(b.text, prm.sep));
      else if (b.text != null) (slot.querySelector(':scope > [data-text]') ?? slot).textContent = b.text;   // a slot holding a picture keeps its text in a [data-text] child
      if (fragments[b.fx] && b.params?.frame) media.push(frameOf(slot, String(b.params.frame)));   // your own device frame
      if (b.value != null) slot.dataset.value = String(b.value);
      if (b.fact) slot.dataset.fact = b.fact;
      if (b.asset) {
        slot.dataset.asset = b.asset;
        // a folder (a frame sequence or a captured page) is drawn by the screen layer, not the <img>
        if (!b.asset.endsWith('/')) for (const m of [slot, ...slot.querySelectorAll('img, video')]) if (/^(IMG|VIDEO)$/.test(m.tagName) && !m.hasAttribute('src')) media.push(setSrc(m, b.asset, slot));
      }
      if (b.screen?.length || b.asset?.endsWith('/')) screenSpecs.push({ sc, b, slot });
      if (each) {
        if (slot.children.length) eachOpts[selectorOf(sc.id, b.slot)] = { n: slot.children.length, ...(slot.dataset.stagger != null ? { stagger: Number(slot.dataset.stagger) } : {}) };
        else warnings.push(`${selectorOf(sc.id, b.slot)}: data-each with no children; it arrives whole`);
      }
      slot.dataset.fx = b.fx;
      slot.dataset.at = String(b.at);
      if (story.kind === 'deck') slot.dataset.step = String(b.step ?? 1);
      if (b.until != null) slot.dataset.until = String(b.until);
      if (b.out != null) slot.dataset.out = String(b.out);
      if (b.exit) slot.dataset.exit = b.exit;
      if (b.emphasis) slot.dataset.emphasis = b.emphasis;
      for (const [k, v] of Object.entries(shared(b))) slot.setAttribute(`data-p-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, String(v));
    }
    for (const empty of camera.querySelectorAll('[data-slot]:not([data-fx])')) empty.setAttribute('data-empty', '');
    return { id: sc.id, el, camera };
  });
  root.append(stage);

  const sched = buildSchedule(story, style, { patterns: modules, each: eachOpts });
  warnings.push(...sched.warnings);

  const fonts = await fontsP;
  for (const f of fonts) if (f.status !== 'loaded') warnings.push(`font ${f.family} ${f.weight} (${f.src}) ${f.status}`);
  await Promise.all(waits);
  for (const err of await Promise.all(media)) if (err) warnings.push(err);
  const screens = (await Promise.all(screenSpecs.map((x) => mountScreen(x, warnings)))).filter(Boolean);
  const footage = await mountFootage(story, { stage, duration: sched.duration, kind: story.kind }, warnings);   // story.footage on every <img data-footage>
  await document.fonts.ready;

  // Bind schedule items to elements and snapshot everything a pattern may write to.
  const sceneIndex = new Map(story.scenes.map((sc, i) => [sc.id, i]));
  const items = sched.items.map((it) => ({ ...it, el: stage.querySelector(it.selector), si: sceneIndex.get(it.scene), type: isType(it.beat, it.fx) }));
  const managed = new Set();
  for (const s of scenes) { managed.add(s.el); managed.add(s.camera); }
  for (const it of items) managed.add(it.el);
  // A cascade parent carries its children and the capped spacing (W-STAGGER reads data-stagger).
  for (const it of items) if (it.each) {
    if (!it.el.getAttribute('data-each')) it.el.setAttribute('data-each', it.fx);
    it.el.dataset.stagger = String(it.each.step);
  }
  // innerHTML is restored for every managed element that holds no other managed element. An element
  // that does (a cascade parent, which also carries the beat's emphasis) keeps its child list instead:
  // restore() removes whatever a pattern appended. A layer the kit draws itself (data-mm-own: a
  // screen layer) is lifted out first and put back into the restored markup, so patterns' DOM is
  // undone while the layer's decoded pictures stay.
  const snapshots = [...managed].map((el) => {
    const own = [...el.querySelectorAll('[data-mm-own]')];
    const nested = [...managed].some((m) => m !== el && el.contains(m));
    for (const l of own) l.remove();
    const html = nested ? null : el.innerHTML;
    for (const l of own) (el.querySelector('[data-screen]') ?? el).append(l);
    return { el, style: el.getAttribute('style'), html, kids: nested ? [...el.childNodes] : null, own: nested ? [] : own };
  });
  const keeps = [...stage.querySelectorAll('[data-keep]')].map((el) => {
    const sc = el.closest('[data-scene]');
    const k = el.getAttribute('data-keep');
    const selector = el.dataset.slot ? selectorOf(sc.dataset.scene, el.dataset.slot)
      : k ? `[data-scene="${sc.dataset.scene}"] [data-keep="${k}"]` : `[data-scene="${sc.dataset.scene}"] [data-keep]`;
    return { el, selector, si: sceneIndex.get(sc.dataset.scene) };
  });

  for (const x of screens) x.item = items.find((it) => !it.parent && it.scene === x.scene && it.beat?.slot === x.slot) ?? null;
  Object.assign(S, { story, style, sched, format, spec, stage, scenes, items, keeps, modules, snapshots, warnings, fonts, screens, footage, cur: 0, t: 0, state: new Map(), vis: [], speaker: null, face: null });
  S.speaker = mountSpeaker(S, warnings);   // where the speaker stands scene by scene (scene.frame), read once the layouts have their boxes
  // a bloom ground rises over each scene's first beat (at least a standard duration); graph-paper drifts with the piece
  S.ground = style.ground ? groundSpec(style.ground) : null;
  S.groundWindows = S.ground && isAnimated(S.ground) ? sched.scenes.map((s) => firstBeatWindow(sched.items.filter((it) => it.scene === s.id && !it.parent), s.start, style.motion.durations.standard / 1000)) : [];

  const api = {
    ready: true, kind: story.kind, format,
    seek, goto, report, next, prev, settle,
    position: () => S.cur,
    scenes: sched.scenes.map(({ id, start, end }) => ({ id, start, end })),
    schedule: sched, fonts, warnings,
    faceBox: () => (S.face ? { ...S.face } : null),   // the face box now, frame px: the matte's head or a default, with `source`
  };
  if (story.kind === 'deck') {
    api.presses = sched.presses;
    window.addEventListener('keydown', onKey);
    window.addEventListener('click', onClick);
    window.addEventListener('hashchange', () => { const n = hashPress(); if (n != null) goto(n); });
  } else {
    api.duration = sched.duration;
  }
  window.mm = api;
  S.ready = true;
  fitHeadlines();

  // Initial instant: ?t= (film), ?press= (deck), the hash (deck), else the start.
  if (story.kind === 'deck') {
    const n = q.has('press') ? Number(q.get('press')) : hashPress();
    if (n != null && Number.isFinite(n)) goto(n); else seek(0);
  } else {
    seek(q.has('t') ? Number(q.get('t')) : 0);
  }
  return api;
}

// Each scene's word-fitted slots (a style that declares --mm-fit: word) and then its mm-fit headline
// are sized once to the room its layout leaves, with the scene drawn at its rest (fit.js); the sizes
// (and a word fit's soft hyphens) go into the snapshots, so every seek draws them and no instant
// depends on another. A word fit never goes under the format's body floor. No later headline is
// drawn larger than the hook's size over HOOK_STEP, so the hook stays the largest headline of the piece.
function fitHeadlines() {
  let max = Infinity;
  const floor = bodyFloor(S.story.kind, S.format);
  const keep = (el, decl) => {
    const snap = S.snapshots.find((x) => x.el === el);
    if (snap) snap.style = `${snap.style ? snap.style.replace(/;?\s*$/, '; ') : ''}${decl}`;
    return snap;
  };
  S.sched.scenes.forEach((sc, i) => {
    const words = [...S.scenes[i].el.querySelectorAll('[data-slot]:not([data-empty])')].filter(wantsWordFit);
    if (!words.length && !S.scenes[i].el.querySelector('.mm-fit[data-slot="headline"]:not([data-empty])')) return;
    const hold = S.sched.holds?.find((h) => h.scene === sc.id);
    seek(S.story.kind === 'deck' ? sc.end : hold ? hold.from : Math.max(sc.start, sc.end - 1e-3));
    for (const w of words) {
      const r = fitWords(w, floor);
      if (!r || (r.px === r.authored && !r.el.style.hyphens)) continue;
      const snap = keep(r.el, `font-size: ${r.px}px;${r.el.style.hyphens ? ' hyphens: manual;' : ''}`);
      if (snap?.html != null && r.el.style.hyphens) {
        const t = document.createElement('template');
        t.innerHTML = snap.html;
        const walk = document.createTreeWalker(t.content, 4);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) n.textContent = r.hyphenate(n.textContent);
        snap.html = t.innerHTML;
      }
    }
    const r = fitHeadline(S.scenes[i].el, { max: i === 0 ? Infinity : max, least: floor });
    if (!r) return;
    if (i === 0) max = r.px / HOOK_STEP;
    if (r.px !== r.authored) keep(r.el, `font-size: ${r.px}px;`);
    if (r.broken) S.warnings.push(`${selectorOf(sc.id, 'headline')}: the headline breaks a word across lines even at the body floor; shorten its longest word`);
  });
}

// A pattern's pattern.html in its slot (SPEC §5): nested data-slot elements are filled from the
// beat (text, value, asset, or the param of the same name) and renamed data-part, so no selector
// for a layout slot can ever land inside a fragment. Text goes to the part named `text`, else to
// the first part nothing else claimed.
function instantiate(slot, html, b, warnings) {
  slot.innerHTML = html;
  const prm = shared(b);
  const free = [];
  let told = false;
  for (const part of slot.querySelectorAll('[data-slot]')) {
    const name = part.dataset.slot;
    part.removeAttribute('data-slot');
    part.dataset.part = name;
    if (name === 'asset') { if (b.asset) part.dataset.asset = b.asset; }
    else if (name === 'value') { if (b.value != null) part.textContent = String(b.value); }
    else if (name === 'text') { if (b.text != null) { part.textContent = b.text; told = true; } }
    else if (name in prm) part.textContent = String(prm[name]);
    else free.push(part);
  }
  if (b.text != null && !told) {
    if (free.length) free[0].textContent = b.text;
    else warnings.push(`${b.fx}: its pattern.html has no part for the beat's text`);
  }
}

// A cascade over a beat's text: one child per part, separated by spaces so inline lists still read.
function splitInto(slot, parts) {
  slot.textContent = '';
  parts.forEach((part, i) => {
    if (i) slot.append(' ');
    const span = document.createElement('span');
    span.className = 'mm-each';
    span.textContent = part;
    slot.append(span);
  });
}

// A beat's asset on an <img>/<video>: a relative path, so it resolves against the piece's page.
// Resolves to an error string or null once the media can be drawn (fonts and pictures are awaited
// before the first seek, so the first frame is deterministic). Once it can, the slot gets the
// picture's proportions as --mm-asset-ratio (width / height, 4 decimals) and its shape as
// data-asset-shape (landscape above 1.25, portrait below 0.8, else square), so a layout can frame a
// picture at its own shape (layouts/media); both are written before the mount snapshot, so every
// seek restores them.
// a device frame image the user owns (`mm media frame` wrote <frame>.png and <frame>.json).
// The device takes the image's proportions, its screen fills the measured hole (percentages of the
// image, an elliptical corner radius), and the frame is drawn over the screen as declared media.
// Written before the mount snapshot, so every seek restores it; the device CSS steps its own shell aside.
async function frameOf(slot, frame) {
  let meta;
  try { const r = await fetch(new URL(`${frame}.json`, location.href)); if (!r.ok) throw new Error(String(r.status)); meta = await r.json(); }
  catch { return `frame ${frame}.json did not load: run mm media frame <png> --name <n> --piece <piece>`; }
  const root = slot.querySelector('[data-device]');
  const { image: im, screen: s } = meta ?? {};
  if (!root || !(im?.w > 0 && im?.h > 0) || !(s?.w > 0 && s?.h > 0)) return `frame ${frame}: no device to frame, or no image and screen in its json`;
  const pc = (v, of) => `${((v / of) * 100).toFixed(4)}%`;
  slot.dataset.frame = '';
  root.style.setProperty('--mm-df-ar', `${im.w} / ${im.h}`);
  root.style.setProperty('--mm-df-x', pc(s.x, im.w));
  root.style.setProperty('--mm-df-y', pc(s.y, im.h));
  root.style.setProperty('--mm-df-w', pc(s.w, im.w));
  root.style.setProperty('--mm-df-h', pc(s.h, im.h));
  root.style.setProperty('--mm-df-r', `${pc(s.radius ?? 0, s.w)} / ${pc(s.radius ?? 0, s.h)}`);
  const img = document.createElement('img');
  img.className = 'mm-device-frame';
  img.alt = '';
  img.setAttribute('data-media', '');
  img.setAttribute('aria-hidden', 'true');
  root.append(img);
  img.setAttribute('src', `${frame}.png`);
  return img.decode().then(() => null, () => `frame ${frame}.png did not load`);
}

function setSrc(el, asset, slot) {
  return new Promise((resolve) => {
    const fail = () => resolve(`asset ${asset} did not load`);
    const done = (w, h) => {
      if (w > 0 && h > 0) {
        slot.style.setProperty('--mm-asset-ratio', (w / h).toFixed(4));
        slot.dataset.assetShape = w / h > 1.25 ? 'landscape' : w / h < 0.8 ? 'portrait' : 'square';
      }
      resolve(null);
    };
    if (el.tagName === 'VIDEO') {
      el.muted = true;
      el.preload = 'auto';
      el.addEventListener('loadeddata', () => done(el.videoWidth, el.videoHeight), { once: true });
      el.addEventListener('error', fail, { once: true });
      el.setAttribute('src', asset);
    } else {
      el.setAttribute('src', asset);
      el.decode().then(() => done(el.naturalWidth, el.naturalHeight), fail);
    }
  });
}

// the brand finish. One overlay per scene above the camera, a layer per strength: grain
// (ink through seeded noise) and halftone (an ink dot screen) at no more than 0.08 opacity, since they
// cover text; a vignette toward the darker of ink and canvas that stays at or under 0.08 inside the safe area; an accent glow and a
// rough surface border, both inside the safe margin. Only palette roles, so G-BRAND's two-colour
// blends still hold. The grain's seed is set per seek from t (12 Hz by default, `grainRate`), so it flickers like film and is
// the same at every seek. Chrome, not content. The paper is a fibre in ink, also at no more than 0.08,
// whose noise is seeded once: it belongs to the stock, so it never changes with t. Grain, halftone,
// scanlines and fibre all lie over text, so together they stay at or under 0.08: when their strengths
// add up past 1, each is scaled down in proportion (finish.js overTextShares). Chroma, bloom and the
// look are not layers: they are one filter on the stage (finish.js fxFilter).
const FINISH_LAYERS = [['grain', 'grain'], ['halftone', 'halftone'], ['scanlines', 'scan'], ['vignette', 'vignette'], ['edgeFringe', 'edge'], ['paperEdge', 'paper'], ['paper', 'fibre']];
// the darker of two hex colours by relative luminance: what a vignette darkens toward
function darkerOf(a, b) {
  const lum = (hex) => { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16); const c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  return lum(a) <= lum(b) ? a : b;
}
function finishOf(finish, color) {
  const f = document.createElement('div');
  f.className = 'mm-finish';
  f.style.setProperty('--mm-finish-shade', darkerOf(color.ink, color.canvas));
  f.setAttribute('aria-hidden', 'true');
  f.setAttribute('data-chrome', '');
  f.setAttribute('data-keep', '');
  const over = overTextShares(finish);   // grain, halftone, paper and scanlines share the 0.08 that lies over text
  const strength = (key) => over[key] ?? (Number(finish[key]) > 0 ? Math.min(1, Number(finish[key])) : 0);
  for (const [key, cls] of FINISH_LAYERS) {
    const v = strength(key);
    if (!(v > 0)) continue;
    const l = document.createElement('span');
    l.className = `mm-finish__${cls}`;
    l.style.setProperty('--mm-finish-v', String(v));
    f.append(l);
  }
  return f;
}
function finishDefs(finish, color, spec) {
  // parsed as HTML so the SVG namespace needs no URL in the runtime (SPEC §2.6)
  const holder = document.createElement('div');
  holder.innerHTML = '<svg id="mm-finish-defs" aria-hidden="true" width="0" height="0" style="position:absolute"></svg>';
  const svg = holder.firstElementChild;
  svg.innerHTML = '<filter id="mm-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
    + '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="1" stitchTiles="stitch" result="n"/>'
    + '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.6 0 0 0 -0.4" result="a"/>'
    + '<feComposite in="SourceGraphic" in2="a" operator="in"/></filter>'
    + '<filter id="mm-fibre" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">'
    + '<feTurbulence type="fractalNoise" baseFrequency="0.9 0.3" numOctaves="4" seed="11" stitchTiles="stitch" result="n"/>'
    + '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.2 0 0 0 -0.85" result="a"/>'
    + '<feComposite in="SourceGraphic" in2="a" operator="in"/></filter>'
    + '<filter id="mm-paper" x="-2%" y="-2%" width="104%" height="104%">'
    + '<feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="n"/>'
    + '<feDisplacementMap in="SourceGraphic" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G"/></filter>'
    + fxFilter(finish, color, spec, rampUrl());   // chroma, bloom and the look: the stage's own filter, if the finish asks for one
  return svg;
}
function finishSeed(t) {
  const n = document.querySelector('#mm-finish-defs #mm-grain feTurbulence');
  if (n) n.setAttribute('seed', String(grainSeed(t, S.style.finish.grainRate ?? 12)));
}

// brand.finish.misregister: a spot plate printed off register. The scene's shapes print again in
// accent beneath themselves (a hard drop shadow), so the plate shows only beside them. The offset is
// fixed per scene (0.4 % of the frame width at strength 1, down and to a side seeded by the scene), and
// every emphasis kicks it along the same line (plateKick), so the rest is still; a deck keeps the
// fixed offset. The shadow sits on the camera's layers, never on the camera: a filter flattens the 3D
// of whatever carries it, so each scene marks the largest boxes that hold no layer of their own (a slot,
// or anything a move lifts by data-depth), and a camera move that parts the layers in depth keeps them
// parted. A box whose smallest type is under display size takes a smaller offset, at most 0.05 of that
// type's size (about half a regular stroke), so a body line reads as one line with a coloured edge,
// never as two lines.
const PLATE_TEXT = 0.05;   // the largest offset beside a line of type, in its font sizes
const KICK = { span: 0.6, period: 0.6, decay: 4 };   // the swing: its length and period in s, its damping per s
/**
 * The emphasis kick on the plate at piece time t, as a share of its full swing: out on the first step,
 * back past register, then to rest, over 0.6 s or the emphasis less one step, whichever is shorter. It
 * steps every max(2, frameHold)/30 s from t = 0, on the grid a stop-motion piece draws on, and its first
 * step is the first grid instant at or after the emphasis starts, so the same swing shows wherever the
 * emphasis falls against the grid. 0 outside the swing.
 */
export function plateKick(t, start, d, frameHold = 1) {
  const q = Math.max(2, Number(frameHold) || 1) / 30;
  const span = Math.min(KICK.span, d - q);
  if (!(span > 0)) return 0;
  const x = (Math.floor(t / q + 1e-6) - Math.ceil(start / q - 1e-6)) * q;
  if (x < -1e-9 || x >= span - 1e-9) return 0;
  return Math.exp(-KICK.decay * x) * Math.cos((2 * Math.PI * x) / KICK.period) * (1 - x / span);
}
// the boxes in a camera that carry its plate: the largest that hold no layer of their own
function plateBoxes(camera) {
  const out = [];
  const walk = (n) => { for (const c of n.children) { if (c.querySelector('[data-slot], [data-depth]')) walk(c); else out.push(c); } };
  walk(camera);
  return out;
}
// the smallest font size of the text in a box, in px; Infinity when it holds none
function typeFloor(el) {
  let f = Infinity;
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.textContent.trim()) f = Math.min(f, parseFloat(getComputedStyle(n.parentElement).fontSize) || Infinity);
  return f;
}
function misregisterAt(t) {
  const v = Math.min(1, S.style.finish.misregister);
  const w = S.spec.w;
  const n = parseInt(String(S.style.color.accent).slice(1, 7), 16);
  const film = S.story.kind !== 'deck';
  const r2 = (q) => Math.round(q * 100) / 100;
  const base = 0.004 * w * v;
  S.story.scenes.forEach((sc, i) => {
    const rnd = random(hash(`misregister:${sc.id}`));
    const a = (20 + 50 * rnd()) * Math.PI / 180, side = rnd() < 0.5 ? -1 : 1;
    let m = base;
    if (film) for (const it of S.items) {
      const e = it.si === i && it.emphasis;
      if (!e || !(e.d > 0)) continue;
      m += 0.012 * w * v * plateKick(t, e.start, e.d, S.style.motion?.frameHold);
    }
    const cam = S.scenes[i].camera;
    for (const el of cam.querySelectorAll('[data-plate]')) { el.removeAttribute('data-plate'); el.style.removeProperty('--mm-plate'); }
    for (const el of plateBoxes(cam)) {
      const k = Math.min(1, (PLATE_TEXT * typeFloor(el)) / base);
      el.setAttribute('data-plate', '');
      el.style.setProperty('--mm-plate', `drop-shadow(${r2(side * m * k * Math.cos(a))}px ${r2(m * k * Math.sin(a))}px 0 rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${r2(0.75 * v)}))`);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// style → CSS variables, fonts, base styles

function px(v) { return `${Math.round(v * 100) / 100}px`; }

function setVariables(style, spec) {
  const r = document.documentElement.style;
  const set = (k, v) => r.setProperty(k, String(v));
  set('--mm-frame-w', px(spec.w));
  set('--mm-frame-h', px(spec.h));
  set('--mm-safe', px(spec.safe));
  // device finish (brand devices.finish), always a palette role so the style stays the only
  // look (AXIOM 2), and always one that stands apart from the canvas (contrast 1.3 or more):
  // ink; canvas (the surface, else the role nearest the canvas that clears it); graphite (the darkest
  // role that clears it); silver (the lightest). The phone's island is the darkest role.
  const lin = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); return 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255); };
  const roles = Object.entries(style.color).filter(([, v]) => /^#[0-9a-f]{6}/i.test(v)).map(([k, v]) => ({ k, L: lum(v) })).sort((a, b) => a.L - b.L);
  const canvasL = lum(style.color.canvas ?? '#ffffff');
  const apart = roles.filter((r) => (Math.max(r.L, canvasL) + 0.05) / (Math.min(r.L, canvasL) + 0.05) >= 1.3);
  const pick = (want) => {
    if (want === 'canvas') return apart.some((r) => r.k === 'surface') ? 'surface' : [...apart].sort((a, b) => Math.abs(a.L - canvasL) - Math.abs(b.L - canvasL))[0]?.k;
    if (want === 'graphite') return apart[0]?.k;
    if (want === 'silver') return apart.at(-1)?.k;
    return 'ink';
  };
  set('--mm-device-body', `var(--mm-color-${pick(style.devices?.finish ?? 'ink') ?? 'ink'})`);
  set('--mm-device-island', `var(--mm-color-${roles[0]?.k ?? 'ink'})`);
  set('--mm-device-island-ink', `var(--mm-color-${roles.at(-1)?.k ?? 'canvas'})`);   // text inside an open island
  // the polished devices. Glass (the bezel and the camera) is the darkest role; the metal rim
  // runs from the finish mixed toward the lightest role to the finish mixed toward the darkest, so
  // every pixel is a blend of two palette roles (G-BRAND); shadows fall in the darkest role and the
  // glass sheen is the lightest at a few percent.
  const darkest = roles[0]?.k ?? 'ink', lightest = roles.at(-1)?.k ?? 'canvas';
  set('--mm-device-glass', `var(--mm-color-${darkest})`);
  set('--mm-device-rim-light', `color-mix(in srgb, var(--mm-device-body) 55%, var(--mm-color-${lightest}))`);
  set('--mm-device-rim-dark', `color-mix(in srgb, var(--mm-device-body) 62%, var(--mm-color-${darkest}))`);
  set('--mm-device-shade', `var(--mm-color-${darkest})`);
  set('--mm-device-glint', `var(--mm-color-${lightest})`);
  set('--mm-device-spec', `color-mix(in srgb, var(--mm-device-body) 25%, var(--mm-color-${lightest}))`);   // a specular band on the metal
  // a camera lens in the glass: a dark core, a lit ring, a soft edge (blends of the darkest and lightest roles)
  set('--mm-device-lens', `color-mix(in srgb, var(--mm-color-${lightest}) 11%, var(--mm-color-${darkest}))`);
  set('--mm-device-lens-ring', `color-mix(in srgb, var(--mm-color-${lightest}) 23%, var(--mm-color-${darkest}))`);
  for (const [role, v] of Object.entries(style.color)) set(`--mm-color-${role}`, v);
  // the brand's text rules. Text on a surface takes surfaceInk (ink when the brand gives
  // none, muted text likewise); a brand with accentText false never tints text with the accent.
  if (!style.color.surfaceInk) set('--mm-color-surfaceInk', 'var(--mm-color-ink)');
  set('--mm-surface-muted', style.color.surfaceInk ? 'var(--mm-color-surfaceInk)' : 'var(--mm-color-muted)');
  for (const [role, face] of Object.entries(style.type)) {
    set(`--mm-font-${role}`, `"${face.family}"`);
    set(`--mm-weight-${role}`, face.weight);
    set(`--mm-tracking-${role}`, `${face.tracking}em`);
  }
  for (const [role, s] of Object.entries(style.scale)) set(`--mm-size-${role}`, px(s * spec.base));
  style.space.forEach((v, i) => set(`--mm-space-${i}`, px(v)));
  style.radius.forEach((v, i) => set(`--mm-radius-${i}`, px(v)));
  for (const [name, ms] of Object.entries(style.motion.durations)) set(`--mm-dur-${name}`, `${ms}ms`);
  for (const [name, e] of Object.entries(style.motion.easings)) set(`--mm-ease-${name}`, e);
  set('--mm-travel', style.motion.travel);
  // the brand's composition. Layouts read these for their default alignment, headline size
  // and spacing; a style with no composition reads as left, 1, airy.
  const c = composition(style);
  set('--mm-align', c.align === 'center' ? 'center' : 'start');
  set('--mm-headline-scale', c.headlineScale);
  set('--mm-density', DENSITY[c.density] ?? 1);
  set('--mm-accent-text', c.accentText === false ? 'var(--mm-color-ink)' : 'var(--mm-color-accent)');
  // the glass surface (brand surface block): cards that opt in with `surface: glass` wear it
  for (const [k, v] of Object.entries(surfaceVars(style.surface, spec, style.color))) set(k, v);
}

// The composition defaults and the spacing multiplier each density stands for.
const COMPOSITION = { align: 'left', headlineScale: 1, density: 'airy', accentText: true };
const DENSITY = { airy: 1, compact: 0.6 };
// the hook (the first scene's headline) is one step larger than any other headline of its
// layout, so it is the largest headline of the piece in every format.
export const HOOK_STEP = 1.25;
export function composition(style) { return { ...COMPOSITION, ...(style.composition || {}) }; }

function injectBase(style) {
  const el = document.createElement('style');
  el.id = 'mm-base';
  el.textContent = `
.mm-screen { position: absolute; inset: 0; z-index: 2; overflow: hidden; border-radius: inherit; background: var(--mm-color-surface); }
.mm-screen--bare { background: transparent; }
.mm-screen__content { position: absolute; inset: 0; transform-origin: 0 0; }
.mm-screen__media { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.mm-screen__tile { position: absolute; left: 0; display: block; max-width: none; }
.mm-screen__overlay { position: absolute; display: block; max-width: none; z-index: 1; }
.mm-screen-fx { position: absolute; inset: 0; pointer-events: none; }
.mm-scene[data-hook] { --mm-headline-scale: ${Math.round(composition(style).headlineScale * HOOK_STEP * 1e4) / 1e4}; }
html, body { margin: 0; padding: 0; background: var(--mm-color-canvas); }
.mm-stage { position: relative; width: var(--mm-frame-w); height: var(--mm-frame-h); overflow: hidden;
  background: var(--mm-color-canvas); color: var(--mm-color-ink);
  font-family: var(--mm-font-text); font-weight: var(--mm-weight-text); letter-spacing: var(--mm-tracking-text); }
.mm-scene, .mm-camera { position: absolute; inset: 0; }
/* the camera is a stacking context of its own (z-index, not isolation, so a 3D move's preserve-3d is not flattened): no layout's z-index rises above its scene's finish or a cut's overlay */
.mm-camera { z-index: 0; }
.mm-ground { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.mm-ground__blob { position: absolute; display: block; border-radius: 50%; }
.mm-ground__bloom, .mm-ground__scan { position: absolute; display: block; }
.mm-ground__dots, .mm-ground__grid { position: absolute; inset: 0; display: block; }
.mm-ground__bloom { transform-origin: 50% 50%; }
.mm-ground__mark { position: absolute; top: 50%; left: 50%; max-width: none; height: auto; transform: translate(-50%, -50%); display: block; }
.mm-finish { position: absolute; inset: 0; z-index: 5; overflow: hidden; pointer-events: none; }
.mm-finish > span { position: absolute; inset: 0; display: block; }
.mm-finish__grain { background: var(--mm-color-ink); filter: url(#mm-grain); opacity: calc(0.08 * var(--mm-finish-v)); }
.mm-finish__halftone { opacity: calc(0.08 * var(--mm-finish-v));
  background-image: radial-gradient(circle, var(--mm-color-ink) 0 28%, transparent 32%); background-size: calc(var(--mm-frame-w) / 160) calc(var(--mm-frame-w) / 160); }
.mm-finish__scan { opacity: calc(0.08 * var(--mm-finish-v));
  background-image: linear-gradient(to bottom, var(--mm-color-ink) 0 40%, transparent 40% 100%); background-size: 100% calc(min(var(--mm-frame-w), var(--mm-frame-h)) / 270); }
.mm-finish__vignette { background: radial-gradient(ellipse farthest-corner at 50% 50%, transparent 0 62%,
  color-mix(in srgb, var(--mm-finish-shade) calc(8% * var(--mm-finish-v)), transparent) 88%,
  color-mix(in srgb, var(--mm-finish-shade) calc(40% * var(--mm-finish-v)), transparent) 100%); }
.mm-finish__edge { box-shadow: inset 0 0 calc(var(--mm-safe) * 0.7) calc(var(--mm-safe) * 0.08) color-mix(in srgb, var(--mm-color-accent) calc(55% * var(--mm-finish-v)), transparent); }
.mm-finish__fibre { background: var(--mm-color-ink); filter: url(#mm-fibre); opacity: calc(0.08 * var(--mm-finish-v)); }
.mm-scene[data-misregister] > .mm-camera [data-plate] { filter: var(--mm-plate, none); }
.mm-finish__paper { box-sizing: border-box; border: calc(var(--mm-safe) * 0.4 * var(--mm-finish-v)) solid var(--mm-color-surface); filter: url(#mm-paper); }
.mm-device-frame { position: absolute; inset: 0; z-index: 6; display: block; width: 100%; height: 100%; max-width: none; pointer-events: none; }
.mm-scene { background: var(--mm-color-canvas); }
/* the glass surface: any element marked data-glass inside a data-surface=glass scope (a layout's root, or the element itself). The accent variant (data-glass="accent") keeps the accent fill and takes the edge and the shine only; the others' own fill gives way to the tint. */
[data-surface="glass"] [data-glass], [data-glass][data-surface="glass"] {
  overflow: hidden; -webkit-backdrop-filter: blur(var(--mm-surface-blur)) saturate(var(--mm-surface-saturate)); backdrop-filter: blur(var(--mm-surface-blur)) saturate(var(--mm-surface-saturate));
  box-shadow: var(--mm-surface-shadow); background-color: transparent;
  background-image: var(--mm-surface-shine), var(--mm-surface-fill); background-size: 260% 100%, 100% 100%; background-repeat: no-repeat;
  background-position: var(--mm-shine-x, -3%) 0, 0 0; }
[data-surface="glass"] [data-glass="accent"], [data-glass="accent"][data-surface="glass"] {
  -webkit-backdrop-filter: none; backdrop-filter: none; background-color: var(--mm-color-accent); background-image: var(--mm-surface-shine); background-size: 260% 100%; background-position: var(--mm-shine-x, -3%) 0; }
[data-empty] { visibility: hidden; }`;
  document.head.append(el);
}

function linkCss(url, warnings) {
  return new Promise((resolve) => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = url.href;
    l.onload = () => resolve(true);
    l.onerror = () => { warnings.push(`stylesheet ${url.pathname} did not load`); resolve(false); };
    document.head.append(l);
  });
}

// First codepoint of a unicode-range worth asking for (a letter where the range has one).
function sampleChar(range) {
  const m = /U\+([0-9A-F]+)(?:-([0-9A-F]+))?/i.exec(range);
  if (!m) return 'A';
  const lo = parseInt(m[1], 16), hi = m[2] ? parseInt(m[2], 16) : lo;
  return String.fromCodePoint(lo <= 0x41 && hi >= 0x41 ? 0x41 : Math.max(lo, 0x21));
}

// Writes one @font-face per file (relative src, its unicode-range), then asks for every subset
// explicitly: unicode-range faces otherwise load lazily, on first use, which is not determinism.
async function loadFonts(style) {
  const seen = new Set(), list = [], rules = [];
  for (const face of Object.values(style.type)) {
    for (const f of face.files) {
      const key = `${face.family}|${f.src}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const fmt = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[f.src.split('.').pop()];
      rules.push(`@font-face { font-family: "${face.family}"; src: url("${f.src}") format("${fmt}"); font-weight: ${f.weight}; font-style: normal; font-display: block; unicode-range: ${f.unicodeRange}; }`);
      list.push({ family: face.family, weight: f.weight, src: f.src, unicodeRange: f.unicodeRange });
    }
  }
  const el = document.createElement('style');
  el.id = 'mm-fonts';
  el.textContent = rules.join('\n');
  document.head.append(el);
  return Promise.all(list.map(async (f) => {
    try {
      const faces = await document.fonts.load(`${f.weight} 16px "${f.family}"`, sampleChar(f.unicodeRange));
      return { ...f, status: faces.length && faces.every((x) => x.status === 'loaded') ? 'loaded' : 'missing' };
    } catch {
      return { ...f, status: 'error' };
    }
  }));
}

// ---------------------------------------------------------------------------------------------
// seek

function restore() {
  // Transition overlays never outlive the seek that drew them; a --mm-tx-* property written on a
  // section goes with the section's style, restored below.
  for (const n of document.querySelectorAll('[data-mm-overlay]')) n.remove();
  for (const s of S.snapshots) {
    if (s.style == null) s.el.removeAttribute('style'); else s.el.setAttribute('style', s.style);
    if (s.kids) { for (const n of [...s.el.childNodes]) if (!s.kids.includes(n)) n.remove(); continue; }
    if (s.html == null) continue;
    for (const l of s.own) l.remove();
    if (s.el.innerHTML !== s.html) s.el.innerHTML = s.html;
    for (const l of s.own) (s.el.querySelector('[data-screen]') ?? s.el).append(l);
  }
}

function hide(el) { el.style.opacity = '0'; el.style.visibility = 'hidden'; }

function springCtx(style) {
  const resolve = (p) => (typeof p === 'string' ? style.motion.spring[p] : p);
  return Object.assign((t, p = 'ui') => spring(t, resolve(p)), {
    settle: (p = 'ui') => spring.settle(resolve(p)),
    overshoot: (p = 'ui', t) => spring.overshoot(resolve(p), t),
    params: resolve,
  });
}

// A pattern's defaults under the bag the story gives it.
function paramsOf(mod, bag) { return brandParams(mod, bag, S.style); }

// Param routing: a beat's scalar params go to its entrance, and to its exit and emphasis unless
// params.exit / params.emphasis give those their own bag.
function shared(beat) {
  return Object.fromEntries(Object.entries(beat?.params || {}).filter(([, v]) => v == null || typeof v !== 'object'));
}
function bagFor(beat, kind) {
  const own = beat?.params?.[kind];
  return own && typeof own === 'object' ? own : shared(beat);
}

// ctx.unit is the format's base size (SPEC §12): patterns express travel as multiples of it.
// ctx.boil(n) is the pen's shiver: which of n frames shows now, from the piece's time, the
// same for every stroke; style motion.boil seconds a frame (0 = still), and a deck always frame 0.
// ctx.t is the instant being drawn (film: piece seconds; deck: the press position), for a pattern
// that keeps time with the piece rather than with its own beat (a character's idle on the beat grid).
function ctxFor(selector, extra = {}) {
  return {
    style: S.style, format: S.format, deck: S.story?.kind === 'deck', unit: S.spec.base, t: S.t, random: random(hash(selector)), spring: springCtx(S.style),
    boil: (n = 3) => boilFrame(S.t, { period: S.style.motion?.boil ?? BOIL_PERIOD, n, deck: S.story?.kind === 'deck' }),
    ease: (name, p) => ease(name, p, S.style), afterSettle, seeded: (fn) => seeded(hash(selector), fn),
    ...(S.footage ? { footage: footageCtx(S.footage, S.t) } : {}), ...extra,
  };
}

// SPEC §15: type never overshoots. A beat that sets type (text, a value, or a text/ or
// data/ pattern) has its entrance progress clamped to 1, whatever spring or easing drives it.
function isType(beat, fx) {
  return (beat.text != null && beat.text !== '') || beat.value != null || /^(text|data)\//.test(fx);
}

// motion.frameHold 2 animates elements "on twos" and 3 "on threes": every element is drawn as it
// was at the last instant of one grid shared by the whole piece (every 2/30 s or 3/30 s from t = 0),
// so all elements step together, while cuts and camera moves stay smooth. The hold is counted in
// 1/30 s whatever the export frame rate, so at 60 fps a hold of 2 steps every 4 frames. local(x) is
// the element's local time at piece time x. A finished element stays finished (u >= d is never held
// back), and one that would finish inside the current step is drawn finished from it, so every rest is
// the same with or without the hold and the last change also lands on the grid.
const HOLD_FPS = 30;
function held(u, d, local) {
  const h = S.style.motion?.frameHold;
  if (!(h > 1) || !(u > 0) || u >= d - TOL) return u;
  const q = h / HOLD_FPS;
  const g = Math.floor(S.t * HOLD_FPS / h + 1e-6) * q;
  const at = local(g), next = local(g + q);
  if (next >= d - TOL && next >= at) return d;
  return at < TOL ? 0 : Math.min(d, at);
}

function entrance(it, u) {
  if (u >= it.d - TOL) return 1;
  const p = it.spring ? spring(u, it.spring) : ease('enter', u / it.d, S.style);
  return it.type ? Math.min(1, p) : p;
}

// Linear progress through the entrance: exactly 0 before it, exactly 1 from its end (d = 0 included).
function progressOf(it, u) {
  if (u < 0) return 0;
  if (u >= it.d - TOL) return 1;
  return clamp01(u / it.d);
}

function overshootOf(it, u) {
  if (it.type) return 0;
  const done = u >= it.d - TOL;
  if (it.spring) return spring.overshoot(it.spring, done ? Infinity : u);
  return ease.overshoot('enter', done ? 1 : u / it.d, S.style);
}

function runFx(it, p, u) {
  const mod = S.modules[it.fx] || fallbackFx;
  it.el.style.visibility = '';
  // finished from TOL before the end, as entrance() and progressOf() count it: a pattern reading u / d sees exactly 1
  // there; past the end u runs on (a 3D device keeps turning after its entrance)
  mod.at(it.el, p, ctxFor(it.selector, { params: paramsOf(mod, shared(it.beat)), u: u >= it.d - TOL && u < it.d ? it.d : u, d: it.d, scene: it.scene }));
  shineGlass(it.el, it.d > 0 ? clamp01(u / it.d) : 1);
}

// A glass card's one shine sweep on arrival: the bar crosses the card over the last 70 % of the entrance and is off
// the card before and after, so a rest never shows it. Written on every draw, so any seek order paints the same.
function shineGlass(el, q) {
  for (const g of el.matches('[data-glass]') ? [el] : el.querySelectorAll('[data-glass]')) {
    const at = g.closest('[data-surface="glass"]') ? shinePosition(q, (p) => ease('move', p, S.style)) : null;
    if (at) g.style.setProperty('--mm-shine-x', at); else g.style.removeProperty('--mm-shine-x');
  }
}

function runExit(it, q) {
  const mod = it.exit.pattern && S.modules[it.exit.pattern];
  if (q >= 1) return hide(it.el);
  if (mod) mod.at(it.el, q, ctxFor(it.selector, { params: paramsOf(mod, bagFor(it.beat, 'exit')), d: it.exit.d, scene: it.scene }));
  else it.el.style.opacity = String(1 - q);
}

function runEmphasis(it, q) {
  const mod = S.modules[it.emphasis.pattern];
  if (mod) mod.at(it.el, ease('move', q, S.style), ctxFor(it.selector, { params: paramsOf(mod, bagFor(it.beat, 'emphasis')), d: it.emphasis.d, u: q * it.emphasis.d, scene: it.scene }));
}

function runTransition(i, u, d) {
  const sc = S.story.scenes[i];
  const mod = S.modules[sc.cut];
  if (!mod) return;
  const from = S.scenes[i - 1].el, to = S.scenes[i].el;
  mod.at(to, ease('move', clamp01(u / d), S.style), ctxFor(`[data-scene="${sc.id}"]`, {
    params: paramsOf(mod, sc.cutParams), policy: S.style.transitions?.policy, from, to, u, d, scene: sc.id,
  }));
}

// A scene's camera move at progress p (film: through its seconds; deck: through its presses).
function runMove(i, p, extra) {
  const sc = S.story.scenes[i];
  const mod = sc.move && S.modules[sc.move];
  if (!mod) return;
  mod.at(S.scenes[i].camera, ease('move', clamp01(p), S.style),
    ctxFor(`[data-scene="${sc.id}"] .mm-camera`, { params: paramsOf(mod, sc.moveParams), scene: sc.id, ...extra }));
}

// the moving parts of the brand ground, per scene: a pure function of the instant, the scene's start and the style
function paintGrounds() {
  const deck = S.story.kind === 'deck', hold = S.style.motion?.frameHold, enter = (p) => ease('enter', p, S.style);
  S.sched.scenes.forEach((sc, i) => {
    const g = S.scenes[i].el.querySelector(':scope > .mm-ground');
    if (g) paintGround(g, S.ground, S.spec, { t: S.t, u: S.t - sc.start, windowS: S.groundWindows[i], enter, hold, deck });
  });
}

export function seek(t) {
  if (!S.ready) throw new Error('kit: seek before mount');
  restore();
  S.state = new Map();
  late = [];
  if (S.story.kind === 'deck') seekDeck(t); else seekFilm(t);
  placeFaceSafe(S);   // after every entrance: what a layout marks data-face-safe stands clear of the face
  if (S.style.finish?.grain > 0) finishSeed(t);
  if (S.ground && isAnimated(S.ground)) paintGrounds();
  if (S.style.finish?.misregister > 0) misregisterAt(S.t);
  runScreens();
  if (S.footage) paintFootage(S.footage, S.t, trackDecode, decodeWarning);
  if (late.length) settle();   // a live preview gets its renders too; the renderer awaits the same settle
}

// ---------------------------------------------------------------------------------------------
// screens: a beat's screen actions folded into one state per seek, then painted

// the screen actions that bring another asset onto the screen (compare reveals one beside the content)
const BRINGS = new Set(['screen/swap', 'screen/compare']);
const metaCache = new Map();
function metaOf(asset) {
  if (!asset?.endsWith('/')) return Promise.resolve(null);
  if (!metaCache.has(asset)) metaCache.set(asset, fetchMeta(asset));
  return metaCache.get(asset);
}
// recordings with no screen/play get one (schedule.js addImplicitPlays, shared with the gate)
// the same static screen checks the gate runs (schedule.js screenIssues), as warnings
async function implicitPlays(story, style) {
  const assets = story.scenes.flatMap((sc) => sc.beats.flatMap((b) => [b.asset, ...(b.screen ?? []).map((a) => BRINGS.has(a.do) ? a.params?.to : null)]));
  const folders = [...new Set(assets.filter((a) => a?.endsWith('/')))];
  const metas = new Map(await Promise.all(folders.map(async (a) => [a, await metaOf(a).catch(() => null)])));
  addImplicitPlays(story, (a) => metas.get(a) ?? null);
  const { fail, warn } = screenIssues(story, (a) => metas.get(a) ?? null, style);
  return [...fail, ...warn];
}
async function fetchMeta(asset) {
  const r = await fetch(new URL(`${asset}media.json`, location.href));   // kind: sequence or page
  if (r.ok) return r.json();
  throw new Error(`asset ${asset} holds no media.json (mm media prep, mm capture site)`);
}

async function mountScreen({ sc, b, slot }, warnings) {
  const screenEl = slot.hasAttribute('data-screen') ? slot : slot.querySelector('[data-screen]');
  const where = selectorOf(sc.id, b.slot);
  if (!screenEl) { warnings.push(`screen: ${where}: screen actions or a folder asset on a slot with no [data-screen]; nothing is drawn`); return null; }
  try {
    const initial = initialState(b.asset ?? null, await metaOf(b.asset));
    const swaps = new Map();
    for (const a of b.screen ?? []) if (BRINGS.has(a.do) && a.params?.to) swaps.set(a.params.to, await metaOf(a.params.to));
    const actions = b.screen ?? [];
    const layer = mountLayer(screenEl, initial, swaps, actions);
    // pictures that do not change with t are decoded before the first seek, like any asset
    await Promise.all([...layer.querySelectorAll('img[src]')].map((img) => img.decode().catch(() => warnings.push(`${where}: ${img.getAttribute('src')} did not load`))));
    // the island's rest size (screen/island grows from it), in fractions of the screen
    const isl = screenEl.querySelector('[data-island]') ?? screenEl.closest('[data-device]')?.querySelector('[data-island]');
    const islandRest = isl && isl.offsetWidth && screenEl.clientWidth ? { w: isl.offsetWidth / screenEl.clientWidth, h: isl.offsetHeight / screenEl.clientHeight } : null;
    return { scene: sc.id, slot: b.slot, screenEl, layer, initial, swaps, actions, islandRest };
  } catch (e) { warnings.push(`${where}: ${e.message}`); return null; }
}

const durSec = (d) => (typeof d === 'number' ? d : (S.style.motion.durations[d] ?? S.style.motion.durations.standard) / 1000);

function runScreens() {
  if (!S.screens?.length) return;
  const deck = S.story.kind === 'deck';
  for (const s of S.screens) {
    const it = s.item;
    if (!it || !S.state.get(it)?.visible) continue;
    const screenEl = s.layer.parentElement;   // the restore above may have rebuilt the device markup
    const box = { w: screenEl.clientWidth, h: screenEl.clientHeight };
    if (!box.w || !box.h) continue;
    const timed = s.actions.map((action, i) => {
      const module = S.modules[action.do];
      if (!module?.reduce) return null;
      if (deck) { const press = it.screenPresses?.[i] ?? it.press + (action.step ?? 0); return { action, module, i, start: press - 1, d: 1, sec: S.sched.pressLengths[press] ?? 1 }; }
      const d = action.d ?? durSec(module.dur);
      return { action, module, i, start: it.start + (action.at ?? 0), d, sec: d };
    }).filter(Boolean).sort((p, q) => p.start - q.start || p.i - q.i);
    const initial = s.initial;
    const metaOf = (asset) => s.swaps.get(asset) ?? null;   // swap targets, read at mount
    const ctxOf = (e) => ctxFor(`${it.selector} .mm-screen-fx[data-i="${e.i}"]`, { params: paramsOf(e.module, e.action.params), d: e.sec, box,
      locate: (state, target) => locate(state, target, box), metaOf, kindOf: (asset) => initialState(asset, metaOf(asset)).content.kind, deck, islandRest: s.islandRest });
    const { state, active } = fold(initial, timed, S.t, ctxOf);
    paint(s.layer, state, { track: trackDecode, box, swaps: s.swaps, warn: decodeWarning });
    // a deck rest shows the finished drawing of an action that holds (screen/callout): at the
    // rest its press ends on, p = 1; after the next press it is gone
    if (deck) for (const e of timed) if (e.module.holds && Math.abs(S.t - (e.start + e.d)) < 1e-9) active.push({ ...e, p: 1 });
    // state that outlives its action (an open island) is drawn on every seek by the module's paint()
    const painted = new Set();
    for (const e of timed) if (typeof e.module.paint === 'function' && !painted.has(e.module)) { painted.add(e.module); e.module.paint(screenEl, state, ctxOf(e)); }
    for (const e of active) {
      if (typeof e.module.draw !== 'function') continue;
      const extra = { state, at: (target) => locate(state, target, box) };
      let fx;
      if (e.module.outside) {
        // drawn beside the screen (screen/callout): a fresh overlay in the device's slot, removed by
        // the next seek's restore(); coordinates are px in that overlay, read from live boxes
        fx = document.createElement('div');
        fx.className = 'mm-screen-out';
        fx.setAttribute('data-mm-overlay', '');
        fx.dataset.do = e.action.do;
        it.el.append(fx);
        const o = fx.getBoundingClientRect(), r = screenEl.getBoundingClientRect();
        extra.host = () => ({ w: o.width, h: o.height, screen: { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height } });
        extra.toHost = ({ x, y }) => ({ x: r.left - o.left + x * r.width, y: r.top - o.top + y * r.height });
      } else {
        fx = s.layer.querySelector(`:scope > .mm-screen-fx[data-i="${e.i}"]`);
        fx.style.cssText = '';
      }
      e.module.draw(fx, e.p, { ...ctxOf(e), ...extra });
    }
  }
}

function seekFilm(t) {
  const emphases = [];
  t = Math.min(S.sched.duration, Math.max(0, Number(t) || 0));
  S.t = t; S.cur = t;
  const sc = S.sched.scenes;
  const vis = sc.map((s, i) => t >= s.start && (i === sc.length - 1 || t < sc[i + 1].start + sc[i + 1].cut.d));
  S.vis = vis;
  sc.forEach((s, i) => { if (!vis[i]) S.scenes[i].el.style.visibility = 'hidden'; });
  applySpeaker(S, t);   // the footage stands where speaker.js puts it at t, before any move reads its box
  for (let i = 1; i < sc.length; i++) {
    const d = sc[i].cut.d;
    if (d > 0 && vis[i] && vis[i - 1]) runTransition(i, t - sc[i].start, d);
  }
  const later = [];
  sc.forEach((s, i) => {
    if (!vis[i]) return;
    const d = s.end - s.start;
    // ctx.settle: seconds from the scene's start to its rest (its whole length when it has none)
    const hold = S.sched.holds.find((h) => h.scene === s.id);
    const extra = { u: t - s.start, d, settle: hold ? hold.from - s.start : d };
    // a move that sets its slots' own styles (moves/morph) runs after the entrances, which would overwrite them
    if (S.modules[S.story.scenes[i].move]?.afterItems) later.push(() => runMove(i, (t - s.start) / d, extra));
    else runMove(i, (t - s.start) / d, extra);
  });
  for (const it of S.items) {
    if (it.parent) {   // a cascade child: drawn only while its parent is on screen
      const P = it.parent;
      const T = returnTime(P, t);
      if (!vis[it.si] || T < P.start || (P.exit && t >= P.exit.start + P.exit.d - TOL)) continue;
      const u = T - it.start;
      if (u < 0) hide(it.el); else { const h = held(u, it.d, (x) => returnTime(P, x) - it.start); runFx(it, entrance(it, h), h); }
      continue;
    }
    const u = returnTime(it, t) - it.start;
    const gone = it.exit && t >= it.exit.start + it.exit.d - TOL;
    const hu = held(u, it.d, (x) => returnTime(it, x) - it.start);   // progress and overshoot describe the step that is drawn
    const progress = progressOf(it, hu);
    S.state.set(it, { progress, overshoot: hu > 0 ? overshootOf(it, hu) : 0, visible: vis[it.si] && u >= 0 && !gone });
    if (!vis[it.si]) continue;
    if (u < 0 || gone) { hide(it.el); continue; }
    if (it.each) it.el.style.visibility = ''; else runFx(it, entrance(it, hu), hu);
    if (it.emphasis && t >= it.emphasis.start && t < it.emphasis.start + it.emphasis.d - TOL && !(it.ret && t >= it.ret.start)) emphases.push([it, held(t - it.emphasis.start, it.emphasis.d, (x) => x - it.emphasis.start) / it.emphasis.d]);
    if (it.exit && t >= it.exit.start) runExit(it, it.exit.d > 0 ? ease('exit', held(t - it.exit.start, it.exit.d, (x) => x - it.exit.start) / it.exit.d, S.style) : 1);
  }
  for (const [it, q] of emphases) runEmphasis(it, q);   // after every entrance and exit: an emphasis may touch its siblings (emphasis/lens)
  for (const run of later) run();
}

// During a loop's automatic return the entrance runs backwards: the time inside
// the entrance is mirrored, so p goes from 1 to 0 along the same curve; once back, the beat is drawn
// as it is at t = 0 (hidden, or p = 0 if it arrives at 0), so the last frame is the first.
function returnTime(it, t) {
  const r = it.ret;
  if (!r || t < r.start) return t;
  const s = r.d > 0 ? (t - r.start) / r.d : 1;
  return s >= 1 - 1e-9 ? 0 : it.start + it.d * (1 - s);
}

function seekDeck(x) {
  const emphases = [];
  const sched = S.sched;
  x = Math.min(sched.presses, Math.max(0, Number(x) || 0));
  S.t = x; S.cur = x;
  const n = Math.ceil(x);
  const f = n === 0 ? 1 : x - (n - 1);
  const u = f * sched.pressLengths[n];
  const sc = sched.scenes;
  const a = n === 0 ? 0 : sc.findIndex((s) => n > s.start && n <= s.end);
  const vis = sc.map(() => false);
  vis[a] = true;
  const cutting = a > 0 && n === sc[a].start + 1 && u < sc[a].cut.d;
  if (cutting) vis[a - 1] = true;
  S.vis = vis;
  sc.forEach((s, i) => { if (!vis[i]) S.scenes[i].el.style.visibility = 'hidden'; });
  if (cutting) runTransition(a, u, sc[a].cut.d);
  // a deck scene's move runs across its presses; p is the press position through the
  // scene, so every rest is a still, finished picture and the move plays only while a press does.
  sc.forEach((s, i) => { if (vis[i]) runMove(i, (x - s.start) / (s.end - s.start), { presses: s.end - s.start }); });
  const pressU = (it) => (it.press < n ? Infinity : it.press === n ? u - it.at : -1);
  const goneAt = (it) => { const X = it.exit ? it.exit.press : Infinity; return X < n || (X === n && (it.exit.d === 0 || u >= it.exit.d - TOL)); };
  for (const it of S.items) {
    if (it.parent) {
      if (!vis[it.si] || pressU(it.parent) < 0 || goneAt(it.parent)) continue;
      const ub = pressU(it);
      if (ub < 0) hide(it.el); else runFx(it, entrance(it, ub), ub);
      continue;
    }
    const ub = pressU(it);
    const X = it.exit ? it.exit.press : Infinity;
    const gone = goneAt(it);
    const progress = progressOf(it, ub);
    S.state.set(it, { progress, overshoot: ub > 0 ? overshootOf(it, ub) : 0, visible: vis[it.si] && ub >= 0 && !gone });
    if (!vis[it.si]) continue;
    if (ub < 0 || gone) { hide(it.el); continue; }
    if (it.each) it.el.style.visibility = ''; else runFx(it, entrance(it, ub), ub);
    if (it.emphasis && it.press === n && u >= it.emphasis.at && u < it.emphasis.at + it.emphasis.d - TOL) emphases.push([it, (u - it.emphasis.at) / it.emphasis.d]);
    if (X === n) runExit(it, ease('exit', clamp01(u / it.exit.d), S.style));
  }
  for (const [it, q] of emphases) runEmphasis(it, q);   // after every entrance and exit, as in a film
}

// ---------------------------------------------------------------------------------------------
// deck navigation (SPEC §10): presses are input, not time; the hash carries the press.

function hashPress() {
  const m = /^#(\d+)$/.exec(location.hash);
  return m ? Number(m[1]) : null;
}

function land(n) {
  seek(n);
  if (S.story.kind === 'deck') history.replaceState(null, '', `${location.pathname}${location.search}#${S.cur}`);
}

export function goto(n) {
  if (S.story?.kind !== 'deck') return seek(n);
  land(Math.min(S.sched.presses, Math.max(0, Math.round(Number(n) || 0))));
}

// Next: a mid-press snaps to the end of that press; the final press does nothing. A live host
// (mm serve) may animate the press itself by cancelling the `mm:press` event and driving seek.
export function next() {
  const x = S.cur;
  if (!Number.isInteger(x)) return land(Math.ceil(x));
  if (x >= S.sched.presses) return;
  const ev = new CustomEvent('mm:press', { cancelable: true, detail: { from: x, to: x + 1 } });
  if (window.dispatchEvent(ev)) land(x + 1);
}

// Previous: always a rest, never a mid-entrance.
export function prev() {
  const x = S.cur;
  land(Number.isInteger(x) ? Math.max(0, x - 1) : Math.floor(x));
}

const NEXT = new Set([' ', 'Spacebar', 'ArrowRight', 'PageDown', 'Enter']);
const PREV = new Set(['ArrowLeft', 'PageUp', 'Backspace']);

function onKey(e) {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (NEXT.has(e.key)) { e.preventDefault(); next(); } else if (PREV.has(e.key)) { e.preventDefault(); prev(); }
}

// A plain click on the slide is a press forward, as on a clicker. Controls keep their own clicks, and a
// deck inside a frame (the studio's stage) leaves clicks to the page around it.
const CONTROLS = 'a, button, input, select, textarea, label, summary, [contenteditable]';
function onClick(e) {
  if (e.button !== 0 || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (window.top !== window || e.target?.closest?.(CONTROLS)) return;
  next();
}

// ---------------------------------------------------------------------------------------------
// report

// Fully transparent in any serialisation: transparent, rgba(r, g, b, 0), or color(space r g b / 0)
// (what a color-mix() colour computes to).
const clear = (bg) => !bg || bg === 'transparent' || /(?:,|\/)\s*0(?:\.0+)?\s*\)$/.test(bg);
function effectiveBg(el) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    if (!clear(bg)) return bg;
  }
  return getComputedStyle(document.body).backgroundColor;
}

function measure(el, selector, st) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return {
    selector, progress: st.progress,
    box: { x: r.x, y: r.y, w: r.width, h: r.height },
    fontPx: parseFloat(cs.fontSize), color: cs.color, bg: effectiveBg(el),
    overshoot: st.overshoot, scene: st.scene, visible: st.visible,
  };
}

export function report() {
  const elements = S.items.filter((it) => !it.parent).map((it) => measure(it.el, it.selector, { ...S.state.get(it), scene: it.scene }));
  for (const k of S.keeps) {
    if (S.items.some((it) => it.el === k.el)) continue;
    elements.push(measure(k.el, k.selector, { progress: 1, overshoot: 0, visible: !!S.vis[k.si], scene: S.story.scenes[k.si].id }));
  }
  return { t: S.t, format: S.format, elements };
}

export function scene(id) { return S.scenes?.find((s) => s.id === id)?.el ?? null; }
export function format() { return S.format; }
