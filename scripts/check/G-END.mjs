// G-END (SPEC §7, §10, AXIOM 9): on a deck, goto(presses + 1) paints exactly what goto(presses)
// paints: a next press on the final pose does nothing.
import { rule } from '../lib/report.mjs';

export const scope = 'format';

export default async function (ctx) {
  if (ctx.kind !== 'deck') return rule('G-END', 'SKIP', { reason: 'films have no presses' });
  const n = ctx.schedule.presses;
  const shot = () => ctx.page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide' });
  await ctx.mm.goto(n);
  const a = await shot();
  await ctx.mm.goto(n + 1);
  const b = await shot();
  await ctx.mm.goto(n);
  if (!a.equals(b)) return rule('G-END', 'FAIL', { press: n + 1, reason: `goto(${n + 1}) changes the picture of the final rest` });
  return rule('G-END', 'PASS', { press: n });
}
