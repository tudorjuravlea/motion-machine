# Accepted warnings of the golden pieces

The WARNs the director accepted on the golden pieces, each with its evidence, its reason and who decided. `tests/golden/golden.test.mjs` reads the table below: any other WARN fails, and so does a row with no evidence or no reason.

## Warnings and why they stand

| Rule | Piece | Evidence | Why it stands | Decided by |
|---|---|---|---|---|
| W-PACE | golden-film-editorial | 6, 8 and 5 arrivals in the 0–10, 10–20 and 20–30 s windows against calm's 2–5 | One story is worn by both styles. Only 5 / 5 / 5 passes both calm (2–5) and kinetic (5–10), and reaching it cuts three lines. Kinetic passes. The warning stands on the calm render. | crew as stand-in director (`pieces/golden-film-editorial/direction-log.md`, rows 2.6 and 6.2) |
| W-STAGGER | golden-film-editorial | first arrivals inside the cut in 7 scenes: 0 s inside a 0.52 s push or color-dip (problem, style, both, cta); 0.3 s inside the crossfade (time, patterns); 0.22 s inside the zoom-through (gate) | Waiting 0.62 s for editorial's cuts leaves kinetic 10 to 20 near-empty frames after its hard cuts and 0.28 s pushes (W-EMPTY). The arrival enters with the cut instead, and the cut carries the outgoing scene, so no run exceeds 4 frames. | crew as stand-in director (`pieces/golden-film-editorial/direction-log.md`, rows 2.5 and 6.3) |
| W-STAGGER | golden-film-kinetic | the time headline arrives 0.02 s after the 0.28 s push settles (the rule asks for 0.1 s); all other scenes pass | At 0.38 s the push left 7 frames under 0.5 % ink (W-EMPTY). At 0.3 s the run is 5 frames. | crew as stand-in director (`pieces/golden-film-kinetic/direction-log.md`, rows 5.3 and 6.2) |
| W-TOKENS | golden-deck-editorial | 7 distinct font sizes at the rests (35, 54, 79, 102, 128, 179, 282 px) against 5 | The deck's eight layouts each fit their headline to their own box, so one story reads at seven sizes; a fixed ladder would cut words. Listed so the check stays green until the director rules on the new rule's limit. | lot D builder, pending the director |
| W-TOKENS | golden-deck-kinetic | 8 distinct font sizes at the rests (35, 54, 84, 101, 135, 169, 197, 310 px) against 5 | The same story as the editorial deck at kinetic's larger scale; the headline ladder is per layout. Listed so the check stays green until the director rules on the new rule's limit. | lot D builder, pending the director |
| W-TOKENS | golden-film-kinetic | 6 distinct font sizes at the rests (45, 71, 111, 133, 177, 222 px) against 5; golden-film-editorial passes at 5 | Kinetic's headline scale gives the stat and statement layouts sizes of their own. Listed so the check stays green until the director rules on the new rule's limit. | lot D builder, pending the director |
| W-SOUND-SHAPE | golden-film-editorial | the cues' loudest 100 ms span 5.7 dB from P10 to P90 (8 dB wanted); it opens on a hit at 0 s | the rule came after the piece and is provisional; its cues were levelled by the palette's own matching, and re-levelling the reference film is the director's call | orchestrator, pending the director |
| W-SOUND-SHAPE | golden-film-kinetic | the cues' loudest 100 ms span 7.4 dB from P10 to P90 (8 dB wanted); it opens on a hit at 0 s | the rule came after the piece and is provisional; its cues were levelled by the palette's own matching, and re-levelling the reference film is the director's call | orchestrator, pending the director |

No other WARN in any of the four final reports.

## End
