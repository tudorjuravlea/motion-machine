# sound/success

## Purpose
Marks a positive outcome. Two renderings share the name: the code cue (`pattern.js`), three rising notes synthesised in three feels, plays when the style names no `sound.profile`; the recipe (`recipe.json`), a rising spread triad (C, then G, then E above) struck on a mallet with the room doubled, plays when it does.

## Use when / Do not use when
Use when:
- a check, a confirmation or a delivered result on screen
- a figure that is good news

Do not use when:
- a neutral arrival
- a negative outcome (an error would fall in contour, not in level)

## Params
`render(ctx, at, feel, opts)`: `ctx` is a Web Audio BaseAudioContext (an OfflineAudioContext at render time), `at` the start in seconds, `feel` one of `soft-ui`, `percussive`, `cinematic` (`none` renders nothing). `opts` may carry the params below. The module exports `durationS`.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 0.35 | peak of the cue gain envelope (0 to 1) |
| seed | number | 71 | seed for the noise component; the same seed renders the same samples |

The recipe takes `gain` (a multiplier, 1 is its matched level), `seed` (the side spread; the default is a number taken from the name) and `emphasis` (`subtle`, `normal` or `strong`: which layers play: the triad alone, the triad with an octave ornament, and that plus a high fifth), set in a beat's `params.cue`. Its `durationS` is 0.6.

Brand knobs: emphasis, gain. A brand sets them for every use with `style.patterns["sound/success"]`; the beat's own values win. The code cue reads `gain` and `seed` from the same place.

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The `feel` argument comes from `style.sound.palette`; the style's `loudnessLufs` is applied by the mix, not here. When `style.sound.profile` is set the recipe plays and the profile (a name in `styles/sound/` or a path) sets its key, register, attack and length ceilings, room, width and level; `feel` is then not read. Feels of the code cue:
- soft-ui: three rising sine notes
- percussive: three short triangle notes
- cinematic: the same notes over a low third

## Legibility and rest notes
Marks a positive outcome; a cue with no visible event does not exist (W-CUE). Length: 0.3 to 0.6 s (module `durationS` 0.5). Peak: the gain envelope peaks at `gain` (default 0.35), calibrated by rendering through an OfflineAudioContext so the sample peak lands within 0.005 of it in every feel; level is linear in `gain`. Band: most of the energy sits above roughly 800 Hz in every feel, clear of the bed. Render is deterministic: noise comes from a seeded generator, never Math.random, and the module touches no `window` or AudioContext at import. The cue is a one-shot under 1.5 s and retriggers no sooner than 45 ms after itself (a mixing rule the gate reads, not the module).

## Provenance
original: synthesised from oscillators, filters and seeded noise; no audio is sampled. The cue vocabulary, the one-shot-under-1.5 s limit and the 45 ms cooldown follow the `romainsimon/uisfx` taxonomy (code MIT, audio CC0), taken as principles; row in `PROVENANCE.md`.
danielwh2/cuelume, MIT. The recipe only: ideas restated (mallet material for outcomes, a rising contour, a spread voicing, a doubled room, levels matched on the loudest 100 ms); the numbers are our own, set by rendering and measuring; no code and no sound file is taken.
mulberry32, public domain: the seeded noise generator in `runtime/kit/synth.js`, so a cue renders to the same samples every time; the generator is taken unchanged.

## Known limits
- Synthesis is deliberately plain; a brand that wants a signature sound points cues at CC0 samples shipped in the piece instead.
- Mono output; the mix decides placement.
- Length is fixed by the module; the pipeline does not stretch it.
- Rendered peaks can differ by one 16-bit step between runs in Chromium; the module itself has no random state.
- The recipe was set by measurement, not by ear; `mm sound-listen` writes a page of players beside the numbers. The room is shared with every other recipe cue and is doubled here.
