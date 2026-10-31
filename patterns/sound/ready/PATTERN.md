# sound/ready

## Purpose
Marks presence: something is there and ready to use. A glass-bar ring, level in contour, a little over half a second long, with one slow shimmer from a twin a hair sharp of the pitch.

## Use when / Do not use when
Use when:
- an assistant or a service that has come up and is listening
- a screen that has settled and is waiting for the viewer
- a connection made

Do not use when:
- an outcome that finished (use `success`)
- a notification that wants a look (use `attention`)
- every time a panel appears (use `open`)

## Params
A recipe cue: `recipe.json` holds the cue as layers (contracts/sound-recipe.schema.json) and the sound system draws it with `layers()` in `runtime/kit/synth.js`. `render(ctx, at, feel, opts)` is the same call as for a code cue; `feel` is not read, because a recipe is voiced by the style's `sound.profile` and not by the palette. `opts` may carry the params below. The module's `durationS` is 0.5 (in a profile with a shorter ceiling it is shorter).

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 1 | a multiplier on the cue; 1 is its matched level |
| seed | number | 1712242932 | seed for the noise, the side spread; the same seed renders the same samples |
| emphasis | string | normal | `subtle`, `normal` or `strong`: which layers play |

A beat sets them in `params.cue`: `{ "cue": "ready", "params": { "cue": { "emphasis": "strong" } } }`.

Brand knobs: emphasis, gain. A brand sets them for every use with `style.patterns["sound/ready"]`; the beat's own values win.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The style's `sound.profile` (a name in `styles/sound/` or a path) sets the key, the register, the attack and length ceilings, the room, the width and the level this cue is voiced at; without one the recipe renders as written. The mix applies the style's `loudnessLufs`, not this pattern.

## Legibility and rest notes
Meaning: something is present and ready to use: an assistant listening, a connection made, a screen settled. A cue with no visible event does not exist (W-CUE). Material: glass bars (partials at 1 : 2.76 : 5.4). Contour: level. Length: 0.5 s, the outcome family of the length ladder (input up to 0.06 s, surface up to 0.3 s, outcome up to 0.65 s). Emphasis arrangements: normal: the bar ring on A and its slow twin, plus the octave above; subtle: the ring and its twin only; strong: adds a fifth above on the first note. Level: `masterGain` is set by measuring so the loudest 100 ms, K-weighted, lands on -30 LUFS rendered as written; a profile moves it to its own level and `mm sound-listen` prints the numbers. The cue is a one-shot under 1.5 s and retriggers no sooner than 45 ms after itself (a mixing rule the gate reads); never per word, per token or on a hover. Render is deterministic: seeded noise, no clock, no Math.random.

## Provenance
danielwh2/cuelume, MIT. Ideas only, restated: the material marks the family, contour carries meaning, a length ladder, one shared room, levels matched on the loudest 100 ms. The recipe numbers are our own, set by rendering and measuring; no code and no sound file is taken.

## Known limits
- A single static pitch: it says "here", never "done".
- Synthesis is deliberately plain; a brand that wants a signature sound writes its own recipe (`mm sound-listen --calibrate` sets its level) or points a cue at a licensed sample shipped in the piece.
- Sines, filtered noise and a short room only: nothing is centred above 5 kHz (glass) and nothing sounds below 40 Hz.
- It was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers.
