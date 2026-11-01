# sound/key

## Purpose
Marks one key of a type-on: a character landing in a text that is being written. High-passed noise with a touch before the hit.

## Use when / Do not use when
Use when:
- a headline or a line of code typing on, one cue per character at 9 to 14 a second
- a search field filling in
- a terminal prompt

Do not use when:
- a whole paragraph (stop after the first words)
- a text that fades in whole
- a click on a control (use `click`)

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.075.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 1746258028 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |

A beat sets them in `params.cue`: `{ "cue": "key", "params": { "cue": { "gain": 0.8 } } }`.

Brand knobs: emphasis, gain. A brand sets them for every use with `style.patterns["sound/key"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: one key of a type-on: a character lands in a text that is being written. A cue with no visible event does not exist (W-CUE). Material: seeded noise through a three-stage high-pass at 3.4 kHz, a ridge at 9.6 kHz and a low-pass at 15 kHz: nothing under 2 kHz (0.0005 % of its power is under it); a smaller touch 3 ms before the hit, and a faint release tick from strong. Contour: a 3 ms rise, a drop of about 20 dB within 8 ms, then a faint tail with a convex end; no pitch. Length: 0.075 s (surface family); 0.06 s above -40 dB. Emphasis arrangements: subtle: the hit; normal: adds the touch; strong: adds the release tick 52 ms later. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -32.2 LUFS and under soft-ui -35.8 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Does not pass W-PALETTE, by design: its centre of sound is 9 kHz, over the 5 kHz (glass) and 2.5 kHz (soft-ui) ceilings, and a 5 ms burst at the matched loudness peaks near -13 dBFS. Glass reports register, level and peak; soft-ui register and level. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea from its typing key: noise at 3 to 12 kHz with nothing under 2 kHz, a ridge boost, an attack of about 3 ms, a fast drop to a faint tail, a touch before the hit and an optional release tick. The code is our own. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- The profiles keep every band under their register ceiling; a key is the one cue that cannot sit in it, and the table in tests/sound/engine-cues.test.mjs names what the gate says.
- Each stroke varies in pitch of the ridge and force from one seeded draw; use four seeds across a run (`mm sound` does).
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
