// The sound patterns share one set of Web Audio building blocks (runtime/kit/synth.js); none keeps
// its own copy of the noise generator, the envelope or the voices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const SOUND = new URL('../../patterns/sound/', import.meta.url);

const folders = readdirSync(SOUND);
for (const cue of folders.filter((c) => existsSync(new URL(`${c}/pattern.js`, SOUND)))) {
  test(`sound/${cue} takes its voices from the shared synth module`, () => {
    const src = readFileSync(new URL(`${cue}/pattern.js`, SOUND), 'utf8');
    assert.doesNotMatch(src, /^(const rng|function (noiseBuf|shape|tone|burst))\b/m, 'no local copy of a synth helper');
    assert.match(src, /from '\.\.\/\.\.\/\.\.\/runtime\/kit\/synth\.js'/);
  });
}

for (const cue of folders.filter((c) => !existsSync(new URL(`${c}/pattern.js`, SOUND)))) {
  test(`sound/${cue} is data: a recipe.json and no code of its own`, () => {
    assert.ok(existsSync(new URL(`${cue}/recipe.json`, SOUND)), 'a sound pattern is pattern.js or recipe.json');
    assert.equal(readdirSync(new URL(`${cue}/`, SOUND)).filter((f) => f.endsWith('.js')).length, 0);
  });
}
