// The sound patterns share one set of Web Audio building blocks (runtime/kit/synth.js); none keeps
// its own copy of the noise generator, the envelope or the voices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const SOUND = new URL('../../patterns/sound/', import.meta.url);

for (const cue of readdirSync(SOUND)) {
  test(`sound/${cue} takes its voices from the shared synth module`, () => {
    const src = readFileSync(new URL(`${cue}/pattern.js`, SOUND), 'utf8');
    assert.doesNotMatch(src, /^(const rng|function (noiseBuf|shape|tone|burst))\b/m, 'no local copy of a synth helper');
    assert.match(src, /from '\.\.\/\.\.\/\.\.\/runtime\/kit\/synth\.js'/);
  });
}
