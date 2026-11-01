// Exact placement of a cue on its picture event, and the sync lock that records it (SPEC §9). Pure: no Node
// built-in, so the gate's W-CUE verdict loads in a browser (the studio) too.
//
//   cueAnchors(channels, sr)                  the points of a rendered cue that can meet its beat: onset (the first sample
//                                             within 20 dB of the peak), peak (the centre of the loudest 5 ms), apex (the
//                                             centre of the loudest 50 ms, a whoosh's body), end (the last sample within
//                                             30 dB of the peak), and how long it rings past its peak
//   offsetFor(cue, params, style)             { role, anchor, offsetMs, from }: the beat's params.cue.offsetMs, else the
//                                             style's sound.roles.<role>.offsetMs, else the role's own (sound-roles.mjs)
//   placeCue({ pictureS, anchors, offset })   { startS }: where the rendered buffer starts so its anchor meets the picture
//                                             event plus the offset
//   lockOf({ pictureS, anchors, offset })     the sync lock `mm sound` writes per cue into out/cues.json
//   judgeLock(lock, { soundOk })              what W-CUE says of a lock: ok, issue, deliberate (one role offset of 30 ms or
//                                             more explains it) or acknowledged (a beat's params.cue.soundOk)
//
// The anchors and the judgement restate Earshot's real-sound mixer and QA (MIT): align by attack, peak or end measured on
// the sound; impacts by attack and peak, whooshes by their apex, risers by their audible end; a deviation that one
// layer's offset explains is listed apart as deliberate. The thresholds are the provisional ones of SPEC §9.
import { roleNameOf, ROLES } from './sound-roles.mjs';

export const SYNC = Object.freeze({
  earlyMs: 45,        // the sound's onset leads its picture by more than this: reads early
  lateMs: 75,         // a struck sound's peak lands later than this after its picture: reads late
  apexMs: 45,         // a whoosh's apex stays within this of its cut
  endMinMs: -250,     // a riser's audible end lies between this ...
  endMaxMs: 30,       // ... and this against its hit
  ringMs: 30,         // an end-aligned riser rings on no more than this past its peak
  explainMs: 30,      // a role offset explains a deviation only from this size up
  struckMs: 150,      // a sound whose peak comes later than this after its onset is a swell: it has no struck peak to be late
});

const FLOOR_ONSET = 0.1;          // -20 dB: the onset
const FLOOR_END = 10 ** (-30 / 20);

/** @returns {{ onsetS: number, peakS: number, apexS: number, endS: number, ringS: number } | null} seconds from the start of the buffer; null for silence */
export function cueAnchors(channels, sr) {
  const n = channels[0].length;
  const amp = new Float64Array(n);
  let top = 0;
  for (const c of channels) for (let i = 0; i < n; i++) { const a = Math.abs(c[i]); if (a > amp[i]) amp[i] = a; if (a > top) top = a; }
  if (!(top > 0)) return null;
  let on = 0;
  while (amp[on] < FLOOR_ONSET * top) on++;
  let end = n - 1;
  while (end > on && amp[end] < FLOOR_END * top) end--;
  const w = Math.max(1, Math.round(0.005 * sr)), buckets = Math.floor(n / w);
  let bi = 0, bv = -1;
  for (let b = 0; b < buckets; b++) {
    let m = 0;
    for (let i = b * w, e = i + w; i < e; i++) if (amp[i] > m) m = amp[i];
    if (m > bv) { bv = m; bi = b; }
  }
  const peak = bi * w + w / 2;
  const win = Math.max(1, Math.round(0.05 * sr));
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) { let s = 0; for (const c of channels) s += c[i] * c[i]; cum[i + 1] = cum[i] + s; }
  let ai = 0, av = -1;
  for (let s = 0; s + win <= n; s++) { const e = cum[s + win] - cum[s]; if (e > av) { av = e; ai = s; } }
  return { onsetS: on / sr, peakS: peak / sr, apexS: (ai + win / 2) / sr, endS: end / sr, ringS: Math.max(0, end - peak) / sr };
}

/** The role of `cue`, the point of it that meets the beat and by how much it leads (negative) or lags it; `from` says who set the offset. */
export function offsetFor(cue, params, style) {
  const role = roleNameOf(cue), base = ROLES[role];
  const beat = params?.offsetMs, brand = style?.sound?.roles?.[role]?.offsetMs;
  if (Number.isFinite(Number(beat)) && beat !== '' && beat != null) return { role, anchor: base.anchor, offsetMs: Number(beat), from: 'beat' };
  if (Number.isFinite(brand)) return { role, anchor: base.anchor, offsetMs: brand, from: 'style' };
  return { role, anchor: base.anchor, offsetMs: base.offsetMs, from: 'role' };
}

const POINT = { onset: 'onsetS', apex: 'apexS', end: 'endS' };

/** Where the rendered buffer starts so its anchor point meets the picture event plus the offset. */
export function placeCue({ pictureS, anchors, offset }) {
  return { startS: pictureS + offset.offsetMs / 1000 - anchors[POINT[offset.anchor]] };
}

const ms = (s) => Math.round(s * 10000) / 10;       // seconds to milliseconds, 0.1 ms

/** The sync lock of a placed cue: its measured points in film seconds and against the picture event, in ms. */
export function lockOf({ pictureS, anchors, offset, startS }) {
  const start = startS ?? placeCue({ pictureS, anchors, offset }).startS;
  const at = (k) => start + anchors[k];
  return {
    role: offset.role, anchor: offset.anchor, offsetMs: offset.offsetMs, offsetFrom: offset.from,
    pictureS: Math.round(pictureS * 1e4) / 1e4, startS: Math.round(start * 1e4) / 1e4,
    onsetS: Math.round(at('onsetS') * 1e4) / 1e4, peakS: Math.round(at('peakS') * 1e4) / 1e4,
    apexS: Math.round(at('apexS') * 1e4) / 1e4, endS: Math.round(at('endS') * 1e4) / 1e4,
    vsPictureMs: { onset: ms(at('onsetS') - pictureS), peak: ms(at('peakS') - pictureS), apex: ms(at('apexS') - pictureS), end: ms(at('endS') - pictureS) },
    struck: (anchors.peakS - anchors.onsetS) * 1000 <= SYNC.struckMs,
    ringMs: ms(anchors.ringS),
  };
}

const signed = (x) => `${x >= 0 ? '+' : ''}${Math.round(x)}`;

/** The way a measured sound sits off its picture when shifted by `shift` ms (a role offset taken out), or null. */
function issueFor(test, d, struck, shift) {
  if (test === 'end') {
    const e = d.end - shift;
    return e < SYNC.endMinMs || e > SYNC.endMaxMs ? `its audible end is ${signed(e)} ms from its hit (want ${SYNC.endMinMs}..+${SYNC.endMaxMs})` : null;
  }
  if (test === 'apex') {
    const e = d.apex - shift;
    return Math.abs(e) > SYNC.apexMs ? `its apex is ${signed(e)} ms from the cut (want within ${SYNC.apexMs})` : null;
  }
  const a = d.onset - shift, p = d.peak - shift;
  if (a < -SYNC.earlyMs) return `the sound leads its picture by ${Math.round(-a)} ms (reads early beyond ${SYNC.earlyMs})`;
  if (struck && p > SYNC.lateMs) return `its peak lands ${Math.round(p)} ms after the picture (reads late beyond ${SYNC.lateMs})`;
  return null;
}

/**
 * @returns {{ test: string, status: 'ok'|'issue'|'deliberate'|'acknowledged', issue?: string, explained?: object, reason?: string }}
 */
export function judgeLock(lock, { soundOk = null } = {}) {
  const test = lock.anchor === 'end' ? 'end' : lock.anchor === 'apex' ? 'apex' : 'impact';
  const d = lock.vsPictureMs;
  const found = [];
  const first = issueFor(test, d, lock.struck, 0);
  let explained = null;
  if (first) {
    if (Math.abs(lock.offsetMs) >= SYNC.explainMs && !issueFor(test, d, lock.struck, lock.offsetMs)) {
      const who = lock.offsetFrom === 'beat' ? 'this beat\'s params.cue.offsetMs' : lock.offsetFrom === 'style' ? `style.sound.roles.${lock.role}.offsetMs` : `role ${lock.role}'s offset`;
      explained = { offsetMs: lock.offsetMs, from: lock.offsetFrom ?? 'role', text: `${first.replace(/ \(.*/, '')}, which is ${who} ${signed(lock.offsetMs)} ms` };
    } else found.push(first);
  }
  if (lock.anchor === 'end' && lock.ringMs > SYNC.ringMs) found.push(`it rings on ${Math.round(lock.ringMs)} ms past its peak, so its climax lands ${Math.round(lock.ringMs)} ms before the end that is placed (limit ${SYNC.ringMs})`);
  if (found.length) {
    const issue = found.join('; ');
    return soundOk ? { test, status: 'acknowledged', issue, reason: String(soundOk) } : { test, status: 'issue', issue };
  }
  return explained ? { test, status: 'deliberate', explained } : { test, status: 'ok' };
}
