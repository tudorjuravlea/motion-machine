# sound/step

## Purpose
Marks progress advancing: a counter step, a list item, a stage, synthesised in three feels with no samples.

## Use when / Do not use when
Use when:
- each item of a list or stage of a process as it arrives
- a counter ticking over a visible milestone

Do not use when:
- a continuous count (one cue at the start, not one per frame)
- a single arrival (use `tick`)

## Params
`render(ctx, at, feel, opts)`: `ctx` is a Web Audio BaseAudioContext (an OfflineAudioContext at render time), `at` the start in seconds, `feel` one of `soft-ui`, `percussive`, `cinematic` (`none` renders nothing). `opts` may carry the params below. The module exports `durationS`.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 0.35 | peak of the cue gain envelope (0 to 1) |
| seed | number | 41 | seed for the noise component; the same seed renders the same samples |

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The `feel` argument comes from `style.sound.palette`; the style's `loudnessLufs` is applied by the mix, not here. Feels:
- soft-ui: a rising sine blip with an octave sparkle
- percussive: a dry triangle blip with a tick
- cinematic: a soft open fifth

## Legibility and rest notes
Marks progress advancing: a counter step, a list item, a stage; a cue with no visible event does not exist (W-CUE). Length: no more than 150 ms (module `durationS` 0.14). Peak: the gain envelope peaks at `gain` (default 0.35), calibrated by rendering through an OfflineAudioContext so the sample peak lands within 0.005 of it in every feel; level is linear in `gain`. Band: most of the energy sits above roughly 800 Hz in every feel, clear of the bed. Render is deterministic: noise comes from a seeded generator, never Math.random, and the module touches no `window` or AudioContext at import. The cue is a one-shot under 1.5 s and retriggers no sooner than 45 ms after itself (a mixing rule the gate reads, not the module).

## Provenance
original: synthesised from oscillators, filters and seeded noise; no audio is sampled. The cue vocabulary, the one-shot-under-1.5 s limit and the 45 ms cooldown follow the `romainsimon/uisfx` taxonomy (code MIT, audio CC0), taken as principles; row in `PROVENANCE.md`.
mulberry32, public domain: the seeded noise generator in `runtime/kit/synth.js`, so a cue renders to the same samples every time; the generator is taken unchanged.

## Known limits
- Synthesis is deliberately plain; a brand that wants a signature sound points cues at CC0 samples shipped in the piece instead.
- Mono output; the mix decides placement.
- Length is fixed by the module; the pipeline does not stretch it.
- Rendered peaks can differ by one 16-bit step between runs in Chromium; the module itself has no random state.
