# sound/counter

## Purpose
Marks the final tick of a counting number: the digit that lands on its value. A short bright tick with a pitched head, written as data.

## Use when / Do not use when
Use when:
- a number that counts up and stops
- a stat or a price landing
- the last step of a progress count

Do not use when:
- every digit of the count (one cue on the last)
- a counter that never settles
- a button press (use `click`)

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.055.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 2628574755 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "counter", "params": { "cue": { "emphasis": "strong" } } }`.

Brand knobs: durS, emphasis, gain. A brand sets them for every use with `style.patterns["sound/counter"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: a counting number lands on its final value. A cue with no visible event does not exist (W-CUE). Material: a band-passed noise tick at 5.2 kHz over a sine head that falls from 1568 to 1318.5 Hz with a high partner at 2.76; normal adds a body at 392 Hz and strong a sparkle an octave and a half up. Contour: a falling head: it settles as it lands. Length: 0.055 s, the input family (up to 0.06 s). Emphasis arrangements: subtle: the tick and the head; normal: adds the body; strong: adds the sparkle. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -30.0 LUFS and under soft-ui -32.7 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Passes W-PALETTE under both shipped profiles at every emphasis. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its UI ticks: a short noise snap with a tonal partner and a body under it, in the input family. The code is our own. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- It is one tick: a count with several beats needs one cue per beat.
- It varies a little each time (pitch and force together).
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
