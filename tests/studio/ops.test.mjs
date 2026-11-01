// Typed edit ops. Each op validates against the story
// and the pattern's params, compiles to a JSON patch plus inverse ops, and the inverse restores the
// original text byte for byte. Every refusal code has a test and a hint; variant routing is tested
// (review focus 2). Every op and inverse used here validates against contracts/edit-ops.schema.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compile, applyEdits, validateEdit, beatPath, roundTime, EditRefused } from '../../scripts/studio/ops.js';
import { parseRanges } from '../../scripts/studio/json-splice.js';
import { validators } from '../../scripts/lib/validate.mjs';
import { trackedPieces } from '../check/_tracked.mjs';
import { layoutParamsOf } from '../../scripts/lib/story-edit.mjs';

const ROOT = new URL('../../', import.meta.url).pathname;
const text = (p) => readFileSync(join(ROOT, p), 'utf8');
const { editOps, story: storyValid } = validators();
const explain = (v) => (v.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

const patterns = {};
for (const g of readdirSync(join(ROOT, 'patterns'))) {
  if (!existsSync(join(ROOT, 'patterns', g)) || g.includes('.')) continue;
  for (const n of readdirSync(join(ROOT, 'patterns', g))) {
    const f = join(ROOT, 'patterns', g, n, 'pattern.js');
    if (!existsSync(f)) continue;
    const m = (await import(pathToFileURL(f))).default;
    patterns[`${g}/${n}`] = { group: m.group, params: m.params ?? {}, dur: m.dur, spring: m.spring };
  }
}
// a piece's own style resolves its style: roles; the skeleton has none, so it wears a preset
const ctxFor = (dir, extra = {}) => ({ patterns, layoutParams: layoutParamsOf(join(ROOT, 'patterns')), style: JSON.parse(text(existsSync(join(ROOT, dir, 'style.json')) ? `${dir}/style.json` : 'styles/presets/kinetic.json')), ...extra });

const used = [];   // every op and inverse this file applies, checked against the schema at the end
const apply = (t, edits, ctx) => { used.push(...edits); const r = applyEdits(t, edits, ctx); used.push(...r.inverse); return r; };

/** A valid value for a param, different from its default. */
function otherValue(spec) {
  const t = String(spec.type);
  const en = /^enum\((.*)\)$/.exec(t)?.[1]?.split('|') ?? (t === 'enum' ? spec.values : null);
  if (en) return en.find((x) => x !== spec.default) ?? en[0];
  if (t === 'number') return (Number(spec.default) || 0) + 1;
  if (t === 'boolean') return !spec.default;
  return 'x';
}
const fxRef = (b, style) => (b.fx.startsWith('style:') ? style.entrances[b.fx.slice(6)] : b.fx);

/** Edits covering every op on a film story, all valid. */
function editsFor(st, style) {
  const E = [], sc = st.scenes, s1 = sc[Math.min(1, sc.length - 1)], id = s1.id, b0 = s1.beats[0];
  E.push({ op: 'scene.duration', scene: id, value: s1.duration + 0.5 });
  if (sc.length > 1) E.push({ op: 'scene.order', scene: sc[0].id, index: sc.length - 1 });
  E.push({ op: 'scene.cut', scene: id, pattern: 'transitions/push', params: { direction: 'left' } });
  const cp = sc.find((s) => s.cutParams); if (cp) E.push({ op: 'scene.cut', scene: cp.id, pattern: cp.cut ?? 'transitions/push', params: null });
  const pos = sc.find((s) => s.position && !s.cut); if (pos) E.push({ op: 'scene.cut', scene: pos.id, pattern: 'transitions/wipe' });
  E.push({ op: 'scene.move', scene: id, pattern: s1.move === 'moves/pan' ? 'moves/hold' : 'moves/pan' });
  E.push({ op: 'scene.move', scene: id, pattern: 'moves/push-in', params: { target: s1.moveParams?.target === 'camera' ? 'media' : 'camera' } });
  const mv = sc.find((s) => s.move && s.moveParams); if (mv) E.push({ op: 'scene.move', scene: mv.id, pattern: null, params: null });
  E.push({ op: 'scene.say', scene: id, value: 'New narration.' });
  E.push({ op: 'beat.at', scene: id, beat: 0, value: b0.at === 0 ? 0.1 : 0 });
  E.push({ op: 'beat.out', scene: id, beat: 0, value: s1.duration });
  E.push({ op: 'beat.set', scene: id, beat: 0, key: 'text', value: 'Changed text' });
  E.push({ op: 'beat.set', scene: id, beat: 0, key: 'fx', value: 'entrances/fade' });
  for (const s of sc) s.beats.forEach((b, j) => {
    if (b.out != null) E.push({ op: 'beat.out', scene: s.id, beat: j, value: null });
    for (const k of ['cue', 'fact', 'emphasis', 'text']) if (b[k] != null && E.filter((e) => e.key === k && e.value === null).length < 2) E.push({ op: 'beat.set', scene: s.id, beat: j, key: k, value: null });
    for (const k of Object.keys(b.params ?? {})) if (E.filter((e) => e.op === 'beat.param' && e.value === null).length < 4) E.push({ op: 'beat.param', scene: s.id, beat: j, key: k, value: null });
  });
  const meta = patterns[fxRef(b0, style)];
  const [pk, ps] = Object.entries(meta?.params ?? {})[0] ?? [];
  if (pk) E.push({ op: 'beat.param', scene: id, beat: 0, key: pk, value: otherValue(ps) });
  E.push({ op: 'beat.param', scene: id, beat: 0, key: 'instant', value: true });
  E.push({ op: 'beat.add', scene: id, beat: { at: 0.5, slot: 'zz-added', fx: 'entrances/fade', text: 'Added' } });
  E.push({ op: 'beat.add', scene: id, beat: { at: 0, slot: 'zz-first', fx: 'entrances/rise', params: { side: 'left' } }, index: 0 });
  const two = sc.find((s) => s.beats.length > 1); if (two) E.push({ op: 'beat.remove', scene: two.id, beat: 1 }, { op: 'beat.remove', scene: two.id, beat: 0 });
  return E;
}

const STORIES = [
  ['pieces/demo-film', { allowGenerated: true }],
  ['pieces/golden-film-kinetic', {}],
  ['pieces/golden-film-editorial', {}],
  ['runtime/skeletons/film', {}],
  ['fixtures/negatives/_base/variants', {}],
];

test('roundTime rounds to 0.01 s with no float noise', () => {
  assert.equal(roundTime(0.1 + 0.2), 0.3);
  assert.equal(roundTime(1.23456), 1.23);
  assert.equal(roundTime(2.999), 3);
  assert.ok(Object.is(roundTime(-0.001), 0));
});

for (const [dir, extra] of STORIES) {
  test(`every op round-trips byte for byte through its inverse: ${dir}`, () => {
    const t0 = text(`${dir}/story.json`), st = JSON.parse(t0), ctx = ctxFor(dir, extra);
    const edits = editsFor(st, ctx.style);
    const ops = new Set(edits.map((e) => e.op));
    if (dir !== 'runtime/skeletons/film') assert.equal(ops.size, 11, `${dir}: covers ${[...ops].join(' ')}`);
    for (const e of edits) {
      const r = apply(t0, [e], ctx);
      assert.notEqual(r.text, t0, `${JSON.stringify(e)} changed nothing`);
      assert.ok(storyValid(JSON.parse(r.text)), `${JSON.stringify(e)}: ${explain(storyValid)}`);
      assert.deepEqual(r.story, JSON.parse(r.text));
      const back = apply(r.text, r.inverse, { ...ctx, inverse: true });
      assert.equal(back.text, t0, `${dir}: the inverse of ${JSON.stringify(e)} (${JSON.stringify(r.inverse)}) restores the bytes`);
    }
    // the whole list as one batch, undone as one batch
    const all = apply(t0, edits.filter((e) => e.op !== 'beat.remove' && e.op !== 'scene.order' && e.key !== 'fx'), ctx);   // (a new fx would orphan the param edit after it)
    assert.equal(apply(all.text, all.inverse, { ...ctx, inverse: true }).text, t0, `${dir}: batch inverse`);
  });
}

test('a beat.at changes only that scalar, rounded to 0.01 s', () => {
  const t0 = text('pieces/golden-film-kinetic/story.json');
  const r = applyEdits(t0, [{ op: 'beat.at', scene: 'time', beat: 1, value: 1.23456 }], {});
  const node = parseRanges(t0).members.find((m) => m.key === 'scenes').value.items[2].members.find((m) => m.key === 'beats').value.items[1].members.find((m) => m.key === 'at').value;
  assert.equal(r.text, t0.slice(0, node.start) + '1.23' + t0.slice(node.end));
  assert.deepEqual(r.patch, [{ op: 'replace', path: '/scenes/2/beats/1/at', value: 1.23 }]);
  assert.deepEqual(r.inverse, [{ op: 'beat.at', scene: 'time', beat: 1, value: 1 }]);
});

test('compile returns the patch and the inverse ops without touching the story', () => {
  const st = JSON.parse(text('pieces/golden-film-kinetic/story.json')), before = JSON.stringify(st);
  const { patch, inverse } = compile(st, { op: 'scene.order', scene: 'hook', index: 2 });
  assert.deepEqual(patch, [{ op: 'move', from: '/scenes/0', path: '/scenes/2' }]);
  assert.deepEqual(inverse, [{ op: 'scene.order', scene: 'hook', index: 0 }]);
  assert.equal(JSON.stringify(st), before);
});

test('variant routing: an edit made in a format with its own beats lands in the variant, another format lands in the base (review focus 2)', () => {
  const dir = 'fixtures/negatives/_base/variants', t0 = text(`${dir}/story.json`), st = JSON.parse(t0);
  const si = st.scenes.findIndex((s) => s.variants?.['9x16']?.beats);
  const id = st.scenes[si].id;
  assert.equal(beatPath(st, id, 1, '9x16'), `/scenes/${si}/variants/9x16/beats/1`);
  assert.equal(beatPath(st, id, 1, '16x9'), `/scenes/${si}/beats/1`);
  assert.equal(beatPath(st, id, 1), `/scenes/${si}/beats/1`);
  assert.equal(beatPath(st, st.scenes[0].id, 0, '9x16'), '/scenes/0/beats/0');
  const v = applyEdits(t0, [{ op: 'beat.at', scene: id, beat: 1, value: 2, format: '9x16' }], {});
  assert.equal(v.patch[0].path, `/scenes/${si}/variants/9x16/beats/1/at`);
  assert.equal(v.story.scenes[si].variants['9x16'].beats[1].at, 2);
  assert.equal(v.story.scenes[si].beats[1].at, st.scenes[si].beats[1].at);
  const b = applyEdits(t0, [{ op: 'beat.at', scene: id, beat: 1, value: 2, format: '16x9' }], {});
  assert.equal(b.patch[0].path, `/scenes/${si}/beats/1/at`);
  assert.deepEqual(b.story.scenes[si].variants, st.scenes[si].variants);
  // the inverse keeps the format, so undo lands where the edit did
  assert.deepEqual(v.inverse, [{ op: 'beat.at', scene: id, beat: 1, value: st.scenes[si].variants['9x16'].beats[1].at, format: '9x16' }]);
  // say and move follow the variant only when the variant defines them
  const say = applyEdits(t0, [{ op: 'scene.say', scene: id, value: 'x', format: '9x16' }], {});
  assert.equal(say.patch[0].path, 'say' in st.scenes[si].variants['9x16'] ? `/scenes/${si}/variants/9x16/say` : `/scenes/${si}/say`);
  const withMove = applyEdits(t0, [{ op: 'beat.add', scene: id, beat: { at: 0.5, slot: 'zz', fx: 'entrances/fade' }, format: '9x16' }], {});
  assert.equal(withMove.story.scenes[si].variants['9x16'].beats.length, st.scenes[si].variants['9x16'].beats.length + 1);
  assert.equal(withMove.story.scenes[si].beats.length, st.scenes[si].beats.length);
});

test('an unknown format is refused, with the formats there are', () => {
  const st = JSON.parse(text('pieces/golden-film-kinetic/story.json'));
  const r = validateEdit(st, { op: 'beat.at', scene: 'hook', beat: 0, value: 1, format: '3x2' }, {});
  assert.equal(r.code, 'bad-value'); assert.match(r.hint, /9x16.*4x5/);
});

test('a known format the story does not ship (previewed in the studio) edits the base story, or its variant when it has one', () => {
  const st = JSON.parse(text('pieces/golden-film-kinetic/story.json'));
  st.formats = ['16x9'];   // the edit is made while previewing 9x16, which this story does not ship
  const t0 = JSON.stringify(st, null, 2);
  const r = applyEdits(t0, [{ op: 'beat.at', scene: 'hook', beat: 0, value: 1, format: '9x16' }], {});
  assert.equal(r.patch[0].path, '/scenes/0/beats/0/at');
  st.scenes[0].variants = { '9x16': { beats: [{ at: 0.5, slot: 'headline', fx: 'style:headline', text: 'x' }] } };
  const v = applyEdits(JSON.stringify(st, null, 2), [{ op: 'beat.at', scene: 'hook', beat: 0, value: 1, format: '9x16' }], {});
  assert.equal(v.patch[0].path, '/scenes/0/variants/9x16/beats/0/at');
});

// ---- refusals: one test per code, each with its hint ----
const kinetic = () => JSON.parse(text('pieces/golden-film-kinetic/story.json'));
const refused = (st, edit, ctx, code, hint) => {
  const r = validateEdit(st, edit, ctx);
  assert.ok(r, `${JSON.stringify(edit)} should be refused`);
  assert.equal(r.code, code, `${JSON.stringify(edit)}: ${r.code} ${r.reason}`);
  assert.equal(typeof r.reason, 'string'); assert.ok(r.reason.length > 0);
  assert.match(r.hint, hint);
  assert.throws(() => compile(st, edit, ctx), (e) => e instanceof EditRefused && e instanceof Error && e.code === code && e.hint === r.hint && e.reason === r.reason);
};

test('refusal generated: a story with a generator refuses every edit unless allowGenerated, naming the generator', () => {
  const st = JSON.parse(text('pieces/demo-film/story.json'));
  refused(st, { op: 'scene.say', scene: 'hook', value: 'x' }, {}, 'generated', /pieces\/demo-film\/capture\/build-story\.mjs/);
  assert.equal(validateEdit(st, { op: 'scene.say', scene: 'hook', value: 'x' }, { allowGenerated: true }), null);
});

test('refusal deck: a deck refuses every edit', () => {
  refused(JSON.parse(text('pieces/golden-deck-kinetic/story.json')), { op: 'scene.say', scene: 'hook', value: 'x' }, { allowGenerated: true }, 'deck', /read-only|deck/);
});

test('refusal unknown-scene names the scenes there are', () => {
  refused(kinetic(), { op: 'scene.duration', scene: 'nope', value: 3 }, {}, 'unknown-scene', /hook/);
});

test('refusal unknown-beat says how many beats the scene has', () => {
  refused(kinetic(), { op: 'beat.at', scene: 'hook', beat: 7, value: 1 }, {}, 'unknown-beat', /2 beats/);
  refused(kinetic(), { op: 'beat.remove', scene: 'hook', beat: 2 }, {}, 'unknown-beat', /0 to 1/);
});

test('refusal out-of-range: times outside the scene, an out before its at, a scene shorter than a beat', () => {
  refused(kinetic(), { op: 'beat.at', scene: 'hook', beat: 1, value: 4 }, {}, 'out-of-range', /below 4/);
  refused(kinetic(), { op: 'beat.out', scene: 'hook', beat: 1, value: 0.5 }, {}, 'out-of-range', /after 0\.5|above 0\.5/);
  refused(kinetic(), { op: 'beat.out', scene: 'hook', beat: 1, value: 4.5 }, {}, 'out-of-range', /4/);
  refused(kinetic(), { op: 'scene.duration', scene: 'time', value: 1 }, {}, 'out-of-range', /1\.2/);
  refused(kinetic(), { op: 'scene.order', scene: 'hook', index: 99 }, {}, 'out-of-range', /0 to/);
  const st = kinetic(); st.scenes[0].beats[1].out = 2;
  refused(st, { op: 'beat.at', scene: 'hook', beat: 1, value: 2.5 }, {}, 'out-of-range', /out/);
});

test('refusal bad-type: a value of the wrong JSON type', () => {
  refused(kinetic(), { op: 'beat.at', scene: 'hook', beat: 0, value: '1' }, {}, 'bad-type', /number/);
  refused(kinetic(), { op: 'beat.set', scene: 'hook', beat: 0, key: 'text', value: 3 }, {}, 'bad-type', /string/);
  refused(kinetic(), { op: 'beat.param', scene: 'hook', beat: 1, key: 'd', value: 'far' }, ctxFor('pieces/golden-film-kinetic'), 'bad-type', /number/);
});

test('refusal unknown-param lists the params the pattern has', () => {
  refused(kinetic(), { op: 'beat.param', scene: 'time', beat: 1, key: 'zzz', value: 1 }, ctxFor('pieces/golden-film-kinetic'), 'unknown-param', /suffix/);
  // without the patterns, names and types are not checked
  assert.equal(validateEdit(kinetic(), { op: 'beat.param', scene: 'time', beat: 1, key: 'zzz', value: 1 }, {}), null);
});

test('refusal bad-value: an enum value, a ref of the wrong group, an unknown op, a required key removed, the last beat removed', () => {
  const ctx = ctxFor('runtime/skeletons/film');
  const sk = JSON.parse(text('runtime/skeletons/film/story.json'));
  refused(sk, { op: 'beat.param', scene: 'hook', beat: 0, key: 'side', value: 'sideways' }, ctx, 'bad-value', /up\|down\|left\|right|up, down, left, right/);
  refused(sk, { op: 'scene.cut', scene: 'hook', pattern: 'moves/pan' }, ctx, 'bad-value', /transitions\//);
  refused(sk, { op: 'scene.cut', scene: 'hook', pattern: 'transitions/nope' }, ctx, 'bad-value', /transitions\/push/);
  refused(sk, { op: 'scene.rename', scene: 'hook' }, ctx, 'bad-value', /scene\.duration/);
  refused(sk, { op: 'beat.set', scene: 'hook', beat: 0, key: 'fx', value: null }, ctx, 'bad-value', /fx/);
  refused(sk, { op: 'beat.set', scene: 'hook', beat: 0, key: 'fact', value: 'f9' }, ctx, 'bad-value', /facts/);
  refused(sk, { op: 'beat.remove', scene: 'hook', beat: 0 }, ctx, 'bad-value', /at least one beat/);
  refused(sk, { op: 'scene.cut', scene: 'hook', pattern: null }, ctx, 'bad-value', /position/);
});

test('applyEdits stops at the first refused edit and says which one', () => {
  const t0 = text('pieces/golden-film-kinetic/story.json');
  assert.throws(() => applyEdits(t0, [{ op: 'beat.at', scene: 'hook', beat: 1, value: 1 }, { op: 'beat.at', scene: 'nope', beat: 0, value: 1 }], {}),
    (e) => e instanceof EditRefused && e.index === 1 && e.code === 'unknown-scene');
});

test('a shared param belongs to the beat\'s emphasis, exit or layout too (the kit routes scalars there)', () => {
  const story = { id: 's', kind: 'film', formats: ['16x9'], title: 't', language: 'en', facts: [], audio: { track: null, bpm: null, beats: null }, cta: { text: 'x', url: 'x' },
    scenes: [{ id: 'a', layout: 'layouts/object-card', duration: 4, cut: 'transitions/hard-cut', move: null, say: '',
      beats: [{ at: 0, slot: 'title', fx: 'entrances/fade', text: 'x', emphasis: 'emphasis/stamp', params: {} }] }] };
  const ctx = { ...ctxFor('pieces/golden-film-kinetic'), layoutParams: { 'layouts/object-card': ['variant'] } };
  const stampKey = Object.keys(patterns['emphasis/stamp'].params)[0];
  const ok = (key, value, c = ctx) => validateEdit(story, { op: 'beat.param', scene: 'a', beat: 0, key, value }, c);
  assert.equal(ok(stampKey, patterns['emphasis/stamp'].params[stampKey].default), null, 'a param of the beat\'s emphasis');
  assert.equal(ok('variant', 'receipt'), null, 'a param of the scene\'s layout');
  assert.equal(ok('variant', 'receipt', { ...ctx, layoutParams: undefined })?.code, 'unknown-param', 'without the layouts\' params it is unknown, as before');
  assert.equal(ok('nonsense', 1)?.code, 'unknown-param', 'a key no pattern of the beat takes');
});

test('every param in every shipped piece and example is accepted by beat.param with its own value', () => {
  const dirs = trackedPieces().filter((d) => existsSync(join(ROOT, d, 'style.json')));
  let n = 0;
  for (const d of dirs) {
    const st = JSON.parse(text(`${d}/story.json`));
    if (st.kind === 'deck') continue;
    const ctx = ctxFor(d, { allowGenerated: true });
    for (const sc of st.scenes) {
      const sets = [[{}, sc.beats], ...Object.entries(sc.variants ?? {}).filter(([, v]) => v.beats).map(([f, v]) => [{ format: f }, v.beats])];
      for (const [fmt, beats] of sets) beats.forEach((b, j) => {
        for (const [k, v] of Object.entries(b.params ?? {})) {
          const r = validateEdit(st, { op: 'beat.param', scene: sc.id, beat: j, key: k, value: v, ...fmt }, ctx);
          assert.equal(r, null, `${d} ${sc.id}/${j} ${b.fx} params.${k}=${JSON.stringify(v)}: ${JSON.stringify(r)}`);
          n++;
        }
      });
    }
  }
  assert.ok(n > 50, `${n} params checked`);
});

// ---- exactness of hand-written values ----
const INV = { inverse: true };
const validate = (s) => (storyValid(s) ? null : storyValid.errors);
const addBeat = (extra, fx = 'entrances/fade') => ({ op: 'beat.add', scene: 'hook', beat: { at: 2, slot: 'x', fx, ...extra } });

test('beat.add checks every key of the new beat the way the single-key ops do', () => {
  const ctx = ctxFor('pieces/golden-film-kinetic');
  for (const [edit, code, hint] of [
    [addBeat({ cue: 'Boom!' }), 'bad-value', /patterns\/sound/],
    [addBeat({ text: 5 }), 'bad-type', /string/],
    [addBeat({ exit: 'moves/pan' }), 'bad-value', /exits\//],
    [addBeat({ emphasis: 'zz' }), 'bad-value', /emphasis\//],
    [addBeat({ asset: 'https://x.org/a.png' }), 'bad-value', /assets\//],
    [addBeat({ value: '3' }), 'bad-type', /number/],
    [addBeat({ out: 'x' }), 'bad-type', /number/],
    [addBeat({ out: true }), 'bad-type', /number/],
    [addBeat({ out: 1 }), 'out-of-range', /after 2/],
    [addBeat({ out: 9 }), 'out-of-range', /at most 4/],
    [addBeat({ fact: 'f7' }), 'bad-value', /fact/],
    [addBeat({ step: 1.5 }), 'bad-type', /integer/],
    [addBeat({ screen: 'tap' }), 'bad-type', /array/],
    [addBeat({ params: 'x' }), 'bad-type', /object/],
    [addBeat({ params: { side: 'zzz' } }, 'entrances/rise'), 'bad-value', /up/],
    [addBeat({ params: { instant: 'yes' } }), 'bad-type', /true or false/],
    [addBeat({ params: { exit: 3 } }), 'bad-type', /object/],
  ]) refused(kinetic(), edit, ctx, code, hint);
  // a beat that passes is written as given, its times rounded
  const r = apply(text('pieces/golden-film-kinetic/story.json'), [addBeat({ out: 3.456, cue: 'tick', params: { side: 'left' } }, 'entrances/rise')], ctx);
  assert.deepEqual(r.story.scenes[0].beats.at(-1), { at: 2, slot: 'x', fx: 'entrances/rise', out: 3.46, cue: 'tick', params: { side: 'left' } });
});

test('with ctx.validate, an edit that would leave a story the story schema rejects is refused: schema', () => {
  const t0 = text('pieces/golden-film-kinetic/story.json');
  const bad = addBeat({ screen: [{ do: 'nope' }] });   // the ops leave a screen action's shape to the schema
  assert.equal(validateEdit(kinetic(), bad, {}), null);
  assert.throws(() => compile(kinetic(), bad, { validate }), (e) => e instanceof EditRefused && e.code === 'schema' && /screen/.test(e.reason) && /story\.schema/.test(e.hint));
  assert.throws(() => applyEdits(t0, [{ op: 'beat.at', scene: 'hook', beat: 1, value: 1 }, bad], { validate }), (e) => e.code === 'schema' && e.index === 1);
  // a valid edit passes the validator, and so does its undo
  const r = apply(t0, [addBeat({ text: 'ok' })], { validate });
  assert.equal(apply(r.text, r.inverse, { validate, ...INV }).text, t0);
});

test('undo restores exact values and bytes; only a forward edit rounds', () => {
  const t0 = text('pieces/golden-film-kinetic/story.json');
  const gi = JSON.parse(t0).scenes.findIndex((s) => s.id === 'gate');
  assert.equal(JSON.parse(t0).scenes[gi].beats[1].at, 0.483);
  for (const e of [{ op: 'beat.at', scene: 'gate', beat: 1, value: 1 }, { op: 'beat.remove', scene: 'gate', beat: 1 }]) {
    const r = apply(t0, [e], {});
    assert.equal(apply(r.text, r.inverse, INV).text, t0, `${JSON.stringify(e)}: ${JSON.stringify(r.inverse)}`);
  }
  assert.equal(applyEdits(t0, [{ op: 'beat.at', scene: 'gate', beat: 1, value: 0.483 }], {}).story.scenes[gi].beats[1].at, 0.48);
  // a hand-formatted story: odd spellings and one beat spread over lines come back as written
  const hand = `{
  "id": "hand", "kind": "film", "formats": ["9x16"], "title": "Hand", "language": "en",
  "facts": [{ "id": "f1", "text": "x", "source": "y" }],
  "audio": { "track": null, "bpm": null, "beats": null },
  "scenes": [
    {
      "id": "a", "layout": "layouts/title-stack", "duration": 4.0, "cut": "transitions/hard-cut", "move": null,
      "beats": [
        { "at": 0.50, "slot": "headline", "fx": "entrances/rise", "text": "caf\\u00e9 \\/ 1" },
        {
          "at": 1,
          "slot": "body", "fx": "entrances/fade"
        },
        { "at": 2, "slot": "line", "fx": "entrances/fade", "params": {"side":"up"} }
      ],
      "say": "a"
    }
  ],
  "cta": { "text": "Go", "url": "example.org" }
}
`;
  assert.ok(storyValid(JSON.parse(hand)), explain(storyValid));
  for (const e of [
    { op: 'beat.remove', scene: 'a', beat: 0 }, { op: 'beat.remove', scene: 'a', beat: 1 }, { op: 'beat.remove', scene: 'a', beat: 2 },
    { op: 'scene.duration', scene: 'a', value: 5 }, { op: 'beat.at', scene: 'a', beat: 0, value: 1.5 },
    { op: 'beat.set', scene: 'a', beat: 0, key: 'text', value: 'plain' }, { op: 'beat.param', scene: 'a', beat: 2, key: 'side', value: null },
  ]) {
    const r = apply(hand, [e], {});
    assert.equal(apply(r.text, r.inverse, INV).text, hand, `${JSON.stringify(e)}: ${JSON.stringify(r.inverse)}`);
  }
  const follow = text('fixtures/kit-smoke/follow/story.json'), n = JSON.parse(follow).scenes.find((s) => s.id === 'one').beats.length;
  for (let j = 0; j < n; j++) {
    const r = apply(follow, [{ op: 'beat.remove', scene: 'one', beat: j }], {});
    assert.equal(apply(r.text, r.inverse, INV).text, follow, `kit-smoke/follow one/${j}`);
  }
  // raw must be the JSON text of the value the op writes
  refused(kinetic(), { op: 'beat.at', scene: 'hook', beat: 0, value: 1, raw: '2' }, {}, 'bad-value', /raw/);
  assert.throws(() => applyEdits(t0, [{ op: 'beat.at', scene: 'hook', beat: 0, value: 1, raw: '2' }], {}), (e) => e.code === 'bad-value');
  assert.equal(applyEdits(t0, [{ op: 'beat.at', scene: 'hook', beat: 0, value: 1, raw: '1.0' }], {}).text.includes('"at": 1.0,'), true);
});

test('an inverse applies with ctx.inverse even when its params no longer fit the current pattern', () => {
  const t0 = text('pieces/golden-film-kinetic/story.json'), ctx = ctxFor('pieces/golden-film-kinetic');
  const a = apply(t0, [{ op: 'scene.cut', scene: 'gate', pattern: 'transitions/push' }], ctx);
  const b = apply(a.text, [{ op: 'scene.cut', scene: 'gate', pattern: 'transitions/push', params: null }], ctx);
  assert.equal(apply(b.text, b.inverse, { ...ctx, ...INV }).text, a.text);
  assert.equal(apply(a.text, a.inverse, { ...ctx, ...INV }).text, t0);
  // a cut and cutParams removed together from places apart each go back to their own place
  const st = kinetic(), gi = st.scenes.findIndex((s) => s.id === 'gate'), g = st.scenes[gi];
  st.scenes[gi] = { id: g.id, layout: g.layout, duration: g.duration, cut: 'transitions/push', position: g.position, move: g.move, cutParams: { direction: 'left' }, beats: g.beats, say: g.say };
  const apart = JSON.stringify(st, null, 2) + '\n';
  for (const e of [{ op: 'scene.cut', scene: 'gate', pattern: null, params: null }, { op: 'scene.cut', scene: 'gate', pattern: 'transitions/wipe', params: null }]) {
    const r = apply(apart, [e], ctx);
    assert.equal(apply(r.text, r.inverse, { ...ctx, ...INV }).text, apart, `${JSON.stringify(e)}: ${JSON.stringify(r.inverse)}`);
  }
  // without the flag it is checked as a new edit, and refused
  assert.throws(() => applyEdits(b.text, b.inverse, ctx), (e) => e.code === 'unknown-param');
  // the flag skips only the pattern checks: structure is still checked
  refused(kinetic(), { op: 'beat.at', scene: 'hook', beat: 0, value: 9 }, INV, 'out-of-range', /below 4/);
});

test('undefined, NaN, Infinity and functions are refused at the op boundary, never written', () => {
  for (const edit of [
    addBeat({ text: undefined }), addBeat({ value: NaN }), addBeat({ value: Infinity }), addBeat({ params: { d: () => 1 } }),
    { op: 'beat.at', scene: 'hook', beat: 0, value: 1, format: undefined },
    { op: 'scene.cut', scene: 'hook', pattern: 'transitions/push', params: { direction: undefined } },
  ]) refused(kinetic(), edit, {}, 'bad-value', /JSON/);
});

test('Object.prototype names are not params of any pattern', () => {
  const ctx = ctxFor('pieces/golden-film-kinetic');
  for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) refused(kinetic(), { op: 'beat.param', scene: 'time', beat: 1, key, value: 1 }, ctx, 'unknown-param', /suffix/);
  // without patterns the name passes, and the inverse says the key was absent
  const r = apply(text('pieces/golden-film-kinetic/story.json'), [{ op: 'beat.param', scene: 'time', beat: 1, key: 'constructor', value: 1 }], {});
  assert.equal(r.inverse[0].value, null);
});

test('ops refuse members their op does not have, and check bounds before rounding', () => {
  refused(kinetic(), { op: 'beat.at', scene: 'hook', beat: 0, value: 0.7, formats: '16x9' }, {}, 'bad-value', /format/);
  refused(kinetic(), { op: 'beat.at', scene: 'hook', beat: 0, value: 0.7, foo: 1 }, {}, 'bad-value', /beat\.at takes/);
  refused(kinetic(), { op: 'scene.say', scene: 'hook', value: 'q', before: 'id' }, {}, 'bad-value', /before/);
  refused(kinetic(), { op: 'scene.cut', scene: 'hook', pattern: 'transitions/push', format: '9x16' }, {}, 'bad-value', /format/);
  refused(kinetic(), { op: 'scene.duration', scene: 'hook', value: 60.004 }, {}, 'out-of-range', /60/);
  refused(kinetic(), { op: 'scene.duration', scene: 'hook', value: 0.004 }, {}, 'out-of-range', /0\.01/);
  refused(kinetic(), { op: 'beat.at', scene: 'hook', beat: 0, value: -0.004 }, {}, 'out-of-range', /0 to/);
});

test('a scene with no duration takes no time edits (a loop scene needs a duration too)', () => {
  const st = kinetic(); st.kind = 'loop'; delete st.scenes[1].duration;
  assert.equal(storyValid(st), false, 'the story schema requires duration on a loop scene');
  const id = st.scenes[1].id;
  refused(st, { op: 'beat.at', scene: id, beat: 0, value: 59 }, {}, 'out-of-range', /no duration/);
  refused(st, { op: 'beat.out', scene: id, beat: 0, value: 60 }, {}, 'out-of-range', /no duration/);
  refused(st, { op: 'beat.add', scene: id, beat: { at: 1, slot: 'x', fx: 'entrances/fade' } }, {}, 'out-of-range', /no duration/);
  refused(st, { op: 'scene.duration', scene: id, value: 3 }, {}, 'out-of-range', /no duration/);
});

test('an edit to a scene id two scenes share is refused: ambiguous-scene; beatPath throws the same', () => {
  const st = kinetic(); st.scenes[1].id = 'hook';
  refused(st, { op: 'beat.at', scene: 'hook', beat: 0, value: 1 }, {}, 'ambiguous-scene', /rename/);
  assert.throws(() => beatPath(st, 'hook', 0), (e) => e instanceof EditRefused && e.code === 'ambiguous-scene');
  assert.equal(beatPath(st, 'time', 0), '/scenes/2/beats/0');
});

test('a story with a duplicate key refuses every edit instead of writing one that never lands', () => {
  const t = text('pieces/golden-film-kinetic/story.json').replace('"title":', '"title": "dup",\n  "title":');
  assert.throws(() => applyEdits(t, [{ op: 'beat.at', scene: 'hook', beat: 0, value: 1 }], {}), (e) => e instanceof EditRefused && e.code === 'bad-value' && /title/.test(e.reason) && /twice|duplicate/.test(e.hint));
});

// ---- story.formats: the formats a piece ships (the studio's format picker) ----
test('story.formats writes the formats in canonical order (9x16, 1x1, 4x5, 16x9); only the formats bytes change; the inverse restores them byte for byte', () => {
  const smoke = text('fixtures/kit-smoke/film/story.json');   // "formats": ["16x9", "9x16", "1x1"]
  const r = apply(smoke, [{ op: 'story.formats', value: ['16x9', '9x16', '1x1', '4x5'] }], {});
  assert.deepEqual(r.story.formats, ['9x16', '1x1', '4x5', '16x9']);
  assert.equal(r.text, smoke.replace('"formats": ["16x9", "9x16", "1x1"]', '"formats": ["9x16", "1x1", "4x5", "16x9"]'), 'one line changes, in the line\'s own style');
  assert.equal(apply(r.text, r.inverse, { inverse: true }).text, smoke, 'undo restores the old order and bytes');

  const golden = text('pieces/golden-film-kinetic/story.json');   // a list over several lines
  const g = apply(golden, [{ op: 'story.formats', value: ['16x9', '9x16'] }], ctxFor('pieces/golden-film-kinetic'));
  assert.deepEqual(g.story.formats, ['9x16', '16x9']);
  assert.match(g.text, /"formats": \[\n    "9x16",\n    "16x9"\n  \]/, 'a list over several lines stays over several lines');
  assert.equal(apply(g.text, g.inverse, { inverse: true }).text, golden);
  assert.equal(r.inverse.length, 1); assert.equal(r.inverse[0].op, 'story.formats');
});

test('story.formats refuses an empty list, a repeat, an unknown format and a non-list, each with a hint', () => {
  const st = kinetic();
  refused(st, { op: 'story.formats', value: [] }, {}, 'bad-value', /at least one/);
  refused(st, { op: 'story.formats', value: ['9x16', '9x16'] }, {}, 'bad-value', /once/);
  refused(st, { op: 'story.formats', value: ['9x16', '3x2'] }, {}, 'bad-value', /9x16, 1x1, 4x5, 16x9/);
  refused(st, { op: 'story.formats', value: '9x16' }, {}, 'bad-type', /list/);
  refused(st, { op: 'story.formats', value: ['9x16'], scene: 'hook' }, {}, 'bad-value', /story\.formats takes/);
});

test('story.formats is refused on generated stories and decks, like every op', () => {
  refused(JSON.parse(text('pieces/demo-film/story.json')), { op: 'story.formats', value: ['9x16'] }, {}, 'generated', /build-story/);
  refused(JSON.parse(text('pieces/golden-deck-kinetic/story.json')), { op: 'story.formats', value: ['16x9'] }, { allowGenerated: true }, 'deck', /read-only|deck/);
});

test('removing a format leaves its variants in place, and the story stays valid', () => {
  const st = kinetic();
  st.scenes[0].variants = { '1x1': { beats: st.scenes[0].beats.slice(0, 1) } };
  const t = JSON.stringify(st, null, 2);
  const ctx = { validate: (s) => (storyValid(s) ? null : storyValid.errors) };
  const r = apply(t, [{ op: 'story.formats', value: ['9x16', '16x9'] }], ctx);
  assert.deepEqual(r.story.formats, ['9x16', '16x9']);
  assert.deepEqual(r.story.scenes[0].variants, st.scenes[0].variants, 'the 1x1 variant stays');
  assert.ok(storyValid(r.story), explain(storyValid));
});

// ---- audio.sample: a cue mapped to a sound file in the piece (what `mm sound fetch --cue` writes) ----
test('audio.sample maps a cue to a sound file, replaces and removes it; the inverse restores the bytes, and the last removal takes the empty samples object with it', () => {
  const smoke = text('fixtures/kit-smoke/film/story.json');   // "audio": { "track": null, "bpm": null, "beats": null }
  const a = apply(smoke, [{ op: 'audio.sample', cue: 'tick', value: 'assets/sounds/door.wav' }], {});
  assert.deepEqual(a.story.audio.samples, { tick: 'assets/sounds/door.wav' });
  assert.deepEqual(a.story.scenes, JSON.parse(smoke).scenes, 'only the audio changed');
  assert.equal(apply(a.text, a.inverse, { inverse: true }).text, smoke, 'undo restores the bytes, with no empty samples left');

  const b = apply(a.text, [{ op: 'audio.sample', cue: 'hit', value: 'assets/sounds/knock.mp3' }], {});
  assert.deepEqual(b.story.audio.samples, { tick: 'assets/sounds/door.wav', hit: 'assets/sounds/knock.mp3' });
  assert.equal(apply(b.text, b.inverse, { inverse: true }).text, a.text);

  const c = apply(b.text, [{ op: 'audio.sample', cue: 'tick', value: 'assets/sounds/other.ogg' }], {});
  assert.deepEqual(c.story.audio.samples, { tick: 'assets/sounds/other.ogg', hit: 'assets/sounds/knock.mp3' });
  assert.deepEqual(c.inverse, [{ op: 'audio.sample', cue: 'tick', value: 'assets/sounds/door.wav' }]);
  assert.equal(apply(c.text, c.inverse, { inverse: true }).text, b.text);

  const d = apply(b.text, [{ op: 'audio.sample', cue: 'tick', value: null }], {});
  assert.deepEqual(d.story.audio.samples, { hit: 'assets/sounds/knock.mp3' });
  assert.deepEqual(apply(d.text, d.inverse, { inverse: true }).story.audio.samples, { hit: 'assets/sounds/knock.mp3', tick: 'assets/sounds/door.wav' }, 'undo puts the cue back (at the end: an object\'s key order carries no meaning)');
  const e = apply(a.text, [{ op: 'audio.sample', cue: 'tick', value: null }], {});
  assert.equal(e.text, smoke, 'the last sample removed takes the samples object with it');
  assert.equal(apply(smoke, [{ op: 'audio.sample', cue: 'tick', value: null }], {}).text, smoke, 'removing what is not there changes nothing');
  assert.equal(apply(a.text, [{ op: 'audio.sample', cue: 'tick', value: 'assets/sounds/door.wav' }], {}).text, a.text, 'the same file changes nothing');
  const ctx = { validate: (s) => (storyValid(s) ? null : storyValid.errors) };
  assert.ok(storyValid(apply(smoke, [{ op: 'audio.sample', cue: 'tick', value: 'assets/sounds/door.wav' }], ctx).story));
});

test('audio.sample refuses a bad cue, a path that is not a sound file in the piece, a scene, and generated stories and decks, each with a hint', () => {
  const st = kinetic();
  refused(st, { op: 'audio.sample', cue: 'Tick!', value: 'assets/sounds/a.wav' }, {}, 'bad-value', /cue/);
  refused(st, { op: 'audio.sample', value: 'assets/sounds/a.wav' }, {}, 'bad-type', /cue/);
  refused(st, { op: 'audio.sample', cue: 'tick', value: 'https://x.org/a.wav' }, {}, 'bad-value', /sound file/);
  refused(st, { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/a.txt' }, {}, 'bad-value', /wav, mp3, m4a, flac or ogg/);
  refused(st, { op: 'audio.sample', cue: 'tick', value: 5 }, {}, 'bad-type', /sound file/);
  refused(st, { op: 'audio.sample', cue: 'tick' }, {}, 'bad-type', /sound file/);
  refused(st, { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/a.wav', scene: 'hook' }, {}, 'bad-value', /audio\.sample takes/);
  refused(JSON.parse(text('pieces/demo-film/story.json')), { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/a.wav' }, {}, 'generated', /build-story/);
  refused(JSON.parse(text('pieces/golden-deck-kinetic/story.json')), { op: 'audio.sample', cue: 'tick', value: 'assets/sounds/a.wav' }, { allowGenerated: true }, 'deck', /read-only|deck/);
});

test('every op and inverse used in these tests validates against the edit-ops schema', () => {
  assert.ok(used.length > 100, `${used.length} ops`);
  for (const op of used) assert.ok(editOps([op]), `${JSON.stringify(op)}: ${explain(editOps)}`);
});

test('the edit core runs in the browser too: no node: module, no bare package', () => {
  for (const f of ['json-splice.js', 'ops.js', 'history.js']) {
    const src = text(`scripts/studio/${f}`);
    const specs = [...src.matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]);
    for (const s of specs) assert.ok(s.startsWith('./') || s.startsWith('../'), `${f} imports ${s}`);
    assert.doesNotMatch(src, /\brequire\(|process\.|Buffer\b/, `${f} uses a Node global`);
  }
});
