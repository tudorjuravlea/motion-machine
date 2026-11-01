# sound/ding

## Purpose
Marks a notification arriving or a small success: a message, a saved change, a step done. A struck head with a held partial, a gate that drops it, and a quiet tremolo body.

## Use when / Do not use when
Use when:
- a message or a notification arriving
- a small success (a saved change, a step done)
- each step of a short checklist, with `step` climbing a ladder

Do not use when:
- an error or a warning (use `error` or `warning`)
- every item of a long list
- the end of a piece (use `complete`)

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.32.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 957926053 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| step | number | 0 | semitones the whole cue is raised: give each repeat of a run one more and the run climbs a ladder |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "ding", "params": { "cue": { "step": 2 } } }`.

Brand knobs: step, emphasis, gain. A brand sets them for every use with `style.patterns["sound/ding"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: a notification arrives, or a small success: a message, a saved change, a step done. A cue with no visible event does not exist (W-CUE). Material: a sine head at 1760 Hz with a partner at 3.42 times, a doublet beating at 0.8 Hz; a body an octave under (880 Hz with partials at 3 and 6.93) that swells in and shivers at 24 Hz; a mallet tick from normal. Contour: the head holds for 34 ms, then a gate drops it 20 dB; the body rings on under it. With `step` each repeat is a semitone higher. Length: 0.32 s (outcome family); 0.13 s above -40 dB. Emphasis arrangements: subtle: head and body; normal: adds the tick; strong: adds the octave sparkle. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -30.0 LUFS and under soft-ui -32.2 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Passes W-PALETTE under both shipped profiles at every emphasis. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its notification ding: a struck head with one inharmonic partner, a gate that drops it about 20 dB after 30 to 50 ms, a quiet body with a tremolo, and a semitone up on each repeat. The code is our own. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- A profile with `modes: none` (soft-ui) strips the head's partner; the doublet and the gate stay.
- A ladder leaves the profile's key on purpose: `step` is chromatic.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
