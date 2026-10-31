// The `mm gen` request cache (SPEC §8): paid or slow work is never done twice for the same request. A request's
// key is the sha256 of everything that decides the result: the cache version, provider, model, kind, every
// parameter, the prompt as sent, the negative, the hash of each input file and the tone pass applied after the
// result lands. The record beside an asset (assets/gen/<name>.gen.json) keeps the key; a repeat finds the
// record with the same key whose files are still there and reuses them. `--fresh` skips the lookup.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stable } from '../brand-prompt.mjs';

/** Moves when the way a result is made or landed changes, so an old entry is never reused for a new way. */
export const CACHE_VERSION = 1;

/** { kind, provider, model, parameters, prompt, negative, inputs: [sha256…], post } → 64 hex characters. */
export function requestKey({ kind, provider, model, parameters, prompt, negative, inputs, post }) {
  const body = stable({ cache: CACHE_VERSION, kind, provider, model, parameters: parameters ?? {}, prompt: prompt ?? '', negative: negative ?? '', inputs: inputs ?? [], post: post ?? null });
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/**
 * { name, sidecar } of a record in assets/gen/ made from this key whose files are still there; the record of
 * `prefer` first. null when there is none.
 */
export function findCached(pieceDir, genDir, key, prefer) {
  if (!existsSync(genDir)) return null;
  const found = [];
  for (const f of readdirSync(genDir).filter((n) => n.endsWith('.gen.json')).sort()) {
    let sidecar;
    try { sidecar = JSON.parse(readFileSync(join(genDir, f), 'utf8')); } catch { continue; }
    if (sidecar?.requestKey !== key || sidecar.cacheVersion !== CACHE_VERSION || !sidecar.file) continue;
    if (![sidecar.file, sidecar.words].filter(Boolean).every((rel) => existsSync(join(pieceDir, rel)))) continue;
    found.push({ name: f.slice(0, -'.gen.json'.length), sidecar });
  }
  return found.find((c) => c.name === prefer) ?? found[0] ?? null;
}
