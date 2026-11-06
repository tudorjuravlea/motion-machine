// Film distance: how far apart two pieces are, on six axes read from story and style. Each axis says
// same or different and why, so a lookalike is named and not just scored. A film that differs on
// fewer than four axes is a lookalike of the other.
import { forFormat } from '../../runtime/kit/schedule.js';

export const AXES = ['structure', 'opening', 'signature', 'camera', 'score', 'ending'];
/** Fewer differing axes than this makes two films close. */
export const MIN_DIFFERING = 4;

const ROLE = /^style:([a-z]+)$/;
const entranceOf = (fx, style) => { const m = typeof fx === 'string' ? ROLE.exec(fx) : null; return m ? (style?.entrances?.[m[1]] ?? fx) : (fx ?? null); };
const longest = (scenes) => scenes.reduce((best, sc) => (best == null || (sc.duration ?? 0) > (best.duration ?? 0) ? sc : best), null);
const earliest = (beats) => [...(beats ?? [])].sort((a, b) => (a.at ?? 0) - (b.at ?? 0))[0] ?? null;

/** The six things a film is compared on, as plain data. `piece` is { story, style }. */
export function filmProfile({ story: written, style }) {
  const story = forFormat(written, written.formats?.[0]);
  const scenes = story.scenes ?? [];
  const first = scenes[0], last = scenes.at(-1), big = longest(scenes);
  const total = scenes.reduce((s, sc) => s + (sc.duration ?? 0), 0) || 1;
  const cues = [0, 0, 0];
  let start = 0;
  for (const sc of scenes) {
    for (const b of sc.beats ?? []) if (b.cue) cues[Math.min(2, Math.floor(((start + (b.at ?? 0)) / total) * 3))] += 1;
    start += sc.duration ?? 0;
  }
  // the signature pattern is the longest scene's most particular beat: the first one that is not the headline or body role
  const sigBeat = (big?.beats ?? []).find((b) => !/^style:(headline|body)$/.test(b.fx ?? '')) ?? big?.beats?.[0];
  const exits = [...new Set((last?.beats ?? []).map((b) => b.exit).filter(Boolean))].sort();
  return {
    structure: scenes.map((sc) => sc.layout),
    opening: { layout: first?.layout ?? null, entrance: entranceOf(earliest(first?.beats)?.fx, style) },
    signature: { layout: big?.layout ?? null, pattern: entranceOf(sigBeat?.fx, style) },
    camera: scenes.map((sc) => sc.move).filter(Boolean),
    score: { cues, track: Boolean(story.audio?.track) },
    ending: { layout: last?.layout ?? null, exit: exits.length ? exits.join('+') : 'none' },
  };
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lcsLen = (a, b) => { const t = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0)); for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]); return t[a.length][b.length]; };
const show = (v) => (Array.isArray(v) ? (v.length ? v.join(' > ') : 'none') : typeof v === 'object' && v ? Object.values(v).join(' / ') : String(v));

/** Per-axis verdicts for two profiles: [{ axis, same, reason }]. */
export function compareProfiles(a, b) {
  const out = [];
  const add = (axis, same, reason) => out.push({ axis, same, reason });
  const common = lcsLen(a.structure, b.structure);
  add('structure', eq(a.structure, b.structure), eq(a.structure, b.structure)
    ? `same ${a.structure.length} scenes in the same order of layouts`
    : `${a.structure.length} vs ${b.structure.length} scenes; ${common} layouts in common order`);
  add('opening', eq(a.opening, b.opening), eq(a.opening, b.opening) ? `both open on ${show(a.opening)}` : `opens on ${show(a.opening)} vs ${show(b.opening)}`);
  add('signature', eq(a.signature, b.signature), eq(a.signature, b.signature) ? `the longest scene is ${show(a.signature)} in both` : `longest scene ${show(a.signature)} vs ${show(b.signature)}`);
  add('camera', eq(a.camera, b.camera), eq(a.camera, b.camera) ? `same camera path: ${show(a.camera)}` : `camera path ${show(a.camera)} vs ${show(b.camera)}`);
  const sameScore = eq(a.score.cues, b.score.cues) && a.score.track === b.score.track;
  add('score', sameScore, sameScore ? `cues per third ${a.score.cues.join('/')}, ${a.score.track ? 'with' : 'no'} track in both` : `cues per third ${a.score.cues.join('/')} (${a.score.track ? 'track' : 'no track'}) vs ${b.score.cues.join('/')} (${b.score.track ? 'track' : 'no track'})`);
  add('ending', eq(a.ending, b.ending), eq(a.ending, b.ending) ? `both end on ${show(a.ending)}` : `ends on ${show(a.ending)} vs ${show(b.ending)}`);
  return out;
}

/** { axes, differing, close }: close when fewer than MIN_DIFFERING of the six axes differ. */
export function filmDistance(a, b) {
  const axes = compareProfiles(filmProfile(a), filmProfile(b));
  const differing = axes.filter((x) => !x.same).length;
  return { axes, differing, close: differing < MIN_DIFFERING };
}
