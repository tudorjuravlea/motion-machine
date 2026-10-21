# Transitions

The catalogue of cuts the grammar knows. Durations are seconds at calm, medium and high energy; they are this grammar's tuned values, and credits for the ideas behind the catalogue are in `PROVENANCE.md`. Positions: opening, related (the next scene continues the thought), topic change, climax, wind-down, outro. Where several cuts share one set of numbers, the calm column takes the longer typical value; medium and high follow the energy table below.

## Catalogue

| id | calm | medium | high | position | mood |
|---|---|---|---|---|---|
| hard-cut | 0 | 0 | 0 | climax, also opening | an abrupt break |
| crossfade | 0.6-1.0 | 0.4-0.5 | 0.2 | related, wind-down, outro | the thought carries on |
| blur-crossfade | 0.8-1.2 | 0.4-0.6 | 0.2-0.3 | opening, wind-down | soft and upscale |
| color-dip | 0.6-1.0 | 0.4 | 0.2 | outro, topic change | a full stop |
| push | 0.6 | 0.3-0.5 | 0.2 | related | orderly, page-turning progress |
| wipe | 0.5-0.6 | 0.5 | 0.3 | topic change | directed attention, a vintage touch |
| zoom-through | 0.6 | 0.4-0.5 | 0.2-0.3 | climax | a plunge through the frame |
| zoom-out | 0.6 | 0.4-0.5 | 0.3 | topic change, climax | pulling back to show the whole |
| iris | 0.6-0.8 | 0.5 | 0.3 | topic change | a spotlight closing on the next scene |
| clock-wipe | 0.8-1.0 | 0.5 | 0.3 | topic change | a dial sweeping round, old-fashioned |
| split | 0.6 | 0.3-0.5 | 0.25 | topic change | precise, machine-like |
| blinds | 0.6 | 0.3-0.5 | 0.25 | topic change | a slatted, mechanical rhythm |
| grid-dissolve | not offered | 0.4-0.5 | 0.25-0.4 | topic change | digital, pixelated |
| flip | 0.7-1.0 | 0.6 | 0.4 | topic change | light-hearted and tactile |
| light-leak | 0.6-0.8 | 0.5 | 0.3 | opening, climax, wind-down | glowing and filmic |
| whip-pan | not offered | 0.3-0.4 | 0.2 | related, topic change | a fast swing |
| shared-element | 0.6 | 0.5 | 0.4 | related | one object carried across |

## Notes on the catalogue

- A transition overlaps two scenes for its duration: one progress value, shaped by a timing curve, drives both sides, so the running time is the scenes' total less every overlap
- A light-leak, film-burn or flash overlay keeps its own length (0.5-1.0 s) when laid over another cut; only the underlying cut follows the energy column
- Give each kind of change its own kind of cut, so the viewer learns what each cut means
- Default policy: the transition owns the exit. Elements do not fade out before a cut; an explicit exit is for something leaving mid-scene, the last scene, or a motion style that declares velocity-matched cuts [SPEC §15]
- Velocity-matched pairs (the outgoing move hands its speed to the incoming one) are a policy of the motion style, not a catalogue entry
- The final rest holds rather than fading, unless the style names a fade as its outro [SPEC §15]
- Default per-position choices in a style file: opening hard-cut, topic change wipe, climax zoom-through, outro fade [SPEC §3]

## Not in the catalogue

- vertical-push and four-way slide (variants of push)
- elastic-push (bouncy, 0.5 / 0.3 s) and squeeze (tight, 0.4 / 0.3 s)
- focus-pull and blur-through (variants of blur-crossfade)
- diamond and SDF iris, morph-circle, staggered-blocks (variants of iris, flip, grid-dissolve)
- cross-warp, domain-warp, thermal, swirl, ripple-waves (fluid, for openings or climaxes, 0.5-1.0 s)
- glitch, chromatic, vhs, ridged-burn (jarring, for climaxes, 0.15-0.5 s)
- page-burn (high energy only, 1.2 s or more, one hero moment per film)
- draw-on and path-morph reveals as scene joins (0.8-1.2 s)
- tile, hex and dot transitions are banned looks, not deferred ones

## Energy to transition to duration

| energy | preferred cuts | duration band | what it feels like |
|---|---|---|---|
| calm | crossfade, blur-crossfade, color-dip, push, light-leak | 0.6-1.2 s | relaxed, polished, flowing |
| medium | crossfade, push, wipe, iris, split, zoom-through, shared-element | 0.3-0.6 s | measured, steadily advancing |
| high | hard-cut, whip-pan, zoom-through, flip, grid-dissolve | 0.15-0.4 s | quick, punchy, urgent |

- A style declares an energy and picks one primary cut plus one or two accents; durations scale from the role multipliers in the card, never from literals in markup [SPEC §3]
- Interaction-speed caps from UI guidance (nothing over 300 ms) do not apply to film; durations are per-role budgets [SPEC §15]
- Ease-in is legal on a wind-up or an exit; the no-ease-in rule is an interface rule, not a film rule [SPEC §15]
- The first arrival in a scene waits at least 0.1 s after the incoming cut settles

## Narrative position

| position | use | avoid | why |
|---|---|---|---|
| opening | blur-crossfade, light-leak, hard-cut | slow wipes that delay the hook | the first image has to land within two seconds |
| related | crossfade, push, shared-element, whip-pan | flashy cuts that imply a new topic | the viewer should feel the thought continue |
| topic change | wipe, iris, clock-wipe, split, blinds, flip, color-dip, zoom-out | crossfade (it says "continues") | the cut is the paragraph break |
| climax | hard-cut, zoom-through, zoom-out, light-leak | anything slow | weight and disruption mark the peak |
| wind-down | crossfade, blur-crossfade, light-leak | hard cuts | energy falls before the end |
| outro | color-dip, crossfade, or a held final rest | a fade-out by habit | the last frame is the line to remember [SPEC §15] |
