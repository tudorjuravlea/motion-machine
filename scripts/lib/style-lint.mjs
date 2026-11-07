// Lint for shipped styles. A motion half must carry the brief another agent needs (essence, nativeMoves,
// variation), and two presets must not differ only in colour: a recolour is a palette, not a style.
// Exported for scripts/pattern-lint.mjs-style callers and tests; it reads only, and prints nothing.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './browser.mjs';

/** The fields a motion half must carry to be handed to another agent. */
export const BRIEF_FIELDS = ['essence', 'nativeMoves', 'variation'];
/** What decides whether two presets are the same style: the motion half, the finish, the ground and the surface. */
export const STYLE_FIELDS = ['motion', 'sound', 'transitions', 'entrances', 'pacing', 'gate', 'finish', 'ground', 'surface'];

const read = (f) => JSON.parse(readFileSync(f, 'utf8'));
const jsonIn = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => ({ file: f, name: f.replace(/\.json$/, ''), data: read(join(dir, f)) })) : []);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Findings for one motion half: one per missing brief field. */
export function motionBriefFindings(name, half) {
  return BRIEF_FIELDS.filter((k) => !half?.[k]).map((k) => ({ rule: 'S-BRIEF', subject: name, message: `motion half "${name}" has no ${k}` }));
}

/** Pairs of presets whose motion half, finish, ground and surface are equal while their colour differs: [{ pair: [a, b] }]. */
export function recolourPairs(presets) {
  const out = [];
  for (let i = 0; i < presets.length; i++) {
    for (let j = i + 1; j < presets.length; j++) {
      const a = presets[i], b = presets[j];
      if (STYLE_FIELDS.every((k) => same(a[k], b[k])) && !same(a.color, b.color)) out.push({ pair: [a.name, b.name] });
    }
  }
  return out;
}

/** [{ rule, subject, message }] for the styles under `root`: S-BRIEF for a motion half, S-RECOLOUR for a preset pair. */
export function lintStyles(root = ROOT) {
  const findings = [];
  for (const h of jsonIn(join(root, 'styles/motion'))) findings.push(...motionBriefFindings(h.name, h.data));
  const presets = jsonIn(join(root, 'styles/presets')).map((p) => ({ ...p.data, name: p.data.name ?? p.name }));
  for (const { pair } of recolourPairs(presets)) {
    findings.push({ rule: 'S-RECOLOUR', subject: pair.join(' + '), message: `presets "${pair[0]}" and "${pair[1]}" differ only in colour (same motion half, finish, ground and surface): a recolour, not a style` });
  }
  return findings;
}
