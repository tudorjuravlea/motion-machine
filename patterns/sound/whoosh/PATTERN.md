# sound/whoosh

## Purpose
Marks something moving across the frame or the view changing: a slide, a swipe, a push, a cut. One pass of moving air in three lengths, written as data and synthesised from seeded noise.

## Use when / Do not use when
Use when:
- a card or panel sliding in or out
- a scene change with motion in the picture
- a camera push or a wipe

Do not use when:
- a state change that stays (use `toggle-on` or `toggle-off`)
- every element of a stagger: one whoosh per move, not per item
- a hit or an impact (use `cut-hit` or `hit`)

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.5 for the medium version.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 3208755283 | seed for the noise, the spread and the variation; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |
| variant | string | medium | `short` (0.18 s), `medium` (0.48 s) or `long` (1.15 s); a brand sets it once |
| durS | number | 0 | seconds the cue is aimed to last (`runtime/kit/aim.js`: every time of the recipe is scaled, then the cue ends on that second); 0 plays it as written |

A beat sets them in `params.cue`: `{ "cue": "whoosh", "params": { "cue": { "variant": "short" } } }`.

Brand knobs: variant, emphasis, gain. A brand sets them for every use with `style.patterns["sound/whoosh"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: something moves across the frame or the view changes: a slide, a swipe, a push, a cut. A cue with no visible event does not exist (W-CUE). Material: moving air: seeded noise through three band-passes at f, 1.6 f and 2.5 f under a low-pass, a brown-noise low band, a soft-saturated sub that sinks after the apex and a hiss whose top opens with the motion (a `pass` layer). Contour: the level rises into an apex at 50 to 70 % of the length (the loudest 5 ms sits at 59 % of the short, 58 % of the medium and 63 % of the long) and falls out of it; the bands sink as the pass goes by, with a little Doppler. The placement lot anchors the apex on the cut. Length: 0.18 s (surface family), 0.48 s (outcome) and 1.15 s (swell); every time of a version scales together when a profile asks for less or `durS` aims it. Emphasis arrangements: one gesture: the three arrangements play the same layer. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; under glass it measures -30.0 (short), -30.0 (medium), -30.1 (long) LUFS and under soft-ui -31.8, -31.9, -33.2 LUFS (the profiles ask -30 and -32, within 1.5 dB at normal emphasis). Under both shipped profiles every version passes W-PALETTE (register, attack, length, level, peak) at every emphasis. Soft-ui shortens the medium version to 0.30 s and lifts its sub and low band out of the 70 Hz floor. Render is deterministic: seeded noise and seeded variation, no clock, no Math.random.

## Provenance
Leonxlnx/earshot, MIT. Ported in idea and in shape from its whoosh pass engine: one level curve in dB with a rise exponent under 1 into the apex and a fall exponent over 1 after it, one motion value driving band-passes at f, 1.6 f and 2.5 f plus a low band, a sub and a hiss, and an optional Doppler glide. The code is our own JavaScript, seeded, in `runtime/kit/synth.js`. The numbers are our own, set by rendering and measuring in `mm sound-listen`; no code is run from it and no sound file is taken.

## Known limits
- The loudest 5 ms of a noise pass jumps by tens of ms when a field moves; `aim` lands an apex by starting the cue a few ms later (`runtime/kit/aim.js`).
- Noise only: a pass has no pitch, so `aim` refuses a pitch target on it.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
