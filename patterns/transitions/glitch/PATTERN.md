# transitions/glitch

## Purpose
A cut that breaks up for a moment: horizontal bands of the picture slip sideways, the two scenes stutter for a frame or two, and the next scene lands whole.

## Use when / Do not use when
**Narrative position:** a turn, a reveal, a switch of topic in a tech or launch film. **Mood:** jarring, digital.

**Use when**
- the brand's look is technical and allows a rough edge (a developer tool, a game, a launch countdown)
- once or twice a film, on a beat of its soundtrack

**Do not use when**
- a calm, premium or institutional brand: it reads as a broken file
- a run of cuts, or scenes of dense small type
- a viewer who may be sensitive to flicker is the audience (the stutters are capped, but the cut is still abrupt)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `strength` | number | 0.6 | how hard it breaks up, 0 to 1: the bands slip up to 6 % of the frame's width at 1 |
| `bands` | number | 14 | how many horizontal bands across the frame, 4 to 40 |
| `stutter` | enum(true|false) | `true` | whether the two scenes swap for a single frame once or twice around the middle of the cut |

Brand knobs: strength, bands, stutter

## Style variables consumed
- duration role `standard`, the cut's length
- no colour: the bands move the scenes' own pixels, so every pixel is the brand's

## Legibility and rest notes
- One scene is drawn in any frame (the outgoing one to the middle, then the incoming), so no type is exposed twice; a stutter swaps for a single frame, at most twice, inside the middle of the cut.
- The bands are an SVG displacement: seeded fractal noise with almost no variation across the frame, quantised into steps so most bands stay put and a few slip left or right; the pattern is reseeded 24 times a second of the cut's time and its strength rises to the middle of the cut and is gone by 90 % of it. At p = 1 nothing is written, so the incoming scene rests exactly as itself.
- Pure in the cut's time and a seed taken from the scene: any seek order draws the same frame. QA-FLASH reads the finished file for flicker.
- An opt-in tech look: no preset uses it; a story names it.

## Provenance
- pmndrs/postprocessing, Zlib: the seeded glitch burst (bands slipped by a perturbation map, a stronger burst now and then), restated as an SVG displacement on a stepped clock. No code taken.

## Known limits
- No colour split: the scenes' grounds are opaque, so a channel ghost would only show over bare canvas.
- The slip is horizontal only.
