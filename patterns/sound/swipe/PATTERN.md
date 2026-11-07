# sound/swipe

## Purpose
Marks a transition between scenes; the sound pipeline places it on the cut, synthesised in three feels with no samples.

## Use when / Do not use when
Use when:
- a push, wipe, zoom or whip cut that moves the picture
- a cut whose length is close to the cue's

Do not use when:
- a hard cut (a hard cut takes 0 s and carries no sweep)
- a cut with no motion in the picture

## Params
`render(ctx, at, feel, opts)`: `ctx` is a Web Audio BaseAudioContext (an OfflineAudioContext at render time), `at` the start in seconds, `feel` one of `soft-ui`, `percussive`, `cinematic` (`none` renders nothing). `opts` may carry the params below. The module exports `durationS` and `anchor: 'end'`: the schedule places the cue so its end, not its start, lands on the beat's arrival (the cut for `swipe`, the landing of the figure or headline for `riser`); a cue without `anchor` starts on the beat.

| name | type | default | meaning |
|---|---|---|---|
| gain | number | 0.35 | peak of the cue gain envelope (0 to 1) |
| seed | number | 37 | seed for the noise component; the same seed renders the same samples |

## Style variables consumed
None of the `--mm-*` variables: a sound pattern has no CSS. The `feel` argument comes from `style.sound.palette`; the style's `loudnessLufs` is applied by the mix, not here. Feels:
- soft-ui: a band of air sweeping up in pitch
- percussive: a short bright whip
- cinematic: a darker sweep with a low fall under it

## Legibility and rest notes
Marks a transition between scenes; the sound pipeline places it on the cut; a cue with no visible event does not exist (W-CUE). Length: 150 to 350 ms (module `durationS` 0.3). Peak: the gain envelope peaks at `gain` (default 0.35), calibrated by rendering through an OfflineAudioContext so the sample peak lands within 0.005 of it in every feel; level is linear in `gain`. Band: the soft-ui and percussive feels sit mostly above roughly 800 Hz; the cinematic feel carries a deliberate low body (a sub or a low fifth) under its upper content. Render is deterministic: noise comes from a seeded generator, never Math.random, and the module touches no `window` or AudioContext at import. The cue is a one-shot under 1.5 s and retriggers no sooner than 45 ms after itself (a mixing rule the gate reads, not the module).

## Provenance
original: synthesised from oscillators, filters and seeded noise; no audio is sampled. The cue vocabulary, the one-shot-under-1.5 s limit and the 45 ms cooldown follow the `romainsimon/uisfx` taxonomy (code MIT, audio CC0), taken as principles; row in `PROVENANCE.md`.
mulberry32, public domain: the seeded noise generator in `runtime/kit/synth.js`, so a cue renders to the same samples every time; the generator is taken unchanged.

## Known limits
- Synthesis is deliberately plain; a brand that wants a signature sound points cues at CC0 samples shipped in the piece instead.
- Mono output; the mix decides placement.
- Length is fixed by the module; the pipeline does not stretch it.
- Rendered peaks can differ by one 16-bit step between runs in Chromium; the module itself has no random state.
