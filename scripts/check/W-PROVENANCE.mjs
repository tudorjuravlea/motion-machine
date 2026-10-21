// W-PROVENANCE (SPEC §5, AXIOM 11): every referenced pattern's card names its sources, each with a
// row in PROVENANCE.md (or says `original`). A warning in a piece; `mm pattern lint` and release-check's
// R-PATTERNS fail the library on it. Shares the lint run with W-PATTERN-CARD.
import { lintReferenced } from './W-PATTERN-CARD.mjs';

export default async function (ctx) { return lintReferenced(ctx, 'W-PROVENANCE'); }
