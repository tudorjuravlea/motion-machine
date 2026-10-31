// W-LOOP (SPEC §7): a story may declare open loops (`loops: [{ id, opens, closes, question }]`): a
// question the piece poses in one scene and answers in a later one. A viewer holds one main question
// and one secondary one at a time, so the rule warns when more than MAX_OPEN loops are open at once,
// when a loop never closes (no `closes`, a scene the story does not have, or a scene before the one
// that opens it), and when a loop closes after the scene that shows the call to action. A loop is open
// from the scene that opens it up to, not including, the scene that closes it. Read from the story
// alone, so a film and a deck judge it the same way.
import { rule } from '../lib/rule.mjs';

export const MAX_OPEN = 2;

/** The scene that shows the call to action: the one whose beats carry its text or url, else the last `outro`, else the last scene. */
export function ctaScene(story) {
  const shown = [story.cta?.text, story.cta?.url].filter(Boolean).map((s) => s.trim());
  const ids = story.scenes.map((sc) => sc.id);
  if (shown.length) {
    const i = story.scenes.findLastIndex((sc) => sc.beats.some((b) => b.text && shown.some((s) => b.text.includes(s))));
    if (i >= 0) return i;
  }
  const outro = story.scenes.findLastIndex((sc) => sc.position === 'outro');
  return outro >= 0 ? outro : ids.length - 1;
}

export default async function (ctx) {
  const loops = ctx.story.loops ?? [];
  if (!loops.length) return rule('W-LOOP', 'SKIP', { reason: 'the story declares no open loops (`loops`)' });
  const at = new Map(ctx.story.scenes.map((sc, i) => [sc.id, i]));
  const cta = ctaScene(ctx.story);
  const findings = [];
  const spans = [];
  for (const l of loops) {
    const a = at.get(l.opens), b = l.closes == null ? undefined : at.get(l.closes);
    if (a === undefined) { findings.push({ loop: l.id, problem: 'opens-unknown', reason: `loop "${l.id}" opens at "${l.opens}", which is not a scene` }); continue; }
    if (l.closes == null) { findings.push({ loop: l.id, problem: 'never-closes', reason: `loop "${l.id}" (${l.question}) is opened in "${l.opens}" and never closed` }); spans.push({ id: l.id, from: a, to: Infinity }); continue; }
    if (b === undefined) { findings.push({ loop: l.id, problem: 'never-closes', reason: `loop "${l.id}" closes at "${l.closes}", which is not a scene: it never closes` }); spans.push({ id: l.id, from: a, to: Infinity }); continue; }
    if (b < a) { findings.push({ loop: l.id, problem: 'never-closes', reason: `loop "${l.id}" closes at "${l.closes}", before the scene "${l.opens}" that opens it: it never closes` }); spans.push({ id: l.id, from: a, to: Infinity }); continue; }
    if (b > cta) findings.push({ loop: l.id, problem: 'after-cta', reason: `loop "${l.id}" closes at "${l.closes}", after the call to action in "${ctx.story.scenes[cta].id}"` });
    spans.push({ id: l.id, from: a, to: b });
  }
  let worst = { n: 0, scene: null, ids: [] };
  ctx.story.scenes.forEach((sc, i) => {
    const open = spans.filter((s) => s.from <= i && i < s.to).map((s) => s.id);
    if (open.length > worst.n) worst = { n: open.length, scene: sc.id, ids: open };
  });
  if (worst.n > MAX_OPEN) {
    findings.unshift({ loop: worst.ids.join(', '), problem: 'too-many-open', reason: `${worst.n} loops are open at once in "${worst.scene}" (${worst.ids.join(', ')}); a viewer holds one main and one secondary` });
  }
  if (findings.length) {
    const f = findings[0];
    return rule('W-LOOP', 'WARN', { selector: f.loop, measured: worst.n, threshold: MAX_OPEN, problems: findings.map(({ loop, problem }) => ({ loop, problem })), reason: findings.map((x) => x.reason).join('; ') });
  }
  return rule('W-LOOP', 'PASS', { loops: loops.length, measured: worst.n, threshold: MAX_OPEN });
}
