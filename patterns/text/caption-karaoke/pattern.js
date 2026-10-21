// text/caption-karaoke: the line is cut into groups of 2 to 6 words; one group is on screen at a
// time and its words light up in turn: said words in ink, the word being said in the accent,
// words still to come in the muted colour. Groups swap on a hard cut, never overlapping (W-CAPTION).
// At rest the last group stands in plain ink. Writes colour on word spans it creates and a short
// opacity ramp on the group. A group is one turn of the entrance, so give the beat a dur long
// enough to read it at about 0.3 s per word.
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const params = {
  group: { type: 'number', default: 4, meaning: 'words per group, clamped to 2 to 6' },
};
const DEFAULTS = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.default]));
const IN = 0.12;

function linear(ctx, p) {
  if (ctx.u != null && ctx.d > 0) return clamp01(ctx.u / ctx.d);
  return clamp01(p);
}

export default {
  name: 'caption-karaoke',
  group: 'text',
  dur: 'hold',
  params,
  at(el, p, ctx) {
    const prm = { ...DEFAULTS, ...ctx.params };
    const words = (el.textContent || '').split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const size = Math.min(6, Math.max(2, Math.round(Number(prm.group))));
    const groups = [];
    for (let i = 0; i < words.length; i += size) groups.push(words.slice(i, i + size));
    // a short tail group borrows from the one before, so no group is left with a single word
    if (groups.length > 1 && groups[groups.length - 1].length === 1) groups[groups.length - 2].push(groups.pop()[0]);
    const n = groups.length;
    const lin = linear(ctx, p);
    const gi = lin >= 1 ? n - 1 : Math.min(n - 1, Math.floor(lin * n));
    const s = lin >= 1 ? 1 : lin * n - gi;
    const group = groups[gi];
    const active = lin >= 1 ? -1 : Math.min(group.length - 1, Math.floor(s * group.length));
    const doc = el.ownerDocument;
    el.textContent = '';
    group.forEach((w, i) => {
      const span = doc.createElement('span');
      span.className = 'mm-caption-karaoke__w';
      span.textContent = w;
      span.style.color = active < 0 || i < active ? 'var(--mm-color-ink)' : i === active ? 'var(--mm-accent-text)' : 'var(--mm-color-muted)';
      if (i) el.append(' ');
      el.append(span);
    });
    const o = clamp01(s / IN);
    el.style.opacity = o >= 1 ? '' : String(o);
  },
};
