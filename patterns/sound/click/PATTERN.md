# sound/click

## Purpose
Marks a button pressed and let go: a bright click with its release. Four layers into a high-pass, a dip, soft saturation and a hard end.

## Use when / Do not use when
Use when:
- a button press in a recorded interface
- a toggle or a key on a pad
- a click with its release when the finger is shown lifting

Do not use when:
- a touch on a surface (use `tap`)
- a hover
- a keystroke in a text (use `key`)

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.11 for the press and release version.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 1551804527 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| variant | string | press-release | `press-release` (the press and a quieter release 85 ms later) or `press` alone; a brand sets it once |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "click", "params": { "cue": { "variant": "press" } } }`.

Brand knobs: variant, emphasis, gain. A brand sets them for every use with `style.patterns["sound/click"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: a button is pressed and let go: a click with its release. A cue with no visible event does not exist (W-CUE). Material: a short burst of band-passed noise at 6 kHz, a tink of three damped partials at 6.2 kHz and its inharmonic partners, a body at 600 Hz that falls to 510, a grit tail at 3.2 kHz; then a 200 Hz high-pass, a 3 dB dip at 3.2 kHz, soft saturation and a hard end. Contour: a snap and a short tail; the release is 85 ms later and about 1.5 dB under the press. Length: 0.11 s (surface family) with the release, 0.05 s for the press alone. Emphasis arrangements: subtle: burst, tink and body; normal: adds the grit; strong: adds an air burst. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -30.7 (press and release), -30.4 (press) LUFS and under soft-ui -33.2, -32.8 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Passes W-PALETTE under both shipped profiles in both versions at every emphasis. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its UI click: a squared-decay noise burst, one to three tink partials at 5 to 8 kHz, a 150 to 1200 Hz body, a grit tail, then a high-pass, a de-harsh dip at 2.5 to 4 kHz, soft saturation and a hard-end gate, with an optional quieter release click. The code is our own. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- The dip and the saturation are the cue's `finish`, applied before the room, so a profile's room is not harsh.
- It varies a little each time (pitch and force together).
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
