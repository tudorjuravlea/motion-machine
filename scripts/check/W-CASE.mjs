// W-CASE (SPEC §7, provisional): `text-transform: uppercase`, read from the computed style at the rests, on text that holds
// a character whose capital changes its length or its meaning: the sharp s (SS), the ligatures (FI), the micro sign (a Greek
// capital Mu, which is not a micro sign), dotless i, long s. The check is String.prototype.toUpperCase against the text, length
// and code points, plus the named list below for the characters whose capital has the same length. A warning: the line reads
// differently from the one that was written. Capitals set in the story's own text are not read.
import { rule } from '../lib/rule.mjs';
import { restInstants, auditInstants } from './_lib.mjs';

export const scope = 'format';
/** Characters whose capital has the same length as the character but another meaning. */
export const MEANING_CHANGERS = ['µ', 'ı', 'ſ', 'ͅ', 'ι'];

/** The characters of `text` that change when uppercased: [{ char, upper, why: 'length' | 'meaning' }], in order, each once. */
export function changesOnUpper(text) {
  const out = [], seen = new Set();
  for (const char of String(text ?? '')) {
    if (seen.has(char)) continue;
    const upper = char.toUpperCase();
    const why = [...upper].length !== 1 ? 'length' : MEANING_CHANGERS.includes(char) ? 'meaning' : null;
    if (why) { seen.add(char); out.push({ char, upper, why }); }
  }
  return out;
}

/** In the page: the visible text of every element the stage draws, with its computed text-transform. */
function textsInPage() {
  const stage = document.querySelector('.mm-stage');
  if (!stage) return [];
  const pathOf = (el) => {
    const sc = el.closest('[data-scene]'), slot = el.closest('[data-slot]');
    return sc && slot ? `[data-scene="${sc.dataset.scene}"] [data-slot="${slot.dataset.slot}"]` : sc ? `[data-scene="${sc.dataset.scene}"] ${el.tagName.toLowerCase()}` : el.tagName.toLowerCase();
  };
  const out = [];
  for (const el of stage.querySelectorAll('*')) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none' || !el.getClientRects().length) continue;
    out.push({ selector: pathOf(el), text, upper: cs.textTransform === 'uppercase' });
  }
  return out;
}

export default async function (ctx) {
  const instants = ctx.schedule.kind === 'deck' ? restInstants(ctx.schedule) : auditInstants(ctx.schedule);
  const seen = new Set();
  const bad = [];
  let texts = 0, uppercased = 0;
  for (const t of instants) {
    await ctx.mm.seek(t);
    for (const e of await ctx.page.evaluate(textsInPage)) {
      const key = `${e.selector}|${e.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      texts++;
      if (!e.upper) continue;
      uppercased++;
      const hit = changesOnUpper(e.text);
      if (hit.length) bad.push({ instant: t, selector: e.selector, text: e.text, characters: hit.map((h) => h.char), capitals: hit.map((h) => h.upper) });
    }
  }
  if (!uppercased) return rule('W-CASE', 'SKIP', { reason: `no text is set in capitals by CSS (${texts} text element${texts === 1 ? '' : 's'} read)` });
  if (bad.length) {
    const w = bad[0];
    return rule('W-CASE', 'WARN', { instant: w.instant, selector: w.selector, characters: w.characters, measured: w.characters.length, all: bad, reason: `${w.selector} is set in uppercase over ${w.characters.join(' ')}, which become ${w.capitals.join(' ')}: the line no longer reads as written` });
  }
  return rule('W-CASE', 'PASS', { texts, uppercased });
}
