// W-SAY (SPEC §7; provisional): a film's voice-over, a scene's `say`, is read for the words a voice may get wrong
// (scripts/lib/say.mjs): acronyms (API, US, OK), camelCase and PascalCase names, identifiers with underscores, file
// names, web addresses and emails, numbers with units, versions, dates and ratios, and, when the brand keeps a
// `voice.lexicon`, a capitalised word in mid-sentence the lexicon does not know. A word warns unless a pronunciation
// marker `[display](spoken)` or the brand's lexicon says how it is read. A cue marker `<<slot>>` that names no beat of
// its scene, or sits inside a word, warns too. One warning with the first finding, and every finding in `all`.
// A deck's `say` is a note for the presenter and no voice speaks it: SKIP. A film with no `say`: SKIP.
// `mm say-lint` is the same reading from the terminal, and `mm gen voice` runs it before the paid call.
import { rule } from '../lib/rule.mjs';
import { cueAnchors, lintSay } from '../lib/say.mjs';

export default async function (ctx) {
  if (ctx.story.kind === 'deck') return rule('W-SAY', 'SKIP', { reason: 'a deck\'s say is a note for the presenter: no voice speaks it' });
  const spoken = ctx.story.scenes.filter((sc) => typeof sc.say === 'string' && sc.say.trim());
  if (!spoken.length) return rule('W-SAY', 'SKIP', { reason: 'no scene has voice-over text (say)' });
  const lexicon = ctx.style?.voice?.lexicon ?? {};
  const found = [];
  let productWordsChecked = false;
  for (const sc of spoken) {
    const lint = lintSay(sc.say, { lexicon });
    productWordsChecked ||= lint.productWordsChecked;
    for (const f of lint.findings) found.push({ selector: `[data-scene="${sc.id}"]`, scene: sc.id, word: f.word, kind: f.kind, index: f.index, fix: f.fix, reason: `scene ${sc.id}: "${f.word}" is ${f.reason}; ${f.fix}` });
  }
  for (const p of cueAnchors(ctx.story).problems) found.push({ selector: `[data-scene="${p.scene}"]`, scene: p.scene, word: `<<${p.cue}>>`, kind: 'cue', reason: `scene ${p.scene}: ${p.reason}` });
  if (found.length) {
    const first = found[0];
    return rule('W-SAY', 'WARN', { selector: first.selector, measured: found.length, threshold: '0 words a voice may get wrong that nothing marks', reason: found.length > 1 ? `${first.reason} (+${found.length - 1} more)` : first.reason, all: found });
  }
  return rule('W-SAY', 'PASS', { scenes: spoken.length, productWordsChecked });
}
