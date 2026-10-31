// Finds and reads the data of the sound system (SPEC §9): sound profiles, recipes, and the sound pattern
// module a cue name resolves to. Library only; Node.
//
//   profileFile(ref, dir)                    the file a profile reference names: a name in styles/sound/, else a path
//   loadProfile(ref, dir)                    the profile, validated against contracts/sound-profile.schema.json
//   loadRecipe(file)                         a recipe, validated against contracts/sound-recipe.schema.json
//   cueFiles(patternsBase, name)             { js, recipe } of patterns/sound/<name>/ (a path or null each)
//   loadCueModule(patternsBase, name, prof)  the sound pattern module of a cue: pattern.js, or the recipe as a module
//   profileRefOf(style)                      the profile a style names (brand wins when the style was composed), or null
//
// A folder with both pattern.js and recipe.json is a code cue that also has a recipe: the code plays when
// no profile is set (the palette's feel is the style's sound), the recipe when one is.
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './browser.mjs';
import { validators } from './validate.mjs';
import { recipeModule } from '../../runtime/kit/synth.js';

let v = null;
const check = () => (v ??= validators());
const explain = (fn) => (fn.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');

export const SOUND_PROFILES_DIR = join(ROOT, 'styles', 'sound');

/** A bare name is a shipped profile; anything with a separator or `.json` is a path (relative to `dir`). */
export function profileFile(ref, dir = process.cwd()) {
  if (/^[a-z][a-z0-9-]{1,40}$/.test(ref)) return join(SOUND_PROFILES_DIR, `${ref}.json`);
  return isAbsolute(ref) ? ref : resolve(dir, ref);
}

export function loadProfile(ref, dir = process.cwd()) {
  const file = profileFile(ref, dir);
  if (!existsSync(file)) throw new Error(`sound profile ${ref} not found (looked for ${file})`);
  let json;
  try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`sound profile ${file}: ${e.message}`); }
  if (!check().soundProfile(json)) throw new Error(`sound profile ${file} is invalid: ${explain(check().soundProfile)}`);
  return json;
}

export function loadRecipe(file) {
  let json;
  try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`recipe ${file}: ${e.message}`); }
  if (!check().soundRecipe(json)) throw new Error(`recipe ${file} is invalid: ${explain(check().soundRecipe)}`);
  return json;
}

export function cueFiles(patternsBase, name) {
  const dir = join(patternsBase, 'sound', name);
  const js = join(dir, 'pattern.js'), recipe = join(dir, 'recipe.json');
  return { js: existsSync(js) ? js : null, recipe: existsSync(recipe) ? recipe : null };
}

/** The sound pattern module of cue `name` (null when no folder holds it, or when its code does not import); a recipe that does not validate throws, naming the file. */
export async function loadCueModule(patternsBase, name, profile = null) {
  const { js, recipe } = cueFiles(patternsBase, name);
  if (recipe && (profile || !js)) return recipeModule(loadRecipe(recipe), profile);
  try { if (js) return (await import(pathToFileURL(js).href)).default ?? null; } catch { return null; }
  return null;
}

/** `sound.profile` of a style, or null. */
export const profileRefOf = (style) => style?.sound?.profile ?? null;
