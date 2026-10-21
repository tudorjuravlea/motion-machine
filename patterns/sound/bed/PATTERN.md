# sound/bed

## Purpose
Marks a held rest: a quiet loop under the scene, synthesised in three feels with no samples.

## Use when / Do not use when
Use when:
- a held rest where silence would feel like a dropout
- under cues, never over a supplied track at the same level

Do not use when:
- a piece with a user track (the pipeline mixes the bed at -6 dB under it, or leaves it out)
- a style whose `sound.palette` is `none`

## Params
`render(ctx, at, feel, opts)`: `ctx` is a Web Audio BaseAudioContext (an OfflineAudioContext at render time), `at` the start in seconds, `feel` one of `soft-ui`, `percussive`, `cinematic` (`none` renders nothing). `opts` may carry the params below and `durationS` (a longer span than the default cell). The module exports `durationS`.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 0.12 | peak of the bed (0 to 1) |
| seed | number | 97 | seed for the noise component (cinematic feel) |

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The `feel` argument comes from `style.sound.palette`; the style's `loudnessLufs` is applied by the mix, not here. Feels:
- soft-ui: three low sine partials with a slow swell
- percussive: three triangle partials with a quicker pulse
- cinematic: a sub and a fifth with a band of filtered noise

## Legibility and rest notes
Marks a held rest: a quiet loop under the scene; a cue with no visible event does not exist (W-CUE). Length: a loop of 1 to 1.6 s (module `durationS` 1.6). Peak: the gain envelope peaks at `gain` (default 0.12), calibrated by rendering through an OfflineAudioContext so the sample peak lands within 0.005 of it in every feel; level is linear in `gain`. Band: the partials sit below about 1 kHz and the whole bed is low-passed at or below 1.5 kHz, so it stays under 4 kHz and clear of the cues. Render is deterministic: noise comes from a seeded generator, never Math.random, and the module touches no `window` or AudioContext at import. The bed fades in over 0.3 s and out over 1.5 s (shortened to fit a span under 1.8 s); its partials sit on whole cycles of the 1.6 s cell, so the cell loops with no seam. The cue is a one-shot under 1.5 s and retriggers no sooner than 45 ms after itself (a mixing rule the gate reads, not the module).

## Provenance
original: synthesised from oscillators, filters and seeded noise; no audio is sampled. The cue vocabulary, the one-shot-under-1.5 s limit and the 45 ms cooldown follow the `romainsimon/uisfx` taxonomy (code MIT, audio CC0), taken as principles; row in `PROVENANCE.md`.
mulberry32, public domain: the seeded noise generator in `runtime/kit/synth.js`, so a cue renders to the same samples every time; the generator is taken unchanged.

## Known limits
- Synthesis is deliberately plain; a brand that wants a signature sound points cues at CC0 samples shipped in the piece instead.
- Mono, a single cell: the pipeline tiles it or renders a longer span with `opts.durationS`.
- Rendered peaks can differ by one 16-bit step between runs in Chromium; the module itself has no random state.
