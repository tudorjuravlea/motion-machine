// W-GEN-BRAND (SPEC §7): a generated asset the story uses was made before the brand changed, or with
// `--brand off`. `mm gen` keeps a record beside every asset (assets/gen/<name>.gen.json) with a hash of the
// style fields that steered it; when the current style hashes differently, generating again brings the
// asset on brand (`mm gen <kind> --piece … --again <name>`). Assets with no record, and records of
// work that was never steered (a transcript, an import), are not this rule's business.
import { existsSync, readFileSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { brandHash } from '../lib/brand-prompt.mjs';
import { rule } from '../lib/rule.mjs';

/** Every string in a value that names a file or folder under assets/. */
function assetRefs(value, out = new Set()) {
  if (typeof value === 'string') { if (/^assets\/[^\s]+$/.test(value)) out.add(value); } else if (Array.isArray(value)) value.forEach((v) => assetRefs(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => assetRefs(v, out));
  return out;
}

/** The record an asset reference points at: a prepared folder `assets/<name>/` → assets/gen/<name>.gen.json; a file under assets/gen/ → its sibling record. */
export function recordFor(ref) {
  if (ref.endsWith('/')) return `assets/gen/${posix.basename(ref)}.gen.json`;
  const m = /^assets\/gen\/([^/]+?)(?:\.words)?\.[a-z0-9]+$/i.exec(ref);
  return m ? `assets/gen/${m[1]}.gen.json` : null;
}

/** [{ asset, kind, reason }] for every used generated asset that is off the current brand. */
export function offBrand({ dir, story, style }) {
  const seen = new Set(), found = [];
  for (const ref of [...assetRefs(story)].sort()) {
    const rec = recordFor(ref);
    if (!rec || seen.has(rec) || !existsSync(join(dir, rec))) continue;
    seen.add(rec);
    let sc;
    try { sc = JSON.parse(readFileSync(join(dir, rec), 'utf8')); } catch { found.push({ asset: ref, kind: null, name: null, reason: `${rec} cannot be read` }); continue; }
    if (sc.brand === 'n/a' || sc.kind === 'import' || sc.kind === 'transcribe') continue;
    if (sc.brand === 'off') found.push({ asset: ref, kind: sc.kind, name: sc.name, reason: 'made with --brand off' });
    else if (sc.brandHash !== brandHash(sc.kind, style)) found.push({ asset: ref, kind: sc.kind, name: sc.name, reason: 'generated before the brand changed' });
  }
  return found;
}

export default async function (ctx) {
  const found = offBrand({ dir: ctx.dir, story: ctx.story, style: ctx.style });
  if (!found.length) return rule('W-GEN-BRAND', 'PASS', { measured: [], threshold: [] });
  const piece = relative(ctx.root, ctx.dir) || '.';
  const again = (f) => (f.name ? `\`mm gen ${f.kind} --piece ${piece} --again ${f.name}\`` : 'generate it again');
  return rule('W-GEN-BRAND', 'WARN', { measured: found.map((f) => f.asset), threshold: [], reason: found.map((f) => `${f.asset}: ${f.reason}; ${again(f)} brings it on brand`).join('; ') });
}
