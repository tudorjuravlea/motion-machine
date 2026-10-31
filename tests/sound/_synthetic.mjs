// A set of sounds with known numbers, rendered from known recipes (runtime/kit/synth.js), for the tests of mining
// and cloning. Not a test file. Nothing audible is committed: the WAVs are written to a folder the test makes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderRecipe } from '../../runtime/kit/synth.js';
import { wavOf } from '../../scripts/sound-listen.mjs';
import { loudest100ms } from '../../scripts/lib/audio-measure.mjs';

export const SR = 48000;
const mk = (name, layers, durationS) => ({ name, meaning: 'a known sound for the tests', durationS, layers });

/** Known sounds: what each is, so a test can say what mining should recover. */
export const KNOWN = {
  'bar-a': { recipe: mk('bar-a', [{ kind: 'tone', f: 440, attackS: 0.002, t60: 0.3, partials: [[1, 0], [2.76, -20], [5.4, -30]] }], 0.35), pitchHz: 440, pitchClass: 'A', t60: 0.3, attackS: 0.002, mode: 'bar', ratios: [2.76, 5.4], family: 'outcome' },
  'bar-e': { recipe: mk('bar-e', [{ kind: 'tone', f: 659.26, attackS: 0.002, t60: 0.34, partials: [[1, 0], [2.76, -20], [5.4, -30]] }], 0.4), pitchHz: 659.26, pitchClass: 'E', t60: 0.34, attackS: 0.002, mode: 'bar', ratios: [2.76, 5.4], family: 'outcome' },
  'bar-c': { recipe: mk('bar-c', [{ kind: 'tone', f: 523.25, attackS: 0.002, t60: 0.25, partials: [[1, 0], [2.76, -20], [5.4, -30]] }], 0.3), pitchHz: 523.25, pitchClass: 'C', t60: 0.25, attackS: 0.002, mode: 'bar', ratios: [2.76, 5.4], family: 'surface' },
  mallet: { recipe: mk('mallet', [{ kind: 'tone', f: 392, attackS: 0.002, t60: 0.3, partials: [[1, 0], [3.99, -24]] }], 0.35), pitchHz: 392, pitchClass: 'G', t60: 0.3, attackS: 0.002, mode: 'mallet', ratios: [3.99], family: 'outcome' },
  string: { recipe: mk('string', [{ kind: 'tone', f: 330, attackS: 0.003, t60: 0.4, partials: [[1, 0], [2, -6], [3, -9], [4, -12]] }], 0.45), pitchHz: 330, pitchClass: 'E', t60: 0.4, attackS: 0.003, mode: 'string', ratios: [2, 3, 4], family: 'outcome' },
  knock: { recipe: mk('knock', [{ kind: 'noise', filter: { type: 'bandpass', f: 900, q: 2 }, attackS: 0.001, t60: 0.03, peak: 1 }], 0.04), pitchHz: null, t60: 0.03, family: 'input' },
};

/** A known sound as stereo samples, level-matched to -30 LUFS (loudest 100 ms), as the cues of a palette are. */
export const render = (name, opts = {}) => {
  const ch = renderRecipe(KNOWN[name].recipe, { sampleRate: SR, ...opts }).channels;
  const g = 10 ** ((-30 - loudest100ms(ch, SR)) / 20);
  return ch.map((c) => c.map((x) => x * g));
};

/** Writes each named sound as <dir>/<name>.wav; returns the folder. */
export function writeSet(dir, names = Object.keys(KNOWN)) {
  mkdirSync(dir, { recursive: true });
  for (const n of names) writeFileSync(join(dir, `${n}.wav`), wavOf(render(n), SR));
  return dir;
}

/** One stereo recording holding `parts` ([name, atSeconds]) over `seconds`. */
export function recording(parts, seconds) {
  const L = new Float32Array(Math.ceil(seconds * SR)), R = new Float32Array(L.length);
  for (const [name, at] of parts) {
    const [l, r] = render(name), start = Math.round(at * SR);
    for (let i = 0; i < l.length && start + i < L.length; i++) { L[start + i] += l[i]; R[start + i] += r[i]; }
  }
  return [L, R];
}
