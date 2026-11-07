// text/caption-karaoke: the line is cut into groups of 2 to 6 words; one group is on screen at a
// time and its words light up in turn: said words in ink, the word being said in the accent,
// words still to come in the muted colour. Groups swap on a hard cut, never overlapping (W-CAPTION).
// mode even (the default): the beat's text, timed evenly over the entrance; at rest the last group
// stands in plain ink; a short opacity ramp opens each group. Give the beat a dur long enough to
// read it at about 0.3 s per word.
// mode words: the words of the story's footage (edit.json, on the film's clock, from
// `mm footage cut --words`), read through ctx.footage: a group shows from `lead` seconds before its
// first word until the next group's turn, whole at once, and a word is lit while it is said. With no
// footage words it falls back to mode even over the beat's text.
// Where the groups break: breaks score (the default) puts a break where a reader would breathe (a sentence end,
// then strong punctuation, then a pause of 150 to 400 ms, then a phrase boundary), never leaves one word alone
// and keeps a group within `chars` characters (wide scripts count two), around the `group` words asked for
// (runtime/kit/captions.js); breaks count cuts runs of `group` words, as it always did.
// Writes colour on word spans it creates and opacity on the group.
import { captionGroups, countGroups } from '../../../runtime/kit/captions.js';

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  group: { type: 'number', default: 4, meaning: 'words per group, clamped to 2 to 6' },
  mode: { type: 'enum(even|words)', default: 'even', meaning: 'even: the beat\'s text timed evenly over the entrance; words: the footage\'s words, timed to speech' },
  lead: { type: 'number', default: 0.05, meaning: 'mode words: seconds a group shows before its first word is heard, clamped to 0 to 0.1' },
  breaks: { type: 'enum(score|count)', default: 'score', meaning: 'where groups break: score (at sentence ends, punctuation, pauses and phrase boundaries, never one word alone) or count (runs of group words)' },
  chars: { type: 'number', default: 30, meaning: 'breaks score: the most characters a group holds (wide scripts count two); 0 for no limit' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const IN = 0.12;
const INK = 'var(--mm-color-ink)', LIT = 'var(--mm-accent-text)', TO_COME = 'var(--mm-color-muted)';

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

function paint(el, words, colorOf) {
  const doc = el.ownerDocument;
  el.textContent = '';
  words.forEach((w, i) => {
    const span = doc.createElement('span');
    span.className = 'mm-caption-karaoke__w';
    span.textContent = w;
    span.style.color = colorOf(i);
    if (i) el.append(' ');
    el.append(span);
  });
}

/** The groups of a list of items (strings or timed words) the way the beat asks: by score or by count. */
const groupsOf = (list, size, prm) => (prm.breaks === 'count' ? countGroups(list, size) : captionGroups(list, { group: size, chars: Number(prm.chars) }));

function spoken(el, list, size, prm, t) {
  const lead = Math.min(0.1, Math.max(0, Number(prm.lead) || 0));
  const groups = groupsOf(list, size, prm);
  let gi = -1;
  for (let i = 0; i < groups.length; i++) if (groups[i][0].at - lead <= t + 1e-9) gi = i;
  if (gi < 0) { el.textContent = ''; el.style.opacity = '0'; return; }   // nothing said yet
  const g = groups[gi];
  paint(el, g.map((w) => w.text), (i) => (g[i].at <= t + 1e-9 && t < g[i].end ? LIT : g[i].at <= t + 1e-9 ? INK : TO_COME));
  el.style.opacity = '';
}

export default {
  name: 'caption-karaoke',
  group: 'text',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const size = Math.min(6, Math.max(2, Math.round(Number(prm.group))));
    const said = ctx.footage?.words ?? [];
    if (prm.mode === 'words' && said.length) return spoken(el, said, size, prm, ctx.footage.t);
    const words = (el.textContent || '').split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const groups = groupsOf(words, size, prm);
    const n = groups.length;
    const lin = linear(ctx, p);
    let gi, s, active;
    if (prm.breaks === 'count') {
      gi = lin >= 1 ? n - 1 : Math.min(n - 1, Math.floor(lin * n));
      s = lin >= 1 ? 1 : lin * n - gi;
      active = lin >= 1 ? -1 : Math.min(groups[gi].length - 1, Math.floor(s * groups[gi].length));
    } else {
      // groups differ in length: the time is spread over the words, so each word has the same share of it
      const at = lin >= 1 ? words.length : lin * words.length;
      let from = 0;
      gi = 0;
      while (gi < n - 1 && at >= from + groups[gi].length) from += groups[gi++].length;
      s = lin >= 1 ? 1 : (at - from) / groups[gi].length;
      active = lin >= 1 ? -1 : Math.min(groups[gi].length - 1, Math.floor(at - from));
    }
    const group = groups[gi];
    paint(el, group, (i) => (active < 0 || i < active ? INK : i === active ? LIT : TO_COME));
    const o = clamp01(s / IN);
    el.style.opacity = o >= 1 ? '' : String(o);
  },
};
