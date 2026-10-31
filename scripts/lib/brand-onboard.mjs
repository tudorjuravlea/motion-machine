// What `mm brand onboard`, `set`, `font` and `logo` share: merging several captures of one brand by trust,
// running the role rules over the result, and keeping the outcome in a brand folder as sources/onboard.json
// (read by `mm brand sheet`), brand.json (read by the engine) and notes.md (read by people).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { chroma, normHex, roleOfColourName } from '../capture-brand.mjs';
import { ROOT } from './browser.mjs';
import { UsageError, slug } from './cli.mjs';
import { fenceLine } from './fence.mjs';
import { ROLES, pairsOf, reviewRoles } from './brand-roles.mjs';
import { validators } from './validate.mjs';

/** How far each kind of source is believed: a token file or DESIGN.md names its roles, a site is measured, stills are sampled. */
export const TRUST = { tokens: 3, designmd: 3, site: 2, stills: 1 };
export const ALL_ROLES = [...ROLES, 'surfaceInk'];
export const FACE_ROLES = ['display', 'text', 'mono'];
const today = () => new Date().toISOString().slice(0, 10);
export const readJson = (file, what = file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new UsageError(`${what}: ${e.message}`); } };
export const writeJson = (file, value) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

/** `#rgb` or `#rrggbb` (the # is optional) → `#RRGGBB`; null for anything else, a colour name included. */
export function hexOf(value) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value).trim());
  return m ? normHex(`#${m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]}`) : null;
}

/** `role=#hex` → [role, '#RRGGBB'], or a usage error naming what is wrong. */
export function parseRoleValue(text) {
  const m = /^([A-Za-z]+)=(.*)$/.exec(String(text));
  if (!m) throw new UsageError(`expected role=#rrggbb, got "${text}"`);
  if (!ALL_ROLES.includes(m[1])) throw new UsageError(`unknown role "${m[1]}": the roles are ${ALL_ROLES.join(', ')}`);
  const hex = hexOf(m[2]);
  if (!hex) throw new UsageError(`${m[1]}=${m[2]}: the value must be a hex colour (#rrggbb)`);
  return [m[1], hex];
}

/** The command that answers a question: sets one role to one value. */
export const setCommand = (dir, role, value) => `mm brand set "${dir}" ${role}=${value}`;

// ---------------------------------------------------------------- merging captures

/**
 * Several captures → one input for the role rules. `sources` is [{ kind, trust, mapped, tokens? }] in the order
 * given; `hand` is { role: '#RRGGBB' } typed by the user. For each role the highest-trust capture that measured or
 * named it wins; when every capture derived it, the highest-trust derived value stands. Returns
 * { input: {role: {hex, confidence, source, evidence}}, candidates: {role: [{hex, source, note}]} } where the
 * candidates are the other readings of a role that differ from the one chosen.
 */
export function mergeRoles(sources, hand = {}) {
  const input = {}; const candidates = {};
  for (const role of ROLES) {
    const seen = sources.map((s, order) => ({ s, order, r: s.mapped.roles[role] })).filter((x) => x.r)
      .map(({ s, order, r }) => ({ kind: s.kind, trust: s.trust, order, hex: normHex(r.hex), derived: !!r.derived, evidence: r.evidence }));
    const ranked = [...seen].sort((a, b) => (a.derived - b.derived) || (b.trust - a.trust) || (a.order - b.order));
    const pick = ranked[0];
    if (hand[role]) input[role] = { hex: hand[role], confidence: 'set', source: 'hand', evidence: 'typed with --color' };
    else input[role] = { hex: pick.hex, confidence: pick.derived ? 'guess' : pick.trust >= 3 ? 'exact' : 'measured', source: pick.kind, evidence: pick.evidence };
    const chosen = input[role].hex;
    const others = ranked.filter((c) => !c.derived && c.hex !== chosen).map((c) => ({ hex: c.hex, source: c.kind, note: shortNote(c.evidence) }));
    for (const s of sources) {
      for (const c of s.tokens?.colors ?? []) {
        const named = roleOfColourName(c.name);
        if (named === role || (role === 'accent' && !named && chroma(c.hex) >= 0.2)) others.push({ hex: normHex(c.hex), source: s.kind, note: `named "${c.name}"` });
      }
    }
    candidates[role] = others.filter((c, i) => c.hex !== chosen && others.findIndex((x) => x.hex === c.hex) === i);
  }
  return { input, candidates };
}

/** The part of an evidence line before its figures or example: "most saturated colour on buttons, links and headings". */
const shortNote = (evidence) => String(evidence).split(/ \(|, e\.g\./)[0].slice(0, 60);

/** The faces of several captures: per role the highest-trust capture that read it from the source; a stand-in the capture itself asked about comes last. */
export function mergeFaces(sources) {
  const faces = {};
  for (const role of FACE_ROLES) {
    const have = sources.map((s, order) => ({ s, order, f: s.mapped.faces[role] })).filter((x) => x.f);
    have.sort((a, b) => (/^ASK:/.test(a.f.evidence) - /^ASK:/.test(b.f.evidence)) || (b.s.trust - a.s.trust) || (a.order - b.order));
    if (have[0]) faces[role] = have[0].f;
  }
  return { faces, seen: [...new Set(sources.flatMap((s) => s.mapped.seen ?? []))] };
}

// ---------------------------------------------------------------- the state kept in a brand folder

export const onboardFile = (dir) => join(dir, 'sources', 'onboard.json');
export const readState = (dir) => (existsSync(onboardFile(dir)) ? readJson(onboardFile(dir), 'sources/onboard.json') : null);

/** The brand folder as an absolute path; a usage error when it holds no brand.json. */
export function brandFolder(folder, cwd = process.cwd()) {
  const dir = resolve(cwd, folder);
  if (!existsSync(join(dir, 'brand.json'))) throw new UsageError(`${dir} holds no brand.json; make a brand folder with: mm brand init <folder>`);
  return dir;
}

/** What the folder says when nothing was onboarded: the colours in brand.json as measured (a surfaceInk, which only a person writes, as set). */
export function baselineState(dir) {
  const brand = readJson(join(dir, 'brand.json'), 'brand.json');
  const roles = {};
  for (const role of ALL_ROLES) {
    const hex = brand.color?.[role];
    if (hex) roles[role] = { hex: normHex(hex), confidence: role === 'surfaceInk' ? 'set' : 'measured', source: 'hand', evidence: 'read from brand.json', fixed: null };
  }
  const review = reviewRoles(rolesInput({ roles }));
  return {
    version: 1, brand: brand.name, sources: [], roles, accentText: brand.composition?.accentText !== false, pairs: pairsOf(colourMap(roles)),
    warnings: review.warnings, notes: review.notes, ask: review.ask, fonts: [], logo: null,
  };
}

export const colourMap = (roles) => Object.fromEntries(Object.entries(roles).map(([r, x]) => [r, x.hex]));

/** The input of the role rules from a stored state: automatic fixes undone (so the rules redo them against the new colours) and a derived surfaceInk dropped. */
export function rolesInput(state) {
  const input = {};
  for (const role of ALL_ROLES) {
    const x = state.roles[role];
    if (!x || (role === 'surfaceInk' && !['exact', 'set'].includes(x.confidence))) continue;
    input[role] = { hex: x.fixed ? x.fixed.from : x.hex, confidence: x.confidence, source: x.source, evidence: x.evidence };
  }
  return input;
}

/** Gives the questions their commands and the other readings of a role as further options. */
function finishAsk(ask, dir, candidates = {}) {
  const same = (a, b) => String(a).toUpperCase() === String(b).toUpperCase();
  for (const a of ask) {
    for (const c of candidates[a.role] ?? []) if (!a.options.some((o) => same(o.value, c.hex))) a.options.push({ label: `${c.hex} (${c.source}: ${c.note})`, value: c.hex });
    for (const o of a.options) o.command = setCommand(dir, a.role, o.value);
  }
  return ask;
}

/**
 * Runs the role rules and assembles the state: { state, brandColor, accentText }. `fonts` and `logo` are carried
 * as given; `candidates` are extra options for the questions.
 */
export function reviewState({ dir, brandName, sources, input, candidates, fonts, logo }) {
  const review = reviewRoles(input);
  const roles = Object.fromEntries(ALL_ROLES.filter((r) => review.roles[r]).map((r) => {
    const x = review.roles[r];
    return [r, { hex: x.hex, confidence: x.confidence, source: x.source, evidence: x.evidence, fixed: x.fixed ?? null }];
  }));
  const ask = review.ask;
  // a named accent that looks like the ink or the canvas is still worth a question: the rules leave a named colour alone
  if (review.warnings.some((w) => w.id === 'accent-like-ink' || w.id === 'accent-like-canvas') && !ask.some((a) => a.role === 'accent') && roles.accent.confidence !== 'set') {
    ask.push({ id: 'accent', role: 'accent', question: 'The accent looks like the ink or the canvas. What is the brand colour?', options: [{ label: 'keep it', value: roles.accent.hex }] });
  }
  const state = {
    version: 1, brand: brandName, sources, roles, accentText: review.accentText, pairs: pairsOf(colourMap(roles)),
    warnings: review.warnings, notes: review.notes, ask: finishAsk(ask, dir, candidates), fonts, logo,
  };
  return { state, review };
}

/** A copy of brand.json with the state's colours and accentText written in; validated, else a usage error naming the path. */
export function brandWith(brand, state, type) {
  const next = structuredClone(brand);
  next.color = Object.fromEntries(ALL_ROLES.filter((r) => state.roles[r]).map((r) => [r, state.roles[r].hex]));
  next.composition = { ...next.composition, accentText: state.accentText };
  if (type) next.type = { ...next.type, ...type };
  return checked(next);
}

/** The brand half, or a usage error naming every path that fails the schema. */
export function checked(brand) {
  const v = validators();
  if (!v.brand(brand)) throw new UsageError(`the brand would be invalid: ${(v.brand.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ')}`);
  return brand;
}

// ---------------------------------------------------------------- notes

const cell = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The review part of a notes section: role table, fixes, warnings, notes and open questions. */
export function reviewLines(state) {
  const lines = ['| role | hex | confidence | source | evidence |', '|---|---|---|---|---|'];
  for (const r of ALL_ROLES) if (state.roles[r]) lines.push(`| ${r} | ${state.roles[r].hex} | ${state.roles[r].confidence} | ${state.roles[r].source} | ${cell(fenceLine(state.roles[r].evidence, 'evidence'))} |`);
  const fixes = ALL_ROLES.filter((r) => state.roles[r]?.fixed);
  lines.push('', 'Fixes:', ...(fixes.length ? fixes.map((r) => `- ${r}: ${state.roles[r].fixed.from} → ${state.roles[r].fixed.to} (${state.roles[r].fixed.why})`) : ['- none']));
  lines.push('', 'Warnings:', ...(state.warnings.length ? state.warnings.map((w) => `- ${w.id}: ${w.text}`) : ['- none']));
  if (state.notes.length) lines.push('', 'Notes:', ...state.notes.map((n) => `- ${n}`));
  lines.push('', 'Open questions:');
  if (!state.ask.length) lines.push('- none');
  for (const a of state.ask) {
    lines.push(`- ${a.id}: ${a.question}`);
    for (const o of a.options) lines.push(`  - ${o.label}: \`${o.command}\``);
  }
  return lines;
}

/** Appends a dated section to notes.md; earlier notes stay as they are. */
export function appendNotes(dir, title, lines) {
  const file = join(dir, 'notes.md');
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, `${before}${before && !before.endsWith('\n') ? '\n' : ''}\n## ${title} ${today()}\n\n${lines.join('\n')}\n`);
}

// ---------------------------------------------------------------- fonts

/** The licence a licence text states: SIL OFL 1.1, Apache 2.0, else private-use (nothing grants more). */
export function licenceOf(text) {
  if (/SIL OPEN FONT LICENSE|SIL OFL|OPEN FONT LICENSE/i.test(text ?? '')) return 'SIL OFL 1.1';
  if (/Apache License/i.test(text ?? '')) return 'Apache 2.0';
  return 'private-use';
}

/** The licence of a bundled family, read from the LICENSE.txt beside its files; unknown when there is none. */
export function bundledLicence(face) {
  const file = face.files?.[0]?.src && join(ROOT, dirname(face.files[0].src), 'LICENSE.txt');
  return file && existsSync(file) ? licenceOf(readFileSync(file, 'utf8')) : 'unknown';
}

/** Copies a bundled face's files (and the licence beside them) into the folder; returns the face with folder-relative srcs. */
export function placeBundledFace(dir, face) {
  const out = structuredClone(face);
  for (const f of out.files) {
    const abs = resolve(ROOT, f.src);
    const rel = `fonts/${slug(out.family)}/${basename(abs)}`;
    mkdirSync(join(dir, dirname(rel)), { recursive: true });
    copyFileSync(abs, join(dir, rel));
    const licence = join(dirname(abs), 'LICENSE.txt');
    const target = join(dir, dirname(rel), 'LICENSE.txt');
    if (existsSync(licence) && !existsSync(target)) copyFileSync(licence, target);
    f.src = rel;
  }
  return out;
}
