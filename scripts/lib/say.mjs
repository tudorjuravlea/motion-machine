// A scene's voice-over text (`say`) is checked before a paid voice speaks it (SPEC §8, W-SAY). Library only; Node
// and the browser both load it (no imports).
//
//   [display](spoken)   a pronunciation marker: shown as `display`, spoken as `spoken`. A body that looks like a
//                       link (https://…, mailto:…, /path, #anchor, ./path) is a link: only its display is kept.
//   <<slot>>            a cue marker: the beat with that slot arrives on the word the marker precedes. It takes no room.
//   voice.lexicon       the brand's { word: spoken } map: a word is respelled for the voice wherever it stands.
//
//   parseSay(text, { lexicon })     { display, spoken, markers, cues, problems, units }
//   displayText(text)               the text as shown (handout, captions): markers resolved to their display
//   lintSay(text, { lexicon })      { findings, productWordsChecked, parsed }: the words a voice may get wrong that nothing marks
//   cueAnchors(story)               { anchors, problems }: for each cue, the beat's slot and the phrase it must arrive on
//   alignDisplay(parsed, words)     the voice's [{ text, start, end }] (as spoken) turned back into the words shown
//
// What a voice may get wrong: acronyms (API, US, OK: spelled out or read as a word), camelCase and PascalCase names,
// identifiers with underscores, file names, web addresses and emails, numbers with units, versions, dates and ratios,
// and (only when the brand keeps a lexicon) a capitalised word in mid-sentence the lexicon does not know. The
// detectors are shapes, not a dictionary: a miss is a word nothing flagged, a false alarm costs one marker.

const MARKER = /<<([a-z][a-z0-9-]{0,30})>>|\[([^[\]\n]+)\]\(([^()\n]+)\)/g;
const LINK = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|\/|#|\.{1,2}\/)/i;
const LEAD = /^[\s"'“”‘’([{<]+/;
const TRAIL = /[\s.,;:!?"'“”‘’)\]}>…]+$/;

/** The word with the punctuation round it taken off: { lead, core, trail }. */
function peel(run) {
  const lead = (LEAD.exec(run) ?? [''])[0];
  const rest = run.slice(lead.length);
  const trail = (TRAIL.exec(rest) ?? [''])[0];
  return { lead, core: rest.slice(0, rest.length - trail.length), trail };
}

/**
 * Splits the text into pieces { d, s } (shown, spoken) in order, cue markers as { cue }. A word of the lexicon
 * becomes a piece of its own so a later step knows it was respelled by the brand.
 */
function pieces(text, lexicon) {
  const out = [];
  const plain = (str) => {
    for (const part of str.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { out.push({ d: part, s: part }); continue; }
      const { lead, core, trail } = peel(part);
      if (core && Object.hasOwn(lexicon, core)) out.push({ d: part, s: lead + lexicon[core] + trail, lexicon: true });
      else out.push({ d: part, s: part });
    }
  };
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    plain(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[1]) out.push({ cue: m[1] });
    else if (LINK.test(m[3].trim())) out.push({ d: m[2], s: m[2], link: true });
    else out.push({ d: m[2], s: m[3].trim(), marker: true });
  }
  plain(text.slice(last));
  return out;
}

/** Groups the pieces into units: what lies between two whitespace characters of the plain text (a marker with a space in it stays whole). */
function unitsOf(ps) {
  const units = [];
  let cur = null;
  for (const p of ps) {
    if (p.cue) { (cur ??= { d: '', s: '', parts: [] }).parts.push(p); continue; }
    if (!p.marker && !p.link && /^\s+$/.test(p.d)) { if (cur) { units.push(cur); cur = null; } continue; }
    cur ??= { d: '', s: '', parts: [] };
    cur.d += p.d; cur.s += p.s; cur.parts.push(p);
  }
  if (cur) units.push(cur);
  return units.filter((u) => u.d !== '' || u.parts.some((p) => p.cue));
}

/** The words of a string, split on whitespace. */
const wordsOf = (str) => str.split(/\s+/).filter(Boolean);

/** { display, spoken, markers, cues: [{ name, word, index }], problems: [{ reason }], units } for a voice-over text. */
export function parseSay(text, { lexicon = {} } = {}) {
  const ps = pieces(String(text ?? ''), lexicon);
  let display = '', spoken = '';
  const markers = [], cuesAt = [];
  for (const p of ps) {
    if (p.cue) { cuesAt.push({ name: p.cue, at: display.length }); continue; }
    if (p.marker) markers.push({ display: p.d, spoken: p.s });
    display += p.d; spoken += p.s;
  }
  const starts = [...display.matchAll(/\S+/g)].map((m) => ({ at: m.index, word: m[0] }));
  const problems = [], cues = [], seen = new Set();
  for (const c of cuesAt) {
    const index = starts.findIndex((w) => w.at >= c.at);
    const inside = c.at > 0 && c.at < display.length && !/\s/.test(display[c.at - 1]) && !/\s/.test(display[c.at]);
    if (inside) problems.push({ cue: c.name, reason: `<<${c.name}>> sits inside a word: put it before the whole word` });
    if (index < 0) { problems.push({ cue: c.name, reason: `<<${c.name}>> precedes no word: put it before the word the beat arrives on` }); continue; }
    if (seen.has(c.name)) problems.push({ cue: c.name, reason: `<<${c.name}>> is used twice: a beat arrives once` });
    seen.add(c.name);
    cues.push({ name: c.name, word: starts[index].word.replace(LEAD, '').replace(TRAIL, '') || starts[index].word, index });
  }
  const units = unitsOf(ps).map((u) => ({ d: u.d, s: u.s, kinds: new Set(u.parts.map((p) => (p.marker ? 'marker' : p.lexicon ? 'lexicon' : p.link ? 'link' : 'plain'))) }));
  return { display, spoken, markers, cues, problems, units };
}

/** The text as shown: pronunciation markers resolved to their display, cue markers taken out. */
export const displayText = (text) => parseSay(text).display;

// ---- what a voice may get wrong ----

const FILE_EXT = 'md|js|mjs|cjs|ts|tsx|jsx|json|yml|yaml|toml|css|scss|html|htm|svg|png|jpe?g|gif|webp|pdf|mp4|mov|webm|mp3|wav|txt|csv|xlsx?|docx?|pptx?|zip|sh|py|rb|go|rs|sql|env';
const TLD = 'com|io|app|dev|org|net|ai|co|eu|be|ro|de|uk|me|ly|tv|fm|gg|xyz|info|biz';
// attached to a number ("5s", "1.5x", "10k") any of these is a unit; set apart ("300 ms") only the ones no sentence uses as a word (not "in", "m", "s", "x")
const UNIT_WORDS = 'kb|mb|gb|tb|ms|s|sec|min|px|pt|em|rem|hz|khz|mhz|ghz|kg|g|mg|km|m|cm|mm|fps|dpi|rpm|mph|kmh|bpm|x|k|bn|lb|oz|ft|in';
const SEPARATE_UNITS = 'kb|mb|gb|tb|ms|px|pt|hz|khz|mhz|ghz|kg|mg|km|cm|mm|fps|dpi|rpm|mph|kmh|bpm|lb|oz';
const RISKS = [
  ['url', /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i],
  ['url', /^(?:https?:\/\/|www\.)\S+$/i],
  ['url', new RegExp(`^[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${TLD})(?:/\\S*)?$`, 'i')],
  ['file', new RegExp(`^[\\w./-]*\\.(?:${FILE_EXT})$`, 'i')],
  ['unit', /^v?\d+\.\d+\.\d+(?:\.\d+)*$/],
  ['unit', /^\d{4}-\d{2}-\d{2}$/],
  ['unit', /^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}$/],
  ['unit', /^\d+:\d+$/],
  ['unit', /^[$€£]\d[\d.,]*[kmb]?$/i],
  ['unit', new RegExp(`^\\d[\\d.,]*(?:${UNIT_WORDS}|%)$`, 'i')],
  ['camelcase', /^[a-z]+[A-Z][A-Za-z0-9]*$/],
  ['camelcase', /^[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+$/],
  ['identifier', /^[A-Za-z0-9]+(?:_[A-Za-z0-9]+)+$/],
  ['acronym', /^(?=(?:[^A-Z]*[A-Z]){2})[A-Z0-9]{2,}s?$/],
];
const REASONS = {
  acronym: 'an acronym: a voice may spell it out or read it as a word',
  camelcase: 'a camelCase name: a voice may run it together or split it in the wrong place',
  identifier: 'a code identifier with underscores',
  file: 'a file name: the dot and the extension may be read aloud or skipped',
  url: 'a web address or email: a voice reads it letter by letter or skips it',
  unit: 'a number with a unit, a version, a date or a ratio: how it is read varies',
  'product-word': 'a name the brand lexicon does not know',
};
/** What each kind of finding is called in a message. */
export const KIND_NAMES = { acronym: 'acronym', camelcase: 'camelCase name', identifier: 'code identifier', file: 'file name', url: 'web address', unit: 'number with a unit', 'product-word': 'product word the lexicon does not know' };
const NOT_A_PRODUCT = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'January', 'February', 'March', 'April', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'English', 'Europe', 'European', 'America', 'American', 'Asia', 'Africa', 'Christmas']);
const UNIT_RE = new RegExp(`^(?:${SEPARATE_UNITS})$`, 'i');

/** The kind of risk in one word (punctuation already off), or null. */
export function riskOf(core) {
  for (const [kind, re] of RISKS) if (re.test(core)) return kind;
  return null;
}

/**
 * The words in a voice-over text that a voice may get wrong and that nothing marks or respells:
 * { findings: [{ word, kind, index, reason, fix }], productWordsChecked, parsed }. `index` is the word's place among the words shown.
 */
export function lintSay(text, { lexicon = {} } = {}) {
  const parsed = parseSay(text, { lexicon });
  const checkProducts = Object.keys(lexicon).length > 0;
  const findings = [];
  let index = 0, sentenceStart = true;
  const units = parsed.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const shown = wordsOf(u.d).length;
    const flag = (word, kind) => findings.push({ word, kind, index, reason: REASONS[kind], fix: `mark it: [${word}](how it is said), or put it in the brand's voice.lexicon` });
    if (!u.kinds.has('lexicon') && !u.kinds.has('link')) {
      const spokenWords = wordsOf(u.s);
      const first = peel(spokenWords[0] ?? '').core;
      const next = units[i + 1] && !units[i + 1].kinds.has('marker') ? peel(units[i + 1].s).core : '';
      if (u.kinds.size === 1 && /^\d[\d.,]*$/.test(first) && UNIT_RE.test(next)) { flag(`${first} ${next}`, 'unit'); i++; index += wordsOf(units[i].d).length + shown; sentenceStart = /[.!?…]["'”’)]*$/.test(units[i].d); continue; }
      for (const w of spokenWords) {
        const core = peel(w).core;
        const kind = core ? riskOf(core) : null;
        if (kind) flag(core, kind);
        else if (checkProducts && u.kinds.size === 1 && !sentenceStart && /^[A-Z][a-z]{2,}$/.test(core) && !NOT_A_PRODUCT.has(core) && !Object.hasOwn(lexicon, core)) flag(core, 'product-word');
      }
    }
    index += shown;
    sentenceStart = /[.!?…:]["'”’)]*$/.test(u.d);
  }
  return { findings, productWordsChecked: checkProducts, parsed };
}

// ---- cue markers ----

/** The word with the punctuation round it taken off, for a phrase. */
const bare = (w) => w.replace(LEAD, '').replace(TRAIL, '') || w;

/**
 * For each cue marker in the story's scene `say` texts: the beat with that slot and the phrase it must arrive on (the
 * word the marker precedes and the two after it), which W-ANCHOR checks against the voice's word times. A cue naming a
 * slot no beat of its scene has is a problem, as is a marker that sits wrong in its text.
 */
export function cueAnchors(story) {
  const anchors = [], problems = [];
  for (const sc of story?.scenes ?? []) {
    if (typeof sc.say !== 'string' || !sc.say.includes('<<')) continue;
    const p = parseSay(sc.say);
    for (const pr of p.problems) problems.push({ scene: sc.id, ...pr });
    const shown = wordsOf(p.display);
    const slots = (sc.beats ?? []).map((b) => b.slot).filter(Boolean);
    for (const c of p.cues) {
      if (!slots.includes(c.name)) { problems.push({ scene: sc.id, cue: c.name, reason: `<<${c.name}>> names no beat with slot "${c.name}" in scene ${sc.id} (its slots: ${slots.join(', ') || 'none'})` }); continue; }
      anchors.push({ scene: sc.id, slot: c.name, anchor: shown.slice(c.index, c.index + 3).map(bare).join(' ') });
    }
  }
  return { anchors, problems };
}

// ---- the voice's words, back as shown ----

/**
 * The voice returns its words as it spoke them: "ay pee eye" for a marked "API". Turned back into the words shown, so a beat's
 * `anchor` (written in the words shown) finds them. A shown word spans its spoken words; a marker that shows more words than it
 * speaks splits its span evenly. If the voice's word count is not the count the text speaks, the words are returned as they came.
 */
export function alignDisplay(parsed, words) {
  const units = parsed.units;
  const spokenCount = units.reduce((n, u) => n + wordsOf(u.s).length, 0);
  if (spokenCount !== words.length) return words;
  const out = [];
  let at = 0;
  for (const u of units) {
    const shown = wordsOf(u.d), spoken = words.slice(at, at + wordsOf(u.s).length);
    at += spoken.length;
    if (!shown.length || !spoken.length) continue;
    if (shown.length === spoken.length) { shown.forEach((text, k) => out.push({ ...spoken[k], text })); continue; }
    const start = spoken[0].start, end = spoken.at(-1).end, step = (end - start) / shown.length;
    shown.forEach((text, k) => out.push({ text, start: Math.round((start + k * step) * 1000) / 1000, end: Math.round((start + (k + 1) * step) * 1000) / 1000 }));
  }
  return out;
}
