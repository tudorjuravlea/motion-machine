// W-NUMBER (SPEC §7, H-FACTS): a shown number that disagrees with its fact. Where a beat cites a fact (`fact`) and
// shows a number, the number at rest must equal one of the fact's numbers to the precision that number states: 7 is
// not 7.3, 94.2 is 94, 94 is not 94.2. Read statically from the beat, not from the page: a data pattern rests on its `value`
// at the decimals its `fix` asks for (unset: the value's own), and a text beat shows the numbers in its text. Hex
// colours, ids and numbers glued to letters (9x16, 30fps) are not numbers; the sign is the pattern's to draw. A beat that
// cites a fact but shows no number, and a fact with no number, are not read.
import { rule } from '../lib/rule.mjs';
import { round } from './_pure.mjs';

const TOKEN = /(?<![\w#])\d(?:[\d.,  ]*\d)?/g;

/** One token as a number with the decimals it states, or null. */
function parse(token) {
  let t = token.replace(/[  ]/g, '');
  const dots = (t.match(/\./g) ?? []).length, commas = (t.match(/,/g) ?? []).length;
  let frac = '';
  if (dots && commas) {
    const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    const i = t.lastIndexOf(dec);
    frac = t.slice(i + 1);
    t = t.slice(0, i).replace(/[.,]/g, '');
  } else if (commas) {
    if (/^\d{1,3}(,\d{3})+$/.test(t)) t = t.replace(/,/g, '');
    else if (commas === 1) { [t, frac] = t.split(','); } else return null;
  } else if (dots) {
    if (dots === 1) { [t, frac] = t.split('.'); } else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); else return null;
  }
  const value = Number(frac ? `${t}.${frac}` : t);
  return Number.isFinite(value) ? { value, decimals: frac.length } : null;
}

/** The numbers in a text: [{ text, value, decimals }]. */
export function numbersIn(text) {
  const out = [];
  const s = String(text ?? '');
  for (const m of s.matchAll(TOKEN)) {
    if (/\w/.test(s[m.index + m[0].length] ?? '')) continue;
    const p = parse(m[0]);
    if (p) out.push({ text: m[0], ...p });
  }
  return out;
}

/** The numbers a beat shows: its `value` at the decimals `fix` asks for, then the numbers in its text. */
export function shownNumbers(beat) {
  const out = [];
  if (typeof beat.value === 'number' && Number.isFinite(beat.value)) {
    const fix = beat.params?.fix;
    const decimals = Number.isInteger(fix) && fix >= 0 && fix <= 4 ? fix : (String(beat.value).split('.')[1] ?? '').length;
    out.push({ text: String(beat.value), value: round(beat.value, decimals), decimals });
  }
  return [...out, ...numbersIn(beat.text)];
}

/** Whether a shown value equals the fact's number at the decimals the fact states. */
export function agrees(shown, fact) {
  const k = 10 ** fact.decimals;
  return Math.round(Math.abs(shown) * k) / k === Math.abs(fact.value);
}

export default async function (ctx) {
  const facts = new Map((ctx.story.facts ?? []).map((f) => [f.id, numbersIn(f.text)]));
  let compared = 0, cited = 0;
  const bad = [];
  for (const sc of ctx.story.scenes) for (const b of sc.beats) {
    if (!b.fact || !facts.has(b.fact)) continue;
    const wanted = facts.get(b.fact), shown = shownNumbers(b);
    if (!wanted.length || !shown.length) continue;
    cited++;
    for (const n of shown) {
      compared++;
      if (wanted.some((w) => agrees(n.value, w))) continue;
      const nearest = wanted.reduce((a, w) => (Math.abs(w.value - n.value) < Math.abs(a.value - n.value) ? w : a));
      bad.push({ selector: `[data-scene="${sc.id}"] [data-slot="${b.slot}"]`, fact: b.fact, measured: n.value, threshold: nearest.value, read: 'static', source: typeof b.value === 'number' && n.text === String(b.value) ? 'value' : 'text' });
    }
  }
  if (!compared) return rule('W-NUMBER', 'SKIP', { reason: 'no beat that cites a fact shows a number the fact also states: nothing to compare' });
  if (bad.length) {
    const w = bad[0];
    return rule('W-NUMBER', 'WARN', { ...w, all: bad, reason: `${w.selector} shows ${w.measured} (its ${w.source}) but fact ${w.fact} says ${w.threshold}` });
  }
  return rule('W-NUMBER', 'PASS', { beats: cited, compared, read: 'static' });
}
