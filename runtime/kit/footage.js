// The footage layer. A film's `footage` names a folder holding a frame sequence (media.json, from
// `mm media prep`) and an edit (edit.json, from `mm footage cut`). The film's clock is the edit's
// output clock: at t, every `<img data-footage>` a layout carries shows the source frame the edit's
// picture clips map t to, so footage runs on across scene cuts and transitions. The picture is
// declared media (the layout marks it `data-media`); nothing here keeps state between seeks. A picture
// that also carries `data-footage-matte` shows only the person: the kit masks it with the matte frame
// of the same source frame (`mm footage matte`, white = person) as a luminance mask, laid with the
// picture's own object-fit and object-position, so the mask follows the picture through any seek,
// scale or crop. The mask is an SVG <mask> beside the picture whose <image> the kit decodes inside
// settle(), so no frame is painted while its mask is still loading. The pure half (outputFrame,
// clipAt, sourceFrame, matteFile, matteAspect, footageCtx) runs in Node for the tests.

const r3 = (x) => Math.round(x * 1000) / 1000;

/** The output frame at film second t, held at the edit's first and last frames. */
export function outputFrame(edit, t) {
  const n = Math.floor(Number(t) * edit.fps + 1e-6);
  return Math.max(0, Math.min(edit.frames - 1, n));
}

/** The index of the picture clip that holds film second t. */
export function clipAt(edit, t) {
  const n = outputFrame(edit, t), pic = edit.picture;
  let i = 0;
  for (let k = 0; k < pic.length; k++) if (pic[k].start <= n) i = k;
  return i;
}

/** The 0-based source frame shown at film second t. */
export function sourceFrame(edit, t) {
  const c = edit.picture[clipAt(edit, t)];
  return c.from + Math.max(0, Math.min(c.length - 1, outputFrame(edit, t) - c.start));
}

/** A sequence frame's file: mm media prep names source frame i as f{i + 1, five digits}.jpg. */
export const frameFile = (base, i) => `${base}f${String(i + 1).padStart(5, '0')}.jpg`;

/** A source frame's matte: mm footage matte writes frame i's mask as matte/f{i + 1, five digits}.png. */
export const matteFile = (base, i) => `${base}matte/f${String(i + 1).padStart(5, '0')}.png`;

/**
 * The SVG preserveAspectRatio that lays a matte over a picture drawn with this object-fit and
 * object-position: cover is slice, contain is meet, fill is none; the position's 0 %, 50 % and 100 %
 * are Min, Mid and Max (any other share is drawn as Mid).
 */
export function matteAspect(fit, position) {
  if (fit !== 'cover' && fit !== 'contain') return 'none';
  const [x, y = x] = String(position).trim().split(/\s+/).map((v) => parseFloat(v));
  const al = (v) => (v === 0 ? 'Min' : v === 100 ? 'Max' : 'Mid');
  return `x${al(x)}Y${al(y)} ${fit === 'cover' ? 'slice' : 'meet'}`;
}

/**
 * What a pattern reads as ctx.footage: film time, the clip now and at any t, the words on the output
 * clock, and the recording's frame size (w, h from media.json) for mapping a point of the recording.
 */
export function footageCtx(f, t) {
  const { edit } = f;
  return { t, fps: edit.fps, duration: edit.duration, clip: clipAt(edit, t), clipAt: (x) => clipAt(edit, x), words: edit.words ?? [], w: f.meta?.w, h: f.meta?.h };
}

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url.pathname.split('/').pop()} is missing (mm media prep, then mm footage cut)`);
  return r.json();
}

/**
 * Reads the story's footage folder and finds the pictures that show it. Returns null (with a
 * `footage: ` warning when something is wrong) or { base, meta, edit, els }.
 */
export async function mountFootage(story, { stage, duration, kind }, warnings) {
  const els = [...stage.querySelectorAll('img[data-footage]')];
  if (!story.footage) {
    if (els.length) warnings.push('footage: a layout shows footage but the story names none (story.footage)');
    return null;
  }
  if (kind === 'deck') { warnings.push('footage: a deck does not play footage; story.footage is ignored'); return null; }
  const base = story.footage.asset;
  let meta, edit;
  try {
    [meta, edit] = await Promise.all([getJson(new URL(`${base}media.json`, location.href)), getJson(new URL(`${base}edit.json`, location.href))]);
  } catch (e) { warnings.push(`footage: ${base}: ${e.message}`); return null; }
  if (meta.kind !== 'sequence' || edit.kind !== 'edit' || edit.fps !== meta.fps || !edit.picture?.length) {
    warnings.push(`footage: ${base}: media.json and edit.json do not describe one cut sequence (re-run mm footage cut)`);
    return null;
  }
  if (duration > edit.duration + 1 / edit.fps) warnings.push(`footage: the film runs ${r3(duration - edit.duration)} s past the edit (${edit.duration} s); its last frame holds`);
  if (!els.length) warnings.push('footage: story.footage is set but no layout shows it (layouts/talking-full)');
  const matted = els.filter((el) => el.hasAttribute('data-footage-matte'));
  const matte = meta.matte?.frames === meta.frames ? meta.matte : null;
  if (matted.length && !matte) warnings.push(`footage: ${base}: a layout cuts the speaker out (data-footage-matte) but the folder holds no matte for every frame; run mm footage matte --name ${base.replace(/\/$/, '').split('/').pop()}. The whole picture shows`);
  for (const el of els) el.decoding = 'sync';
  const masks = new Map();
  if (matte) {
    matted.forEach((el, k) => {
      const cs = getComputedStyle(el), w = el.offsetWidth, h = el.offsetHeight, id = `mm-matte-${k}`;
      // parsed as HTML, so the <svg> lands in the SVG namespace without naming it
      const holder = document.createElement('div');
      holder.innerHTML = `<svg aria-hidden="true" width="0" height="0" style="position: absolute"><mask id="${id}" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}" style="mask-type: luminance"><image x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="${matteAspect(cs.objectFit, cs.objectPosition)}"/></mask></svg>`;
      const svg = holder.firstElementChild;
      el.after(svg);
      el.style.maskImage = `url(#${id})`;
      masks.set(el, svg.querySelector('image'));
    });
  }
  return { base, meta, edit, els, masks };
}

/**
 * Points every visible footage picture at the frame for t; `track` registers the decode for settle().
 * A decode that fails while the picture still asks for that frame is named through `warn`; one that
 * fails because a later seek moved the picture on (scrubbing aborts it) is not a broken frame.
 */
export function paintFootage(f, t, track, warn) {
  const i = Math.min(f.meta.frames - 1, sourceFrame(f.edit, t));
  const src = frameFile(f.base, i);
  for (const el of f.els) {
    if (el.closest('[data-scene]')?.style.visibility === 'hidden') continue;
    if (el.getAttribute('src') !== src) {
      el.setAttribute('src', src);
      track(el.decode().catch(() => { if (el.getAttribute('src') === src) warn?.(src); }));
    }
    const mask = f.masks?.get(el);
    if (mask && mask.getAttribute('href') !== matteFile(f.base, i)) {
      const m = matteFile(f.base, i);
      mask.setAttribute('href', m);
      track(mask.decode().catch(() => { if (mask.getAttribute('href') === m) warn?.(m); }));
    }
  }
}
