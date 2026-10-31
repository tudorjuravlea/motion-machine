#!/usr/bin/env node
// `mm sound clone --profile <profile> --cue <name> --meaning "<text>" [--like <sound>] [--family input|surface|outcome] [--out <patterns-dir>] [--force]` (SPEC §9).
//
//   a sound profile (styles/sound/<name>.json, or a profile mined by `mm sound mine`) ──► seeded candidates from a template
//   for the cue's family, rendered offline (runtime/kit/synth.js: the samples an OfflineAudioContext plays), voiced by the
//   profile and measured with scripts/lib/audio-measure.mjs ──► the one nearest the profile's bands (and the --like sound,
//   when given) is written as
//   <out>/sound/<cue>/recipe.json   the cue as data (contracts/sound-recipe.schema.json), level calibrated as `mm sound-listen --calibrate` does
//   <out>/sound/<cue>/PATTERN.md    the card: the profile it was cloned from and that profile's sources
//   <out>/sound/<cue>/demo/cue.json
// --out is a patterns folder (default ./patterns); the cue is then found like any other, by a piece whose patterns base is that
// folder. The same inputs write the same files. The chosen recipe is drawn once more in an OfflineAudioContext (Chromium) and
// must match the samples measured in Node.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { UsageError, runMain, usageText } from './lib/cli.mjs';
import { assertTools } from './lib/ffmpeg.mjs';
import { decodeStereo } from './lib/audio-decode.mjs';
import { measure } from './lib/audio-measure.mjs';
import { loadProfile, profileFile } from './lib/sound-profile.mjs';
import { cardOf, cloneRecipe, likeOf, recipeJson } from './lib/sound-clone.mjs';
import { splitSounds } from './lib/sound-mine.mjs';
import { judgeCue } from './lib/sound-palette.mjs';
import { validators } from './lib/validate.mjs';
import { renderRecipe } from '../runtime/kit/synth.js';
import { calibratedGain } from './sound-listen.mjs';

const SR = 48000;
const CUE = /^[a-z][a-z0-9-]{1,30}$/;

/** Draws `recipe` in an OfflineAudioContext and returns the largest sample difference from renderRecipe in Node (null when no browser could be started). */
async function contextDifference(recipe, profile, feel = 'soft-ui') {
  let r = null;
  try {
    r = await (await import('./lib/cue-render.mjs')).openRenderer();
    const web = await r.renderChannels([{ cue: recipe.name, recipe, profile, at: 0.05, feel, opts: {} }], { seconds: 2.5, sampleRate: SR });
    const node = renderRecipe(recipe, { sampleRate: SR, profile });
    const at = Math.round(0.05 * SR);
    let worst = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < node.length; i++) worst = Math.max(worst, Math.abs(web.channels[c][at + i] - node.channels[c][i]));
    return worst;
  } catch { return null; } finally { await r?.close(); }
}

/**
 * Clones `cue` from `profileRef` and writes it under `<out>/sound/<cue>/`. Returns { dir, recipe, family, contour, checks, measured, contextDiff }.
 * Throws UsageError for a name, a folder or a sound that cannot be used.
 */
export async function cloneCue({ profileRef, cue, meaning, like = null, family = null, out = 'patterns', force = false, check = true, log = () => {} }) {
  if (!CUE.test(cue)) throw new UsageError(`--cue ${cue}: a cue name is lowercase letters, digits and hyphens, starting with a letter (2 to 31 characters)`, 2);
  if (meaning.trim().length < 3) throw new UsageError('--meaning needs a few words: the visible event the cue marks', 2);
  if (family && !['input', 'surface', 'outcome'].includes(family)) throw new UsageError(`--family ${family}: input, surface or outcome`, 2);
  let profile;
  try { profile = loadProfile(profileRef); } catch (e) { throw new UsageError(e.message, 2); }
  const dir = join(resolve(out), 'sound', cue);
  if (!force && (existsSync(join(dir, 'recipe.json')) || existsSync(join(dir, 'pattern.js')))) throw new UsageError(`${relative(process.cwd(), dir) || dir} already holds a cue; choose another --cue or pass --force to overwrite its recipe`, 2);

  let likeInfo = null;
  if (like) {
    if (!existsSync(like)) throw new UsageError(`--like ${like}: no such file`, 2);
    const sounds = splitSounds(await decodeStereo(like, SR), SR);
    if (!sounds.length) throw new UsageError(`--like ${like}: no sound found in it`, 2);
    likeInfo = likeOf(sounds[0].channels, SR);
    log(`like ${basename(like)}: ${likeInfo.family}, attack ${(likeInfo.attackS * 1000).toFixed(1)} ms, rings ${likeInfo.audibleS.toFixed(2)} s, centre ${Math.round(likeInfo.centroidHz)} Hz${likeInfo.tonal ? `, tonal ${Math.round(likeInfo.pitchHz)} Hz` : ', noise or knock'}`);
  }

  const res = cloneRecipe({ profile, cue, meaning, family, like: likeInfo, calibrate: calibratedGain, sampleRate: SR });
  const v = validators();
  if (!v.soundRecipe(res.recipe)) throw new Error(`the cloned recipe does not validate: ${(v.soundRecipe.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);

  const diff = check ? await contextDifference(res.recipe, profile) : null;
  if (diff != null && diff > 1e-5) throw new Error(`the audio context and Node disagree by ${diff} on the cloned recipe`);
  const { channels } = renderRecipe(res.recipe, { sampleRate: SR, profile });
  const measured = measure(channels, SR), checks = judgeCue(channels, SR, profile, { durationS: res.recipe.durationS }).checks;

  mkdirSync(join(dir, 'demo'), { recursive: true });
  writeFileSync(join(dir, 'recipe.json'), recipeJson(res.recipe));
  writeFileSync(join(dir, 'PATTERN.md'), cardOf({ recipe: res.recipe, profile, profileRef: /^[a-z][a-z0-9-]{1,40}$/.test(profileRef) ? profileRef : basename(profileFile(profileRef)), family: res.family, contour: res.contour, measured, checks, like: Boolean(like), likeName: like ? basename(like) : null }));
  writeFileSync(join(dir, 'demo', 'cue.json'), `${JSON.stringify({ at: [0.5, 1.5, 2.5], emphasis: ['subtle', 'normal', 'strong'], profile: profileRef })}\n`);
  return { dir, recipe: res.recipe, family: res.family, contour: res.contour, score: res.score, tried: res.tried, checks, measured, contextDiff: diff };
}

runMain(import.meta, async () => {
  let a;
  try {
    a = parseArgs({ allowPositionals: true, strict: true, options: { profile: { type: 'string' }, cue: { type: 'string' }, meaning: { type: 'string' }, like: { type: 'string' }, family: { type: 'string' }, out: { type: 'string', default: 'patterns' }, force: { type: 'boolean', default: false } } });
  } catch (e) { throw new UsageError(`${e.message}\n${usageText('sound clone')}`, 2); }
  const { values, positionals } = a;
  if (positionals.length || !values.profile || !values.cue || !values.meaning) throw new UsageError(usageText('sound clone'), 2);
  if (values.like) assertTools();
  const res = await cloneCue({ profileRef: values.profile, cue: values.cue, meaning: values.meaning, like: values.like ? resolve(values.like) : null, family: values.family ?? null, out: values.out, force: values.force, log: console.log });
  const missed = res.checks.filter((c) => !c.ok).map((c) => c.check);
  console.log(`sound clone: ${res.recipe.name} (${res.family}, ${res.contour}, ${res.recipe.durationS} s) from ${values.profile} -> ${relative(process.cwd(), res.dir) || res.dir}; loudest 100 ms ${res.measured.lufs100ms.toFixed(1)} LUFS, ${missed.length ? `W-PALETTE would miss: ${missed.join(', ')}` : 'inside the profile'}${res.contextDiff == null ? '; audio-context check not run (no browser)' : '; audio context agrees'}`);
  return 0;
});
