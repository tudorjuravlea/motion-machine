// W-LITERAL (SPEC §3, §7, AXIOM 2): a literal size, space, radius, duration or easing in the piece's CSS,
// or a literal colour or font family written as syntax (a hex, rgb(), a named colour, `font-family:` that
// is not var()) instead of the --mm-* variables. A warning: a brand's own studio may have reasons, and a
// literal that renders a colour or face the style owns is still the brand. A colour or face the style
// does not own fails G-BRAND, read from what is rendered. The library's patterns are held to the same
// text strictly by `mm pattern lint`; the kit's own files are exempt. Reads the piece's own files.
import { rule } from '../lib/report.mjs';
import { cssLiterals, htmlParts, sources } from './_lib.mjs';

export default async function (ctx) {
  const hits = [];
  for (const s of sources(ctx)) {
    if (s.owner !== 'piece') continue;
    if (s.ext === '.css') for (const h of cssLiterals(s.text)) hits.push({ file: s.rel, ...h });
    if (s.ext === '.html') {
      const parts = htmlParts(s.text);
      for (const p of [...parts.styles, ...parts.attrs]) for (const h of cssLiterals(p.text)) hits.push({ file: s.rel, ...h, line: p.line + h.line - 1 });
    }
  }
  if (hits.length) {
    const h = hits[0];
    return rule('W-LITERAL', 'WARN', { file: h.file, line: h.line, measured: `${h.prop}: ${h.value}`, reason: `${h.kind} in CSS; use the --mm-* variables`, hits: hits.slice(0, 20) });
  }
  return rule('W-LITERAL', 'PASS', {});
}
