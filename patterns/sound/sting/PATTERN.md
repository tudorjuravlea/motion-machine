# sound/sting

## Purpose
Marks a logo or a title landing: a short build, a stop, the hit and a tonal bloom that rings out. The key of the bloom is a param.

## Use when / Do not use when
Use when:
- a logo reveal or an end card
- a title landing at the end of a build
- once, on the one moment the piece is about

Do not use when:
- more than once a piece
- a quiet style under a calm brief
- anything under three seconds of picture after the hit

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 3.1.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 3439895774 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| key | string | C | the pitch class the tonal layers are in (`C`, `F#`, `Bb`); the layers marked keyed move to it by the shortest interval, and a profile's key still wins |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "sting", "params": { "cue": { "key": "G" } } }`.

Brand knobs: key, emphasis, gain. A brand sets them for every use with `style.patterns["sound/sting"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: a logo or a title lands: a short build, a stop, the hit and a tonal bloom that rings out. A cue with no visible event does not exist (W-CUE). Material: a gated build (pulses of band-passed noise sweeping up 0.9 to 7 kHz, the period shrinking from 24 to 20 ms and the last pulse open) over a rising sine; after a 60 ms stop a sine hit that falls 130 to 52 Hz and a noise snap, then a bloom of three glass bells (a triad on the key, 2.6 s t60, doublets beating at 0.8 Hz); strong adds a sparkle. Contour: the build rises for 0.36 s and stops; the hit lands at 0.42 s; the bloom rings 2 to 4 s after it (t60 2.6 s; 1.96 s above -40 dB). Length: 3.1 s, a swell; the hit sits 0.42 s after the onset of the cue. Emphasis arrangements: subtle: hit and bloom; normal: adds the build; strong: adds the sparkle. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -30.0 LUFS and under soft-ui -33.2 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Passes W-PALETTE under both shipped profiles at every emphasis. A profile with `modes: none` voices the bells as sines. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its logo sting: a build that stops, a hit on the logo frame, and a tonal bloom of struck bells (modal partials with a doublet beat), with the key of the bloom chosen by a parameter, plus the accelerating gate of its riser. The code is our own. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- The role table places a sting by its onset, so the hit lands 0.42 s after the beat it is placed on; the placement lot reads the hit.
- The key moves the layers marked keyed by the shortest interval from C; a profile's key still snaps them.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
