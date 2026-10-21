// scripts/studio/ops.js: typed edit ops on a raw story. An op
// validates against the story and its pattern's params, then compiles to a JSON patch plus the
// inverse ops that undo it, so undo is an ordinary edit. Scenes are addressed by id, beats by index
// (in the variant's beats when the op's format names a variant that has beats); `story.formats` sets
// the formats the piece ships (removing one leaves the scenes' variants for it in place). Generated stories
// and decks refuse every edit. A caller that injects `ctx.validate` (the story schema) gets every
// edit refused that would leave an invalid story; a caller applying an inverse passes
// `ctx.inverse`, so the exact old values go back unrounded and unchecked against today's patterns.
// Pure: no node: module, no package; runs in Node and the browser.
import { applyPatchText, applyPatchValue, parseRanges, badJSON, rawAt, sameJSON } from './json-splice.js';

/** A time as a story stores it: to 0.01 s, never float noise or -0. */
export const roundTime = (t) => Math.round(t * 100) / 100 + 0;

export class EditRefused extends Error {
  constructor({ code, reason, hint }, index) {
    super(`${code}: ${reason}`);
    this.name = 'EditRefused';
    Object.assign(this, { code, reason, hint, index });
  }
}

// each op's members besides op and scene: exactly the edit-ops contract's. `raw` (on ops that write
// a value) is that value's JSON text; inverses carry it so that undo restores the original bytes.
const MEMBERS = {
  'scene.duration': ['value', 'raw'],
  'scene.order': ['index'],
  'scene.cut': ['pattern', 'params', 'before', 'raw'],
  'scene.move': ['pattern', 'params', 'format', 'before', 'raw'],
  'scene.say': ['value', 'format', 'raw'],
  'beat.at': ['beat', 'value', 'format', 'raw'],
  'beat.out': ['beat', 'value', 'format', 'before', 'raw'],
  'beat.set': ['beat', 'key', 'value', 'format', 'before', 'raw'],
  'beat.param': ['beat', 'key', 'value', 'format', 'before', 'raw'],
  'beat.add': ['beat', 'index', 'format', 'raw'],
  'beat.remove': ['beat', 'format'],
  'story.formats': ['value', 'raw'],
};
// ops on the story itself, addressed to no scene
const STORY_OPS = ['story.formats'];
const OPS = Object.keys(MEMBERS);
const FORMATS = ['9x16', '1x1', '4x5', '16x9'];
const CUES = ['tick', 'press', 'swipe', 'step', 'hit', 'riser', 'success', 'complete', 'bed'];
// a beat's keys: the type and the shape each takes (the story schema's, restated without Ajv so the
// module stays browser-safe; ctx.validate is the backstop). beat.set and beat.add both check by it.
const KEY = {
  text: ['string', (v) => v.length <= 400, 'at most 400 characters'],
  fx: ['string', (v) => /^((entrances|text|data|devices|3d)\/[a-z][a-z0-9-]*|style:(headline|body|figure|plate))$/.test(v), 'an entrance pattern (entrances/, text/, data/, devices/, 3d/) or style:headline|body|figure|plate'],
  cue: ['string', (v) => CUES.includes(v), `one of ${CUES.join('|')}`],
  emphasis: ['string', (v) => /^emphasis\/[a-z][a-z0-9-]*$/.test(v), 'an emphasis/<name> pattern'],
  exit: ['string', (v) => /^exits\/[a-z][a-z0-9-]*$/.test(v), 'an exits/<name> pattern'],
  slot: ['string', (v) => /^[a-z][a-z0-9-]{0,30}$/.test(v), 'a lower-case slot name of the layout'],
  fact: ['string', (v) => /^f[0-9]{1,3}$/.test(v), 'a fact id like f1'],
  value: ['number', () => true, 'a number'],
  asset: ['string', (v) => /^(?!https?:)assets\/[^\s]+$/.test(v), 'a path under assets/'],
  step: ['integer', (v) => v >= 0 && v <= 12, 'a press from 0 to 12'],
  until: ['integer', (v) => v >= 2 && v <= 13, 'a press from 2 to 13'],
};
const SET_KEYS = ['text', 'fx', 'cue', 'emphasis', 'slot', 'fact', 'value', 'asset'];
// params the kit itself reads from a beat, whatever its pattern (runtime/kit/schedule.js, kit.js)
const KIT_PARAMS = ['instant', 'dur', 'spring', 'each', 'sep', 'stagger', 'exit', 'emphasis', 'frame', 'move'];
const BEAT_KEYS = ['at', 'step', 'until', 'out', 'exit', 'slot', 'fx', 'text', 'fact', 'value', 'asset', 'screen', 'params', 'cue', 'emphasis'];
const PARAM_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,40}$/;

const no = (code, reason, hint) => ({ code, reason, hint });
const esc = (k) => String(k).replace(/~/g, '~0').replace(/\//g, '~1');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isParam = (v) => typeof v === 'string' || isNum(v) || typeof v === 'boolean';
const isBag = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fxRef = (fx, style) => (typeof fx === 'string' && fx.startsWith('style:') ? style?.entrances?.[fx.slice(6)] : fx);
const parsed = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
/** Whether `raw` is JSON text of the one value `patch` writes (an empty patch writes nothing). */
const fits = (patch, raw) => !patch.length || (patch.length === 1 && (patch[0].op === 'add' || patch[0].op === 'replace') && sameJSON(parsed(raw), patch[0].value));
const twice = (story, id, i) => story.scenes.some((s, k) => k !== i && s.id === id);
const ambiguous = (id) => no('ambiguous-scene', `two scenes are called "${id}"`, `rename one of them in story.json so that each scene id is unique; an edit cannot say which "${id}" it means`);
const sayError = (e) => (typeof e === 'string' ? e : `${e.instancePath || e.path || '/'} ${e.message ?? ''}`.trim());

/** The object that holds a scene's `key` in `format`: the variant when it defines the key, else the scene.
 *  The one variant-routing rule: every op and beatPath go through it. */
function holder(sc, i, key, format) {
  const v = format && Object.hasOwn(sc.variants ?? {}, format) ? sc.variants[format] : null;
  return isBag(v) && Object.hasOwn(v, key) ? [v, `/scenes/${i}/variants/${esc(format)}`] : [sc, `/scenes/${i}`];
}
const beatsOf = (sc, i, format) => holder(sc, i, 'beats', format);

/** The JSON pointer of a beat as the given format draws it; throws EditRefused when two scenes share the id. */
export function beatPath(story, scene, beat, format) {
  const i = story.scenes.findIndex((s) => s.id === scene);
  if (i < 0) return null;
  if (twice(story, scene, i)) throw new EditRefused(ambiguous(scene));
  return `${beatsOf(story.scenes[i], i, format)[1]}/beats/${beat}`;
}

/** Checks a param bag (or one param) against a pattern's params schema; null when it passes. */
function checkParam(ref, meta, key, value) {
  if (!meta) return null;
  const spec = meta.params && Object.hasOwn(meta.params, key) ? meta.params[key] : null;
  if (!spec) return no('unknown-param', `${ref} has no param "${key}"`, `${ref} takes: ${Object.keys(meta.params ?? {}).join(', ') || 'no params'}; the kit also reads ${KIT_PARAMS.join(', ')}`);
  const t = String(spec.type ?? '');
  const choices = /^enum\((.*)\)$/.exec(t)?.[1]?.split('|') ?? (t === 'enum' && Array.isArray(spec.values) ? spec.values : null);
  if (choices) return choices.includes(String(value)) ? null : no('bad-value', `${ref} ${key} cannot be ${JSON.stringify(value)}`, `${key} is one of: ${choices.join('|')}`);
  if ((t === 'number' && !isNum(value)) || (t === 'boolean' && typeof value !== 'boolean') || (t === 'string' && typeof value !== 'string')) {
    return no('bad-type', `${ref} ${key} takes a ${t}, not ${JSON.stringify(value)}`, `give ${key} a ${t} (default ${JSON.stringify(spec.default)})`);
  }
  return null;
}
function checkBag(ref, ctx, bag, what) {
  if (!isBag(bag)) return no('bad-type', `${what} must be an object of params`, 'give an object like { "key": value }, or null to remove it');
  for (const [k, v] of Object.entries(bag)) {
    if (!isParam(v)) return no('bad-type', `${what}.${k} must be a string, number or boolean`, 'params take plain values');
    const r = ctx.patterns ? checkParam(ref, ctx.patterns[ref], k, v) : null;
    if (r) return r;
  }
  return null;
}
function checkRef(v, group, ctx) {
  if (typeof v !== 'string') return no('bad-type', `the pattern must be a string or null`, `give a ${group}/<name> pattern`);
  if (!new RegExp(`^${group}/[a-z][a-z0-9-]*$`).test(v)) return no('bad-value', `"${v}" is not a ${group} pattern`, `use a ${group}/<name> pattern`);
  if (ctx.patterns && !ctx.patterns[v]) return no('bad-value', `no pattern ${v}`, `known: ${Object.keys(ctx.patterns).filter((r) => r.startsWith(`${group}/`)).join(', ')}`);
  return null;
}
/** Checks beat key `k` (a KEY) set to `v`, not null. */
function checkKey(story, ctx, k, v) {
  const [type, ok, shape] = KEY[k], a = type === 'integer' ? 'an' : 'a';
  if (type === 'integer' ? !Number.isInteger(v) : typeof v !== type || (type === 'number' && !isNum(v))) return no('bad-type', `${k} must be ${a} ${type}`, `give ${k} ${a} ${type}: ${shape}`);
  if (!ok(v)) return no('bad-value', `${k} cannot be ${JSON.stringify(v)}`, `${k} is ${shape}`);
  if (k === 'fact' && !(story.facts ?? []).some((f) => f.id === v)) return no('bad-value', `no fact ${v}`, story.facts?.length ? `the story's facts are: ${story.facts.map((f) => f.id).join(', ')}` : 'the story has no facts; add the fact to facts first');
  if (ctx.patterns && (k === 'fx' || k === 'emphasis' || k === 'exit') && !v.startsWith('style:') && !ctx.patterns[v]) return no('bad-value', `no pattern ${v}`, 'pick an installed pattern');
  return null;
}
/** Checks param `k` set to `v` (not null) on beat `b`. */
function checkBeatParam(b, k, v, ctx) {
  if (!PARAM_KEY.test(k)) return no('bad-type', `params.${k} is not a param name`, 'a param name is a letter then letters, digits, _ or -');
  if (k === 'exit' || k === 'emphasis') return checkBag(b[k], ctx, v, `params.${k}`);
  if (!isParam(v)) return no('bad-type', `params.${k} must be a string, number or boolean`, 'params take plain values');
  if (k === 'instant') return typeof v === 'boolean' ? null : no('bad-type', 'instant takes a boolean', 'give true or false');
  if (!ctx.patterns || KIT_PARAMS.includes(k)) return null;
  const ref = fxRef(b.fx, ctx.style);
  return checkParam(ref, ref && ctx.patterns[ref], k, v);
}

/** story.formats: a non-empty list of distinct film formats. Removing a format leaves the scenes'
 *  `variants[<format>]` in place (the story schema allows a variant for a format the piece does not
 *  ship): they come back as they were when the format is added again. */
function checkFormats({ value: v, raw }) {
  if (raw !== undefined && typeof raw !== 'string') return no('bad-type', 'raw must be a string of JSON text', 'leave raw out: inverses carry it so that undo restores the original bytes');
  if (!Array.isArray(v)) return no('bad-type', 'formats must be a list of formats', `give a list like ["9x16", "16x9"]: formats are ${FORMATS.join(', ')}`);
  if (!v.length) return no('bad-value', 'a piece ships no formats', 'keep at least one format');
  const unknown = v.find((f) => !FORMATS.includes(f));
  if (unknown !== undefined) return no('bad-value', `${JSON.stringify(unknown)} is not a film format`, `formats are ${FORMATS.join(', ')}`);
  const twiceF = v.find((f, k) => v.indexOf(f) !== k);
  if (twiceF !== undefined) return no('bad-value', `${twiceF} is listed twice`, 'list each format once');
  return null;
}

/** Why `edit` cannot apply to `story` (raw), or null when it can (exactly when compile succeeds). */
export function validateEdit(story, edit, ctx = {}) {
  const r = check(story, edit, ctx.inverse ? { ...ctx, patterns: null } : ctx);
  if (r || (edit.raw === undefined && !ctx.validate)) return r;
  const { patch } = build(story, edit, ctx);
  if (edit.raw !== undefined && !fits(patch, edit.raw)) return no('bad-value', `raw ${JSON.stringify(edit.raw).slice(0, 60)} is not the JSON text of the value this edit writes`, 'leave raw out: inverses carry it so that undo restores the original bytes');
  if (ctx.validate && patch.length) {
    const errors = ctx.validate(applyPatchValue(story, patch));
    if (errors?.length) return no('schema', `the story would not match its schema: ${sayError(errors[0])}`, 'change the edit so that the story stays valid (contracts/story.schema.json)');
  }
  return null;
}

function check(story, edit, ctx) {
  if (!isBag(edit) || !OPS.includes(edit.op)) return no('bad-value', `unknown op ${JSON.stringify(edit?.op)}`, `ops are: ${OPS.join(', ')}`);
  const takes = [...(STORY_OPS.includes(edit.op) ? [] : ['scene']), ...MEMBERS[edit.op]], extra = Object.keys(edit).find((k) => k !== 'op' && !takes.includes(k));
  if (extra) return no('bad-value', `${edit.op} has no "${extra}"`, `remove "${extra}": ${edit.op} takes ${takes.join(', ')}`);
  const bad = badJSON(edit);
  if (bad !== null) return no('bad-value', `${bad.slice(1)} is not a JSON value`, 'give plain JSON values (no undefined, NaN, Infinity or functions); leave an optional member out rather than set it to undefined');
  if (story.generator && !ctx.allowGenerated) return no('generated', `this story is written by ${story.generator}`, `edit the input of ${story.generator} and re-run it (node ${story.generator}); edits here would be overwritten`);
  if (story.kind === 'deck') return no('deck', 'decks are read-only in the studio', 'edit the deck\'s story.json by hand; the studio edits films and loops');
  if (edit.op === 'story.formats') return checkFormats(edit);
  if (typeof edit.scene !== 'string') return no('bad-type', 'scene must be a scene id', `scenes: ${story.scenes.map((s) => s.id).join(', ')}`);
  const i = story.scenes.findIndex((s) => s.id === edit.scene);
  if (i < 0) return no('unknown-scene', `no scene "${edit.scene}"`, `scenes: ${story.scenes.map((s) => s.id).join(', ')}`);
  if (twice(story, edit.scene, i)) return ambiguous(edit.scene);
  // any film format may be previewed in the studio: a known one the story does not ship edits
  // the base story, or that format's variant when the scene has one; only an unknown format is refused
  if (edit.format !== undefined && !FORMATS.includes(edit.format)) return no('bad-value', `there is no format ${JSON.stringify(edit.format)}`, `the formats are ${FORMATS.join(', ')}`);
  if (edit.raw !== undefined && typeof edit.raw !== 'string') return no('bad-type', 'raw must be a string of JSON text', 'leave raw out: inverses carry it so that undo restores the original bytes');
  const sc = story.scenes[i], dur = sc.duration, v = edit.value;
  // an inverse writes back the exact value the story held; only a forward edit is rounded
  const rt = (x) => (ctx.inverse ? x : roundTime(x));
  const time = (x, what) => (!isNum(x) ? no('bad-type', `${what} must be a number of seconds`, 'give a number, like 1.25')
    : x < 0 || x > 60 ? no('out-of-range', `${what} ${x} is outside the scene`, `${what} runs 0 to 60 s, and within the scene`) : null);
  const noDur = no('out-of-range', `${sc.id} has no duration`, 'this scene has no duration: add one to it in story.json by hand (every film and loop scene needs one)');
  const outOf = (x, at) => {
    const e = time(x, 'out'); if (e) return e;
    const t = rt(x);
    if (t <= at) return no('out-of-range', `out ${x} is not after the beat's at`, `out must be after ${at} s (the beat's at)`);
    if (t > dur) return no('out-of-range', `out ${x} is past the scene's end`, `out must be at most ${dur} s (the scene's duration)`);
    return null;
  };

  switch (edit.op) {
    case 'scene.duration': {
      if (!isNum(dur)) return noDur;
      if (!isNum(v)) return no('bad-type', 'duration must be a number of seconds', 'give a number, like 1.25');
      if (!(v >= 0.01 && v <= 60)) return no('out-of-range', `a scene lasts 0.01 to 60 s, not ${v}`, 'give a duration from 0.01 to 60 s');
      const d = rt(v);
      const all = [['', sc.beats], ...Object.entries(sc.variants ?? {}).filter(([, x]) => Array.isArray(x.beats)).map(([f, x]) => [` (${f})`, x.beats])];
      const flat = all.flatMap(([f, beats]) => beats.map((b, j) => ({ b, where: `beat ${j}${f}` })));
      const late = flat.filter(({ b }) => b.at >= d), lastAt = Math.max(...flat.map(({ b }) => b.at));
      if (late.length) return no('out-of-range', `${late[0].where} of ${sc.id} arrives at ${late[0].b.at} s`, `make the scene longer than ${lastAt} s (its last arrival), or move those beats earlier first`);
      const left = flat.filter(({ b }) => b.out != null && b.out > d), lastOut = Math.max(...flat.map(({ b }) => b.out ?? 0));
      if (left.length) return no('out-of-range', `${left[0].where} of ${sc.id} leaves at ${left[0].b.out} s`, `make the scene at least ${lastOut} s (its last out), or move those outs earlier first`);
      return null;
    }
    case 'scene.order':
      if (!Number.isInteger(edit.index)) return no('bad-type', 'index must be an integer', `index runs 0 to ${story.scenes.length - 1}`);
      if (edit.index < 0 || edit.index >= story.scenes.length) return no('out-of-range', `no position ${edit.index}`, `index runs 0 to ${story.scenes.length - 1}`);
      return null;
    case 'scene.cut':
    case 'scene.move': {
      const cut = edit.op === 'scene.cut', group = cut ? 'transitions' : 'moves';
      if (edit.pattern === undefined) return no('bad-type', 'pattern is required (null for none)', `give a ${group}/<name> pattern${cut ? ', or null when the scene has a position' : ' or null'}`);
      if (edit.pattern !== null) { const e = checkRef(edit.pattern, group, ctx); if (e) return e; }
      else if (cut && !sc.position) return no('bad-value', `${sc.id} would have neither a cut nor a position`, 'a scene arrives by its cut or its position; give it a position first, or pick another cut');
      if (edit.params != null) {
        // with no cut the scene arrives by its position, which each style resolves differently, and
        // with no move the params wait: neither can be checked against one pattern
        return checkBag(edit.pattern, edit.pattern ? ctx : {}, edit.params, cut ? 'cutParams' : 'moveParams');
      }
      return null;
    }
    case 'scene.say':
      if (typeof v !== 'string') return no('bad-type', 'say must be a string', 'give the narration as text');
      return v.length <= 1200 ? null : no('bad-value', 'say is at most 1200 characters', 'shorten the narration');
  }

  // beat ops
  const [h] = beatsOf(sc, i, edit.format), beats = h.beats, n = beats.length;
  const where = `${sc.id} has ${n} beats here: use 0 to ${n - 1}`;
  if (edit.op === 'beat.add') {
    const b = edit.beat;
    if (!isBag(b)) return no('bad-type', 'beat must be a beat object', 'give { "at": …, "slot": …, "fx": … }');
    const extraKey = Object.keys(b).find((k) => !BEAT_KEYS.includes(k));
    if (extraKey) return no('bad-value', `a beat has no "${extraKey}"`, `beat keys: ${BEAT_KEYS.join(', ')}`);
    if (n >= 24) return no('bad-value', `${sc.id} already has 24 beats`, 'a scene holds at most 24 beats; split the scene');
    if (edit.index !== undefined && (!Number.isInteger(edit.index) || edit.index < 0 || edit.index > n)) return no('out-of-range', `no position ${edit.index}`, `index runs 0 to ${n}`);
    if (!isNum(dur)) return noDur;
    const e = time(b.at, 'at'); if (e) return e;
    if (rt(b.at) >= dur) return no('out-of-range', `at ${b.at} is outside the scene`, `at must be from 0 to below ${dur} s (the scene's duration)`);
    for (const k of ['slot', 'fx']) if (b[k] === undefined) return no('bad-value', `the beat needs a ${k}`, KEY[k][2]);
    for (const [k, x] of Object.entries(b)) {
      const r = k === 'out' ? outOf(x, rt(b.at)) : Object.hasOwn(KEY, k) ? checkKey(story, ctx, k, x) : null;
      if (r) return r;
    }
    if (b.params !== undefined) {
      if (!isBag(b.params)) return no('bad-type', 'params must be an object of params', 'give an object like { "side": "left" }');
      for (const [k, x] of Object.entries(b.params)) { const r = checkBeatParam(b, k, x, ctx); if (r) return r; }
    }
    if (b.screen !== undefined && !(Array.isArray(b.screen) && b.screen.length <= 24)) return no('bad-type', 'screen must be an array of screen actions', 'give an array of at most 24 actions like { "do": "screen/tap" }');
    return null;
  }
  if (!Number.isInteger(edit.beat)) return no('bad-type', 'beat must be an index', where);
  if (edit.beat < 0 || edit.beat >= n) return no('unknown-beat', `no beat ${edit.beat} in ${sc.id}`, where);
  const b = beats[edit.beat];
  switch (edit.op) {
    case 'beat.remove':
      return n > 1 ? null : no('bad-value', `${sc.id} has only this beat`, 'a scene needs at least one beat; add another before removing this one');
    case 'beat.at': {
      const e = time(v, 'at'); if (e) return e;
      if (!isNum(dur)) return noDur;
      const t = rt(v);
      if (t >= dur) return no('out-of-range', `at ${v} is outside the scene`, `at must be from 0 to below ${dur} s (the scene's duration)`);
      if (b.out != null && t >= b.out) return no('out-of-range', `at ${v} is not before the beat's out (${b.out} s)`, `keep at below ${b.out} s, or move out first`);
      return null;
    }
    case 'beat.out':
      if (v === null) return null;
      return isNum(dur) ? outOf(v, b.at) : noDur;
    case 'beat.set':
      if (!SET_KEYS.includes(edit.key)) return no('bad-value', `beat.set cannot set ${JSON.stringify(edit.key)}`, `keys: ${SET_KEYS.join(', ')}; at, out and params have their own ops`);
      if (v === null) return edit.key === 'fx' || edit.key === 'slot' ? no('bad-value', `${edit.key} cannot be removed`, `every beat has a slot and an fx; set another ${edit.key} instead`) : null;
      return checkKey(story, ctx, edit.key, v);
    case 'beat.param':
      if (typeof edit.key !== 'string' || !PARAM_KEY.test(edit.key)) return no('bad-type', 'key must be a param name', 'give the param\'s name, like "side"');
      return v === null ? null : checkBeatParam(b, edit.key, v, ctx);
  }
  return null;
}

/** Patch ops that set `obj[key]` at `ptr` to `v`: undefined removes it, and so does null unless `keepNull`. */
function setMember(ptr, obj, key, v, before, keepNull = false) {
  const p = `${ptr}/${esc(key)}`, has = Object.hasOwn(obj, key);
  if (v === undefined || (v === null && !keepNull)) return has ? [{ op: 'remove', path: p }] : [];
  if (has) return same(obj[key], v) ? [] : [{ op: 'replace', path: p, value: v }];
  return [{ op: 'add', path: p, value: v, ...(before != null ? { before } : {}) }];
}
/** The key after `key` in `obj`, skipping keys this op removes too: where an inverse puts it back. */
const nextKey = (obj, key, gone = []) => { const ks = Object.keys(obj); return ks.slice(ks.indexOf(key) + 1).find((k) => !gone.includes(k)); };
const withBefore = (inv, b) => (b != null ? { ...inv, before: b } : inv);

/** `{ patch, inverse }` for an edit validateEdit accepts. */
function build(story, edit, ctx) {
  if (edit.op === 'story.formats') {
    // a forward edit writes the canonical order; an inverse, the exact old list
    const value = ctx.inverse ? edit.value : FORMATS.filter((f) => edit.value.includes(f));
    return { patch: same(story.formats, value) ? [] : [{ op: 'replace', path: '/formats', value }], inverse: [{ op: 'story.formats', value: story.formats }] };
  }
  const i = story.scenes.findIndex((s) => s.id === edit.scene), sc = story.scenes[i], base = `/scenes/${i}`;
  const fmt = edit.format !== undefined ? { format: edit.format } : {};
  const rt = (x) => (ctx.inverse ? x : roundTime(x));
  const { op, scene } = edit;
  switch (op) {
    case 'scene.duration':
      return { patch: setMember(base, sc, 'duration', rt(edit.value)), inverse: [{ op, scene, value: sc.duration }] };
    case 'scene.order':
      return { patch: edit.index === i ? [] : [{ op: 'move', from: base, path: `/scenes/${edit.index}` }], inverse: [{ op, scene, index: i }] };
    case 'scene.cut':
    case 'scene.move': {
      const [key, pkey] = op === 'scene.cut' ? ['cut', 'cutParams'] : ['move', 'moveParams'];
      const [h, hp] = op === 'scene.cut' ? [sc, base] : holder(sc, i, 'move', edit.format);
      const gone = [];
      if (op === 'scene.cut' && edit.pattern === null && Object.hasOwn(h, key)) gone.push(key);
      if (edit.params === null && Object.hasOwn(h, pkey)) gone.push(pkey);
      const patch = setMember(hp, h, key, edit.pattern, edit.before, op === 'scene.move');   // a scene always has a move, null for none
      if (edit.params !== undefined) patch.push(...setMember(hp, h, pkey, edit.params, edit.before));
      const old = h[key] ?? null, inv = { op, scene, pattern: old, ...(edit.params !== undefined ? { params: h[pkey] ?? null } : {}), ...(op === 'scene.move' ? fmt : {}) };
      const order = Object.keys(h).filter((k) => gone.includes(k)), [b0, b1] = order.map((k) => nextKey(h, k, gone));
      if (order.length < 2 || b0 === b1) return { patch, inverse: [withBefore(inv, b0)] };
      // cut and cutParams sat apart: the first back goes alone, to its own place
      const alone = order[0] === key ? { op, scene, pattern: old } : { op, scene, pattern: null, params: inv.params };
      return { patch, inverse: [withBefore(alone, b0), withBefore(inv, b1)] };
    }
    case 'scene.say': {
      const [h, hp] = holder(sc, i, 'say', edit.format);
      return { patch: setMember(hp, h, 'say', edit.value), inverse: [{ op, scene, value: h.say, ...fmt }] };
    }
  }
  const [h, hp] = beatsOf(sc, i, edit.format), bp = `${hp}/beats`;
  if (op === 'beat.add') {
    const index = edit.index ?? h.beats.length;
    const b = { ...edit.beat, at: rt(edit.beat.at), ...(edit.beat.out != null ? { out: rt(edit.beat.out) } : {}) };
    return { patch: [{ op: 'add', path: `${bp}/${index}`, value: b }], inverse: [{ op: 'beat.remove', scene, beat: index, ...fmt }] };
  }
  const j = edit.beat, b = h.beats[j], p = `${bp}/${j}`, at = { op, scene, beat: j };
  switch (op) {
    case 'beat.remove':
      return { patch: [{ op: 'remove', path: p }], inverse: [{ op: 'beat.add', scene, beat: b, index: j, ...fmt }] };
    case 'beat.at':
      return { patch: setMember(p, b, 'at', rt(edit.value)), inverse: [{ ...at, value: b.at, ...fmt }] };
    case 'beat.out':
    case 'beat.set': {
      const key = op === 'beat.out' ? 'out' : edit.key, v = op === 'beat.out' && edit.value != null ? rt(edit.value) : edit.value;
      const inv = { ...at, ...(op === 'beat.set' ? { key } : {}), value: b[key] ?? null, ...fmt };
      return { patch: setMember(p, b, key, v, edit.before), inverse: [v == null && Object.hasOwn(b, key) ? withBefore(inv, nextKey(b, key)) : inv] };
    }
    default: {   // beat.param. `before` names a key of params when the beat has params, else a key of the
      // beat (where a new params goes)
      const k = edit.key, prm = b.params, inv = { ...at, key: k, value: isBag(prm) && Object.hasOwn(prm, k) ? prm[k] : null, ...fmt };
      if (edit.value === null) {
        if (!prm || !Object.hasOwn(prm, k)) return { patch: [], inverse: [inv] };
        if (Object.keys(prm).length === 1) return { patch: [{ op: 'remove', path: `${p}/params` }], inverse: [withBefore(inv, nextKey(b, 'params'))] };
        return { patch: [{ op: 'remove', path: `${p}/params/${esc(k)}` }], inverse: [withBefore(inv, nextKey(prm, k))] };
      }
      if (!isBag(prm)) return { patch: [{ op: 'add', path: `${p}/params`, value: { [k]: edit.value }, ...(edit.before != null ? { before: edit.before } : {}) }], inverse: [inv] };
      return { patch: setMember(`${p}/params`, prm, k, edit.value, edit.before), inverse: [inv] };
    }
  }
}

/** Compiles one edit to `{ patch, inverse }`; throws EditRefused when validateEdit refuses it. */
export function compile(story, edit, ctx = {}) {
  const r = validateEdit(story, edit, ctx);
  if (r) throw new EditRefused(r);
  const c = build(story, edit, ctx);
  if (edit.raw !== undefined && c.patch.length) c.patch[0] = { ...c.patch[0], raw: edit.raw, rawIndent: '' };
  return c;
}

/** Gives the inverse the bytes its edit overwrote or removed when they spell the value otherwise than
 *  the splice would (`0.50`, `4.0`, a beat over several lines), so that undo restores them. */
function keepBytes(text, after, c, ctx) {
  const [p] = c.patch;
  if (c.patch.length !== 1 || c.inverse.length !== 1 || (p.op !== 'replace' && p.op !== 'remove')) return;
  const raw = rawAt(text, p.path), v = JSON.parse(raw);
  if ((v === null || typeof v !== 'object') && raw === JSON.stringify(v)) return;   // a scalar the splice spells the same
  const inv = { ...c.inverse[0], raw }, back = build(after, inv, { ...ctx, inverse: true }).patch;
  if (back.length === 1 && fits(back, raw)) c.inverse[0] = inv;
}

/** Applies `edits` in order to story `text`; `inverse` undoes the whole batch. Throws EditRefused with the edit's index. */
export function applyEdits(text, edits, ctx = {}) {
  let story;
  try { story = parseRanges(text).value; } catch (e) {
    if (e.duplicate === undefined) throw e;
    throw new EditRefused(no('bad-value', `the story has the key ${JSON.stringify(e.duplicate)} twice (offset ${e.offset})`, 'remove the duplicate key by hand: JSON keeps the last one, so an edit to the first would never land'));
  }
  const patch = [], inverses = [];
  edits.forEach((e, index) => {
    let c;
    try { c = compile(story, e, ctx); } catch (err) { if (err instanceof EditRefused) err.index = index; throw err; }
    const after = applyPatchValue(story, c.patch);
    keepBytes(text, after, c, ctx);
    text = applyPatchText(text, c.patch);
    story = after;
    patch.push(...c.patch);
    inverses.unshift(c.inverse);
  });
  // the text must parse to the story the ops validated, or nothing may be written
  if (!sameJSON(JSON.parse(text), story)) throw new Error('applyEdits: the edited text does not parse to the edited story (a json-splice bug); write nothing');
  return { text, story, patch, inverse: inverses.flat() };
}
