# sound/cut-hit

## Purpose
Marks a hard cut: the picture changes on a beat and the sound lands with it. A kick and a sub, 0.26 s.

## Use when / Do not use when
Use when:
- a hard cut on a beat
- a slam or a title hit
- the first frame of a new scene after a `riser`

Do not use when:
- a soft transition (use `whoosh`)
- a UI event
- twice within a second

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.26.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 481840075 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "cut-hit", "params": { "cue": { "emphasis": "strong" } } }`.

Brand knobs: durS, emphasis, gain. A brand sets them for every use with `style.patterns["sound/cut-hit"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: a hard cut: the picture changes on a beat and the sound lands with it. A cue with no visible event does not exist (W-CUE). Material: a sine sub that falls 225 to 46 Hz, a kick sine that falls 175 to 93 Hz, a bright click, and a band of noise at 374 Hz that gives it a smack; strong adds an air band. Contour: a 16 ms rise, a fast fall: -20 dB at 60 ms, gone by 0.26 s. Length: 0.26 s (surface family); 0.13 s above -40 dB. Emphasis arrangements: subtle: the sub and the kick; normal: adds the click and the smack; strong: adds the air band. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -29.9 LUFS and under soft-ui -33.2 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Passes W-PALETTE under both shipped profiles at every emphasis. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its cut hit: a short sub that falls into the low register under a kick, a beater click and a low-mid smack, 0.26 s long, mostly mono. The code is our own. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- Mono-ish by design: the stereo spread is the profile's.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
