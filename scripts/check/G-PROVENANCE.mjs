// G-PROVENANCE (SPEC §5, AXIOM 11): every referenced pattern's card names its sources, each with a
// row in PROVENANCE.md (or says `original`). Shares the lint run with G-PATTERN-CARD.
import { lintReferenced } from './G-PATTERN-CARD.mjs';

export default async function (ctx) { return lintReferenced(ctx, 'G-PROVENANCE'); }
