// API keys for `mm gen` (SPEC §8): from the environment, else from $HOME/.config/motion-machine/keys.env
// (lines KEY=value, written by the person, only read here). Never from the repository, never written,
// never printed: mask() shows the last four, scrub() removes a key from any text before it is shown.
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const KEY_NAMES = { kie: 'KIE_API_KEY', elevenlabs: 'ELEVENLABS_API_KEY' };
/** Where the keys file lives, relative to the home folder. */
export const KEYS_FILE = join('.config', 'motion-machine', 'keys.env');

/** KEY=value lines (an `export ` prefix, quotes and # comments allowed) as an object. */
export function parseKeys(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

/** { value, source } for a provider's key (source: "environment" or the file's path under $HOME), or null when it is not set. */
export function findKey(provider, { env = process.env, home = env.HOME || homedir() } = {}) {
  const name = KEY_NAMES[provider];
  if (env[name]) return { name, value: env[name], source: 'environment' };
  const file = join(home, KEYS_FILE);
  if (existsSync(file)) {
    const v = parseKeys(readFileSync(file, 'utf8'))[name];
    if (v) return { name, value: v, source: `$HOME/${KEYS_FILE}` };
  }
  return null;
}

/** "…f3a9": the last four characters and nothing else. */
export const mask = (value) => `…${String(value).slice(-4)}`;

/** `text` with every given secret replaced by its mask. */
export function scrub(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && String(s).length >= 8) out = out.split(s).join(mask(s));
  return out;
}
