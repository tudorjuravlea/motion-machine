# sound/pop-in

## Purpose
Marks an element appearing on screen: an icon, a card, a chip, a label. A soft low thump with a thin tick on top, written as data.

## Use when / Do not use when
Use when:
- an icon or chip popping in
- each item of a short stagger (one pop per element, about every 200 ms)
- a label landing on a card

Do not use when:
- a touch on a control (use `tap`)
- an element that fades in without a scale or a move
- a long list: stop after four or five

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.18 for the round version.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 490369356 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| variant | string | round | `round` (one soft thump), `double` (a second, smaller thump 65 ms later) or `deep` (lower and heavier); a brand sets it once |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "pop-in", "params": { "cue": { "variant": "double" } } }`.

Brand knobs: variant, emphasis, gain. A brand sets them for every use with `style.patterns["sound/pop-in"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: an element appears on screen: an icon, a card, a chip, a label. A cue with no visible event does not exist (W-CUE). Material: a sine thump that falls from 142 to 105 Hz with a faint second harmonic and a held shape (it holds, sags, then stops), a band-passed noise tick at 3.5 kHz 34 dB under it that lands as the thump peaks; strong adds an octave-down partner. Contour: a 12 ms rise to the peak, a short sag, then a stop; the double version repeats a quarter higher. Length: 0.14 to 0.27 s: 0.18 (round, deep) and 0.24 (double); the rendered tail is 0.09 to 0.16 s above -40 dB. Emphasis arrangements: subtle: the thump; normal: adds the tick; strong: adds the octave-down partner. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -29.9, -29.9, -30.2 (round, double, deep) LUFS and under soft-ui -31.8, -31.9, -31.9 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Passes W-PALETTE under both shipped profiles in all three versions at every emphasis. 92 % of its power is under 150 Hz, so soft-ui lifts the partner an octave. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its pop-in: a thump body at 80 to 150 Hz that falls a little in pitch, a held and sagging shape, a short noise tick at 1 to 10 kHz 30 to 40 dB under the body, a quick double in one family. The code is our own. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- The body is a sine: the quality of a real finger on glass is not modelled.
- It varies a little each time (pitch and force together), so a stagger is not one sample repeated; `mm sound` rotates four seeds.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
