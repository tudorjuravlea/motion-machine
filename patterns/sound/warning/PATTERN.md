# sound/warning

## Purpose
Marks a caution: a level fifth struck twice on a mallet, about 0.6 s. It neither rises nor falls: something needs a second look and it is not yet wrong.

## Use when / Do not use when
Use when:
- a risky action about to happen
- a figure that is not good news and not yet bad
- an alert the viewer can still act on

Do not use when:
- a failure that already happened (use `error`)
- a nudge (use `attention`)
- a confirmation (use `success`)

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.6 (in a profile with a shorter ceiling it is shorter).

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 2032210671 | seed for the noise, the side spread; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |

A beat sets them in `params.cue`: `{ "cue": "warning", "params": { "cue": { "emphasis": "strong" } } }`.

Brand knobs: emphasis, gain. A brand sets them for every use with `style.patterns["sound/warning"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: something needs a second look: a caution, a risky action, a figure that is not good news and not yet bad. A cue with no visible event does not exist (W-CUE). Material: mallet. Contour: level (A and E together, struck once, then again softer). Length: 0.6 s, the outcome family of the length ladder (input up to 0.06 s, surface up to 0.3 s, outcome up to 0.65 s). Emphasis arrangements: normal: the fifth, then the same fifth again softer; subtle: one strike; strong: adds the octave above the root on the first strike. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; a profile moves it to its own level and `mm sound-listen` prints the numbers. The cue is a one-shot under 1.5 s and retriggers no sooner than 45 ms after itself (a mixing rule the gate reads); never per word, per token or on a hover. Render is deterministic: seeded noise, no clock, no Math.random.

## Provenance
danielwh2/cuelume, MIT. Ideas only, restated: the material marks the family, contour carries meaning, a length ladder, one shared room, levels matched on the loudest 100 ms. The recipe numbers are our own, set by rendering and measuring; no code and no sound file is taken.

## Known limits
- The fifth is open: it carries no major or minor mood, which is the point.
- Synthesis is deliberately plain; a brand that wants a signature sound writes its own recipe (`mm sound-listen --calibrate` sets its level) or points a cue at a licensed sample shipped in the piece.
- Sines, filtered noise and a short room only: nothing is centred above 5 kHz (glass) and nothing sounds below 40 Hz.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
