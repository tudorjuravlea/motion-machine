// W-ASK (SPEC §7): the style still lists fields a capture could not measure (`ask`, e.g.
// the fonts of a brand captured from stills). The piece renders with the stand-ins; the warning
// stays until someone confirms each field and removes it from `ask`.
import { rule } from '../lib/rule.mjs';

export default async function (ctx) {
  const ask = Array.isArray(ctx.style.ask) ? ctx.style.ask : [];
  if (ask.length) return rule('W-ASK', 'WARN', { measured: ask, threshold: [], reason: `the style still asks for ${ask.join(', ')}: confirm ${ask.length > 1 ? 'them' : 'it'} in the brand half and remove ${ask.length > 1 ? 'them' : 'it'} from \`ask\`` });
  return rule('W-ASK', 'PASS', { measured: [], threshold: [] });
}
