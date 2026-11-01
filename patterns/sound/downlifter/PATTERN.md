# sound/downlifter

## Purpose
Marks the push after an impact letting go: a hit lands and the scene settles, a reveal relaxes. A filter that closes over noise, a falling tone and a sub, synthesised with no samples.

## Use when / Do not use when
Use when:
- the second after a `hit`, `cut-hit` or `sting`
- a reveal that settles into a held shot
- the end of a tension build

Do not use when:
- before the beat (that is a riser)
- under speech with no music or picture event
- more than once a piece

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 1.62.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 710287515 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "downlifter", "params": { "cue": { "durS": 1.2 } } }`.

Brand knobs: durS, emphasis, gain. A brand sets them for every use with `style.patterns["sound/downlifter"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: the push after an impact lets go: a hit lands and the scene settles, a reveal relaxes. A cue with no visible event does not exist (W-CUE). Material: noise through a resonant low-pass that closes from 6 kHz to 220 Hz (a swept `noise` layer with a breakpoint envelope in dB and a high-pass chain), a sine gliding down two octaves, a sub falling 90 to 42 Hz; strong adds a bright band that closes with it. Contour: a swell-in over 90 ms (a push that reads as a sweep, not a hit), then a decelerating fall; the centre of its sound falls by more than half between the first 0.4 s and the last. Length: 1.62 s, a swell with no length band; it fades to silence rather than cutting. Emphasis arrangements: subtle: noise and sub; normal: adds the falling tone; strong: adds the closing band. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -30.1 LUFS and under soft-ui -32.1 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Passes W-PALETTE under both shipped profiles at every emphasis. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its downlifter: decelerating curves (fast at first, settling at the end), a resonant low-pass closing on noise, a falling tone, a falling sub, a swell-in so it can sit right after an impact. Breakpoint envelopes in dB and the sweeping filter are in `runtime/kit/synth.js`. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- A tonal layer sinks with the noise; there is no flanger or shepard fall.
- The role table has no role for it: it plays as a plain tone placed on its onset.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
