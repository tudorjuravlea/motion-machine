// mm release-check [--root <dir>] [--only R-BRAND,...] [--json]   (SPEC §8, AXIOM 3)
// The sweep before anything is published. Exit 0 every sweep passed, 1 any finding, 2 setup or usage.
//   R-BRAND         the word lists, case-insensitive, over every tracked file and path: the private list
//                   docs/private/brand-words.txt (git-ignored, the author's; absent is reported, not fatal)
//                   and the shipped generic patterns in contracts/brand-words.txt. A plain line is a whole
//                   word; a line with regex syntax is a pattern; `@runtime <pattern>` applies only under
//                   runtime/, patterns/, pieces/
//   R-SECRET        key and token shapes, private keys, `api_key=`/`password=` assignments, .env/.pem/.key/.npmrc files
//   R-PATH          home-folder paths, in file text and in file names: absolute (macOS, Linux and Windows user folders,
//                   git-bash and WSL drive paths, JSON-escaped slashes, the dashed project-folder form) and home-relative
//                   (a tilde, then a personal folder such as Downloads)
//   R-EMAIL         any e-mail address in a text file, except the example domains (example.com, .org, .net, *.example),
//                   no-reply addresses and licence texts
//   R-URL           http(s) URLs in runtime/, patterns/, pieces/ (XML namespaces and licence texts excepted)
//   R-LICENSE       LICENSE holds the Apache-2.0 text (and package.json says Apache-2.0)
//   R-FONT-LICENSE  every folder with font files holds an SIL OFL licence
//   R-PATTERNS      every pattern passes pattern-lint
//   R-GOLDEN        no golden-* piece's out/check.json holds a FAIL; a piece with no report is not
//                   reported, and with no report at all the sweep is SKIP (a fresh copy has none)
//   R-STRATEGY      no strategy file is tracked: DECISIONS, LESSONS, PHILOSOPHY, CHANGELOG,
//                   STATUS or CHRONICLE (.md) anywhere, nor anything under docs/evals or
//                   docs/plans; planning and decision records are not kept in this repository
//   R-HISTORY       no history marker in a tracked text file or in a file or folder name: decision and finding ids,
//                   milestone and plan labels, dated notes, version narratives, round narratives,
//                   pointers to private files, philosophy framing (public files state rules, not how they were
//                   decided); runtime/vendor/ and fixtures/release/ are exempt. Binary files (images, video, fonts)
//                   are not read: their embedded metadata is not swept here
//   R-DUP           no tracked file or folder named like a Finder or iCloud duplicate: `name 2.ext`,
//                   `name copy.ext`, `name copy 2.ext` (a space, then a number or `copy`, before the extension)
// "Tracked" is `git ls-files` when --root is a repository top level, else every file under it (the
// fixtures in fixtures/release/ are plain folders). fixtures/release/ is the sweeps' own negative
// corpus and is never swept from the repository root.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { UsageError, runMain } from './lib/cli.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = dirname(HERE);
export const SWEEPS = ['R-BRAND', 'R-SECRET', 'R-PATH', 'R-EMAIL', 'R-URL', 'R-LICENSE', 'R-FONT-LICENSE', 'R-PATTERNS', 'R-GOLDEN', 'R-STRATEGY', 'R-HISTORY', 'R-DUP'];

const BINARY = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.mp4', '.mov', '.webm', '.wav', '.mp3', '.ogg', '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.zip', '.gz']);
const MAX_TEXT = 2 * 1024 * 1024;
const FONT_EXT = new Set(['.woff2', '.woff', '.ttf', '.otf']);
const posix = (p) => p.split(sep).join('/');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The files the sweeps look at: relative, forward-slashed paths. */
export function listFiles(root) {
  let files;
  if (existsSync(join(root, '.git'))) {
    try { files = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 }).split('\0').filter(Boolean); }
    catch (e) { throw new UsageError(`git ls-files failed in ${root}: ${e.message}`); }
    files = files.filter((f) => existsSync(join(root, f)));
  } else {
    files = [];
    const walk = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (['.git', 'node_modules', '.DS_Store'].includes(e.name)) continue;
        const abs = join(dir, e.name);
        if (e.isDirectory()) walk(abs); else files.push(posix(relative(root, abs)));
      }
    };
    walk(root);
  }
  return files.filter((f) => !f.startsWith('fixtures/release/')).sort();
}

const textOf = (root, f) => {
  if (BINARY.has(extname(f).toLowerCase())) return null;
  const abs = join(root, f);
  if (statSync(abs).size > MAX_TEXT) return null;
  const buf = readFileSync(abs);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');   // a UTF-16 text file with a byte-order mark
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
  return buf.subarray(0, 8000).includes(0) ? null : buf.toString('utf8');
};

/** Lines of a word list: comments (#) and blanks dropped. */
const listLines = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

/**
 * A word-list line as a RegExp: a line with regex syntax (brackets, groups, quantifiers, anchors,
 * backslashes, `re:` prefix, or /slashes/flags) is a pattern; anything else is a whole word, matched
 * case-insensitively and only when not inside a longer word.
 */
export function wordRegex(line) {
  const slashed = /^\/(.+)\/([a-z]*)$/.exec(line);
  if (slashed) return new RegExp(slashed[1], slashed[2].includes('i') ? slashed[2] : `${slashed[2]}i`);
  if (line.startsWith('re:')) return new RegExp(line.slice(3), 'i');
  if (/[\][(){}\\^$|*+?]/.test(line)) return new RegExp(line, 'i');
  return new RegExp(`(?<![A-Za-z0-9])${escapeRe(line)}(?![A-Za-z0-9])`, 'i');
}

const finding = (file, line, text, extra = {}) => ({ file, line, text, ...extra });
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

/** Runs `regexes` over every text file in `files`; one finding per match. */
function scan(root, files, regexes, { skip = () => false, label = (m) => m[0], scanPath = false } = {}) {
  const found = [];
  for (const f of files) {
    if (skip(f)) continue;
    if (scanPath) for (const [name, re] of regexes) { const m = new RegExp(re.source, re.flags.replace('g', '')).exec(f); if (m) found.push(finding(f, 0, label(m, name), { name, inPath: true })); }
    const text = textOf(root, f);
    if (text == null) continue;
    for (const [name, re0] of regexes) {
      const re = new RegExp(re0.source, re0.flags.includes('g') ? re0.flags : `${re0.flags}g`);
      for (const m of text.matchAll(re)) found.push(finding(f, lineOf(text, m.index), label(m, name), { name }));
    }
  }
  return found;
}

const SECRET_PATTERNS = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['API key (sk-)', /\bsk-[A-Za-z0-9]{32,}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['bearer token', /\bBearer\s+[A-Za-z0-9._~+/-]{24,}={0,2}/],
  ['api_key assignment', /\bapi[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{16,}/i],
  ['password assignment', /\bpassword\s*[:=]\s*["'][^"'\s]{4,}["']/i],
];
const SECRET_FILES = /(^|\/)(\.env(\.(?!example$|sample$|template$)[^/]*)?|\.npmrc|credentials(\.[a-z]+)?|id_(rsa|dsa|ecdsa|ed25519)|[^/]+\.(pem|key|p12|pfx))$/i;

const PATH_PATTERNS = [
  ['macOS home path', /(?<![A-Za-z0-9_.-])\/Users\/[A-Za-z0-9._-]+/],
  ['Linux home path', /(?<![A-Za-z0-9_.-])\/home\/[A-Za-z0-9._-]+/],
  ['Windows home path', /\b[A-Za-z]:\\+Users\\+[A-Za-z0-9._-]+/],
  // git-bash and WSL drive paths: a drive letter (after /mnt/ on WSL), then the user folder
  ['drive path', /(?<![A-Za-z0-9_.-])\/(?:mnt\/)?[A-Za-z]\/Users\/[A-Za-z0-9._-]+/],
  // a project folder named after its path, as some tools do: dashes for slashes
  ['dashed project path', /(?<![A-Za-z0-9])-Users-[A-Za-z0-9._]+-/],
  // the same user folders with their slashes escaped for JSON
  ['JSON-escaped home path', /(?<![A-Za-z0-9_.-])\\\/(?:Users|home)\\\/[A-Za-z0-9._-]+/],
  // a named personal folder (the shared tool caches ~/.cache, ~/.npm, ~/.local are not personal), so the `~/` of a regex literal (`/~/g`) or a JSON-pointer escape is not a hit
  ['home-relative path', /(?<![\w.~-])~\\?\/(?:Downloads|Documents|Desktop|Library|Pictures|Movies|Music|code|\.claude|\.config|\.ssh)(?![\w-])/],
];

// Every address is personal unless it is an example, a no-reply address or part of a licence text.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const EMAIL_OK = /noreply|@(?:[a-z0-9-]+\.)*example(?:\.(?:com|org|net))?$/i;

const URL_ROOTS = ['runtime/', 'patterns/', 'pieces/'];
const URL_RE = /\bhttps?:\/\/[^\s"'<>)`\]]+/i;
const URL_OK = /^https?:\/\/www\.w3\.org\//i;   // XML namespaces name a vocabulary; nothing is fetched
const isLicenceFile = (f) => /(^|\/)(LICENSE|OFL|NOTICE)[^/]*$/i.test(f);
// vendored third-party code: kept unmodified, credited in NOTICE, never fetched; its comments may cite URLs
const isVendored = (f) => f.startsWith('runtime/vendor/');

// ---- the sweeps ------------------------------------------------------------------------------

/** [{ re, scope }] for the lines of a word list; scope 'runtime' for an `@runtime ` line. A line that is not a valid pattern is a usage error naming `name:line`. */
function listEntries(text, name) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  lines.forEach((raw, i) => {
    const l = raw.trim();
    if (!l || l.startsWith('#')) return;
    const runtime = l.startsWith('@runtime ');
    try { entries.push({ line: l, re: wordRegex(runtime ? l.slice(9).trim() : l), scope: runtime ? 'runtime' : null }); }
    catch { throw new UsageError(`${name}:${i + 1}: not a valid pattern: ${l}`); }
  });
  return entries;
}

function brandSweep(root, files) {
  const shipped = join(root, 'contracts/brand-words.txt'), priv = join(root, 'docs/private/brand-words.txt');
  const own = new Set(['contracts/brand-words.txt', 'docs/private/brand-words.txt']);
  const entries = [];
  if (existsSync(shipped)) entries.push(...listEntries(readFileSync(shipped, 'utf8'), 'contracts/brand-words.txt'));
  const havePrivate = existsSync(priv);
  if (havePrivate) entries.push(...listEntries(readFileSync(priv, 'utf8'), 'docs/private/brand-words.txt'));
  const notes = [havePrivate ? 'private list read' : 'docs/private/brand-words.txt is absent: only the shipped patterns were swept', existsSync(shipped) ? null : 'contracts/brand-words.txt is absent'].filter(Boolean);
  const found = [];
  const everywhere = entries.filter((e) => !e.scope).map((e) => [e.line, e.re]);
  found.push(...scan(root, files, everywhere, { skip: (f) => own.has(f), label: (m) => `"${m[0]}"`, scanPath: true }));
  for (const f of files.filter((x) => URL_ROOTS.some((r) => x.startsWith(r)) && !isLicenceFile(x) && !isVendored(x))) {   // `@runtime` lines
    const text = textOf(root, f);
    if (text == null) continue;
    for (const e of entries.filter((x) => x.scope)) {
      for (const m of text.matchAll(new RegExp(e.re.source, 'gi'))) if (!URL_OK.test(text.slice(m.index, m.index + 40))) found.push(finding(f, lineOf(text, m.index), `"${m[0]}" (${e.line})`, { name: e.line }));
    }
  }
  return { findings: found, notes, scanned: files.length, words: entries.length };
}

function secretSweep(root, files) {
  const found = files.filter((f) => SECRET_FILES.test(f)).map((f) => finding(f, 0, 'a file that holds credentials', { name: 'secret file' }));
  found.push(...scan(root, files, SECRET_PATTERNS, { label: (m, name) => `${name}: ${m[0].slice(0, 12)}...` }));
  return { findings: found, scanned: files.length };
}

function pathSweep(root, files) {
  return { findings: scan(root, files, PATH_PATTERNS, { label: (m, name) => `${name}: ${m[0]}`, scanPath: true }), scanned: files.length };
}

function emailSweep(root, files) {
  const inScope = files.filter((f) => !isLicenceFile(f) && !isVendored(f));
  const found = [];
  for (const f of inScope) {
    const text = textOf(root, f);
    if (text == null) continue;
    for (const m of text.matchAll(new RegExp(EMAIL_RE.source, 'g'))) if (!EMAIL_OK.test(m[0])) found.push(finding(f, lineOf(text, m.index), `e-mail address: ${m[0]}`, { name: 'e-mail' }));
  }
  return { findings: found, scanned: inScope.length };
}

function urlSweep(root, files) {
  const inScope = files.filter((f) => URL_ROOTS.some((r) => f.startsWith(r)) && !isLicenceFile(f) && !isVendored(f));
  const found = [];
  for (const f of inScope) {
    const text = textOf(root, f);
    if (text == null) continue;
    for (const m of text.matchAll(new RegExp(URL_RE.source, 'gi'))) if (!URL_OK.test(m[0])) found.push(finding(f, lineOf(text, m.index), m[0], { name: 'URL' }));
  }
  return { findings: found, scanned: inScope.length };
}

function licenseSweep(root) {
  const found = [];
  const lic = ['LICENSE', 'LICENSE.txt', 'LICENSE.md'].map((n) => join(root, n)).find((p) => existsSync(p));
  if (!lic) found.push(finding('LICENSE', 0, 'no LICENSE file at the repository root'));
  else {
    const text = readFileSync(lic, 'utf8');
    for (const [need, why] of [[/Apache License/, 'the title'], [/Version 2\.0, January 2004/, 'the version line'], [/TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION/, 'the terms heading']]) {
      if (!need.test(text)) found.push(finding(basename(lic), 0, `is not the Apache-2.0 text: ${why} is missing`));
    }
  }
  const pkg = join(root, 'package.json');
  if (existsSync(pkg)) {
    try { const l = JSON.parse(readFileSync(pkg, 'utf8')).license; if (l !== 'Apache-2.0') found.push(finding('package.json', 0, `license is ${JSON.stringify(l)}, not "Apache-2.0"`)); }
    catch { found.push(finding('package.json', 0, 'is not valid JSON')); }
  }
  return { findings: found, scanned: 1 };
}

function fontLicenseSweep(root, files) {
  const dirs = new Map();
  for (const f of files) if (FONT_EXT.has(extname(f).toLowerCase())) dirs.set(dirname(f), (dirs.get(dirname(f)) ?? 0) + 1);
  const found = [];
  for (const [dir] of dirs) {
    const lic = files.filter((f) => dirname(f) === dir && /(^|\/)(LICENSE|OFL)[^/]*$/i.test(f));
    const ok = lic.some((f) => /SIL OPEN FONT LICENSE/i.test(textOf(root, f) ?? ''));
    if (!ok) found.push(finding(dir, 0, lic.length ? 'its licence file is not the SIL Open Font License' : 'font files with no LICENSE.txt or OFL.txt beside them'));
  }
  return { findings: found, scanned: dirs.size };
}

async function patternsSweep(root) {
  const dir = join(root, 'patterns');
  if (!existsSync(dir)) return { findings: [finding('patterns', 0, 'no patterns/ folder')], scanned: 0 };
  const { lintRoot } = await import('./pattern-lint.mjs');
  const res = lintRoot(dir, { provenance: join(root, 'PROVENANCE.md') });
  const found = res.patterns.filter((p) => !p.complete).map((p) => {
    const fails = p.rules.filter((r) => r.status === 'FAIL');
    return finding(`patterns/${p.ref}`, 0, fails.map((r) => `${r.id}: ${r.evidence?.reason ?? 'failed'}`).join('; ') || 'incomplete', { name: 'pattern-lint' });
  });
  return { findings: found, scanned: res.patterns.length };
}

function goldenSweep(root, files) {
  const pieces = [...new Set(files.filter((f) => /^pieces\/golden-[^/]+\/story\.json$/.test(f)).map((f) => dirname(f)))];
  if (!pieces.length) return { findings: [finding('pieces/golden-*', 0, 'no golden pieces found in pieces/')], scanned: 0 };
  const found = [];
  let read = 0;
  for (const p of pieces) {
    const file = join(root, p, 'out', 'check.json');
    if (!existsSync(file)) continue;   // no report is nothing to report (out/ is never in git, so a fresh copy has none)
    read++;
    let rules;
    try { rules = JSON.parse(readFileSync(file, 'utf8')).rules ?? []; } catch { found.push(finding(`${p}/out/check.json`, 0, 'is not valid JSON')); continue; }
    const failed = rules.filter((r) => r.status === 'FAIL').map((r) => r.id);
    if (failed.length) found.push(finding(`${p}/out/check.json`, 0, `last check failed: ${failed.join(', ')}`));
    else if (!rules.length) found.push(finding(`${p}/out/check.json`, 0, 'holds no rule rows'));
  }
  return { findings: found, scanned: read, skip: read === 0 };
}

// Finder's "Duplicate" (`name copy.ext`, `name copy 2.ext`) and Finder or iCloud "keep both" (`name 2.ext`).
const DUP_NAME = /^(.+?) (?:copy(?: \d+)?|\d+)(\.[^./ ]+)?$/i;
/** The duplicate-looking segment of a path, or null. */
export function duplicateName(path) {
  for (const seg of path.split('/')) if (DUP_NAME.test(seg)) return seg;
  return null;
}

const STRATEGY_FILES = /(^|\/)(DECISIONS|LESSONS|PHILOSOPHY|CHANGELOG|STATUS|CHRONICLE)\.md$/i;
const STRATEGY_DIRS = /^docs\/(evals|plans)\//;
function strategySweep(root, files) {
  const found = files.filter((f) => STRATEGY_FILES.test(f) || STRATEGY_DIRS.test(f))
    .map((f) => finding(f, 0, 'planning and decision records are not kept in this repository', { name: 'strategy' }));
  return { findings: found, scanned: files.length };
}

// Public files state rules, not how they were decided. Each rule: [name, pattern, options]. The
// patterns are written so that this source holds no marker itself (`strategy\s+vault`, `Phoeni[x]`).
const SOURCE_TEXT = /\.(md|mjs|js|css|html|yml|yaml|sh)$/;
// Path data is exempt (`d="…"`, or in an svg a line of nothing but path commands and numbers); the rest of an svg is read.
const inPathData = (f, line, at) => /\bd="[^"]*$/.test(line.slice(0, at)) || (f.endsWith('.svg') && /^[\s\d.,eE+\-MmLlHhVvCcSsQqTtAaZz"']*$/.test(line));
const HISTORY_RULES = [
  ['decision id', /\bdec-\d{3}\b/i],
  ['finding id', /\bE\d+(?:r\d+)?-\d{2,}\b|\bM\d[a-z]?-\d{2,}\b|\bGV\d-\d+\b|\bGAP-D\d+\b/, { notIn: inPathData }],
  ['milestone or plan id', /\b[Gg]oal [A-Z]?\d+[a-d]?\b|\bplan (?:Goal|M\d|Task)\b|\bM[1-9][a-z]? Task \d+\b|\b(?:M[1-9][a-z]?|E[1-9](?:r\d)?) (?:proof|CLIs|review|evaluator|lane|pass)\b|\((?:M[1-9][a-z]?|E[1-9](?:r\d)?)[,)]|(?<![\w.-])(?:M[1-9][a-z]?|E[1-9]):\s|\b[Ee]valuation E\d\b|\.tmp-m\d|\b(?:design|spec) D\d+\b|\bv1\splan\b|\bgolden v\d\b|\bstudio\s+plan\b/, { notIn: inPathData }],
  ['dated note', /\b20\d\d-[01]\d-[0-3]\d\b/, { only: SOURCE_TEXT, notIn: (f, line) => (/\.capture-notes\.md$/.test(f) && /^Source: .*\bCaptured \d{4}-\d\d-\d\d\b/.test(line)) || /\bat (?:commit )?`[0-9a-f]{7,40}`/.test(line), licenceOk: true }],
  ['version narrative', /^\s*>\s*\*\*v\d+\.\d+\*\*|\bSPEC §\d+, v\d+\.\d+\b/],
  ['round narrative', /\b(?:fix|evaluation|eval|adversarial) rounds?\b|\bRound\s0\b|\bsince round \d\b|\bround-\d re-scope\b|\bv\d (?:re-cut|exports|golden)\b|\bre-cut v\d\b|\bsupersede[d]\b|\blessons? \d+\b|\bcorrected\s+from\b|\brecord the lesson\b/i, { licenceOk: true }],
  ['private-record pointer', /docs\/private\/(?!brand-words\.txt\b)[\w.*-]|\bprivate (?:repository|vault|record)s?\b|\bstrategy[\s_-]*vault\b|\bmaintainers keep\b|\brecorded by the maintainers\b/i],
  ['private-record pointer', /\b(?:DECISIONS|LESSONS|PHILOSOPHY|CHRONICLE)\.md\b/],
  ['philosophy framing', /\bPhoeni[x]\b|\beternal layer\b/i],
];

function historySweep(root, files) {
  const found = [];
  let scanned = 0;
  const hits = (rules, f, line, onHit) => {
    for (const [name, re, o] of rules) {
      for (const m of line.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
        if (o?.notIn?.(f, line, m.index)) continue;
        onHit(name, m);
      }
    }
  };
  for (const f of files) {
    if (isVendored(f)) continue;
    // a marker in a file or folder name (the path is read as one line; a date is not a marker there)
    hits(HISTORY_RULES.filter(([, , o]) => !o?.only), f, f, (name, m) => found.push(finding(f, 0, `${name}: ${m[0].trim()}`, { name, inPath: true })));
    const text = textOf(root, f);
    if (text == null) continue;
    scanned++;
    const rules = HISTORY_RULES.filter(([, , o]) => (!o?.only || o.only.test(f)) && !(o?.licenceOk && f === 'NOTICE'));   // NOTICE may carry upstream dates and wording
    text.split('\n').forEach((line, i) => hits(rules, f, line, (name, m) => found.push(finding(f, i + 1, `${name}: ${m[0].trim()}`, { name }))));
  }
  return { findings: found, scanned };
}

function dupSweep(root, files) {
  const found = [];
  for (const f of files) { const seg = duplicateName(f); if (seg) found.push(finding(f, 0, `"${seg}" is named like a Finder or iCloud duplicate`, { name: 'duplicate' })); }
  return { findings: found, scanned: files.length };
}

/** Runs the sweeps; returns { root, sweeps: [{ id, status, findings, notes, scanned }], code }. */
export async function releaseCheck({ root = REPO, only = null } = {}) {
  root = resolve(root);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new UsageError(`--root is not a folder: ${root}`);
  for (const id of only ?? []) if (!SWEEPS.includes(id)) throw new UsageError(`unknown sweep "${id}"; the sweeps are ${SWEEPS.join(', ')}`);
  const files = listFiles(root);
  const run = {
    'R-BRAND': () => brandSweep(root, files), 'R-SECRET': () => secretSweep(root, files), 'R-PATH': () => pathSweep(root, files), 'R-EMAIL': () => emailSweep(root, files), 'R-URL': () => urlSweep(root, files),
    'R-LICENSE': () => licenseSweep(root), 'R-FONT-LICENSE': () => fontLicenseSweep(root, files), 'R-PATTERNS': () => patternsSweep(root), 'R-GOLDEN': () => goldenSweep(root, files), 'R-STRATEGY': () => strategySweep(root, files), 'R-HISTORY': () => historySweep(root, files),
    'R-DUP': () => dupSweep(root, files),
  };
  const sweeps = [];
  for (const id of SWEEPS.filter((s) => !only || only.includes(s))) {
    const r = await run[id]();
    // SKIP: the sweep found nothing it could read (R-GOLDEN in a fresh copy); it neither passes nor fails
    sweeps.push({ id, status: r.findings.length ? 'FAIL' : r.skip ? 'SKIP' : 'PASS', findings: r.findings, notes: r.notes ?? [], scanned: r.scanned });
  }
  return { root, sweeps, code: sweeps.some((s) => s.status === 'FAIL') ? 1 : 0 };
}

const SHOWN = 12;
export function formatReport(result) {
  const out = [];
  for (const s of result.sweeps) {
    out.push(`${s.status}  ${s.id}  (${s.scanned} scanned${s.findings.length ? `, ${s.findings.length} finding${s.findings.length === 1 ? '' : 's'}` : ''})`);
    for (const n of s.notes) out.push(`      note: ${n}`);
    for (const f of s.findings.slice(0, SHOWN)) out.push(`      ${f.file}${f.line ? `:${f.line}` : ''}  ${f.text}`);
    if (s.findings.length > SHOWN) out.push(`      ... and ${s.findings.length - SHOWN} more (--json lists all)`);
  }
  const failed = result.sweeps.filter((s) => s.status === 'FAIL').map((s) => s.id);
  out.push('', failed.length ? `release-check: ${failed.length} sweep${failed.length === 1 ? '' : 's'} failed: ${failed.join(', ')}` : 'release-check: every sweep passed');
  return out.join('\n');
}

runMain(import.meta, async () => {
  const { values } = parseArgs({ options: { root: { type: 'string' }, only: { type: 'string' }, json: { type: 'boolean', default: false } } });
  const only = values.only ? values.only.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const result = await releaseCheck({ root: values.root ?? REPO, only });
  console.log(values.json ? JSON.stringify(result, null, 2) : formatReport(result));
  return result.code;
});
