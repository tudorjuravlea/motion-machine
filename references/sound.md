# Sound

Sound is a set of short cues named by the visible event they mark, an optional quiet bed, and an optional music track supplied by the user. A cue that marks no visible event does not exist.

## The nine cues

| cue | marks | duration |
|---|---|---|
| tick | a small arrival: a chip, a word, a bar landing | 40-90 ms |
| press | a deck press or a button | about 60-120 ms (proposed) |
| swipe | a transition between scenes; its length follows the cut | about 0.2-0.6 s (proposed) |
| step | progress advancing: a counter step, a list item, a stage | about 80-150 ms (proposed) |
| hit | a slam or a figure landing | about 0.15-0.4 s (proposed) |
| riser | the second before a climax | about 1 s (proposed) |
| success | a positive outcome | about 0.3-0.6 s (proposed) |
| complete | the end card | about 0.6 s |
| bed | a quiet loop under a held rest | loop of 1-1.6 s |

- Every cue is a one-shot under 1.5 s, except the bed, which loops
- Ranges marked proposed are starting points for the sound pipeline to tune, not measured figures
- Cues are named by the event, not by the sound, so the vocabulary stays neutral across brands
- Errors, if ever needed, differ from success by contour (falling against rising), not by level
- Meme-style effects and spectrum or equaliser visuals are banned looks, not cues

## The feels

- soft-ui: rounded, low-brightness taps and gentle air; suits calm and premium products
- percussive: short, dry, punchy hits with fast decay; suits medium and high energy
- cinematic: low impacts, longer swells and whooshes; suits climaxes and trailers
- none: the piece is silent and the sound gates report a skip [SPEC §9]
- A feel comes from the style's sound palette; the default cue gain is about 0.35
- A style may instead point cues at CC0 samples shipped inside the piece

## Mixing rules (SPEC §9)

- At most two cues sound at once
- A cue retriggers no sooner than 45 ms after itself
- Cue peaks sit 6-8 dB above the bed
- Cues per 10 s stay in the motion style's band; the usable range is 0-9, and quiet styles sit at the low end
- Keep the bed below roughly 4 kHz and the effects above roughly 800 Hz so they do not mask one another
- A cue is placed at its beat's arrival instant, snapped to the nearest grid beat when a beat map exists; the drift before snapping is reported by W-CUE (more than 40 ms) [SPEC §9]
- Place each cue with its own delay and sum with normalisation off, so adding a cue never changes the others' level
- The bed sits at -6 dB under a user track; the track itself is used unchanged [SPEC §9]
- Resample everything to 48 kHz, pad or trim to the exact picture length, and compare stream durations afterwards
- Loudness uses two passes: measure, then normalise in linear mode to the style's integrated target (default -14 LUFS) with true peak at -1 dBTP; G-LOUD accepts one LUFS either side [SPEC §9]
- A fade-in of about 0.3 s and a fade-out of about 1.5 s on the full mix are usual

## The CC0 sample option

- The `romainsimon/uisfx` pack is under CC0 for audio and MIT for its code, so its samples may be copied into a piece and shipped
- Its thirteen categories collapse into our nine cues; its one-shot-under-1.5 s and 45 ms cooldown rules are the same as ours
- Samples must travel inside the piece folder; no remote fetch, ever [SPEC §9]
- Samples are optional: synthesis is the default and keeps the repo licence-clean

## What "no music composition" means for a brief

- Motion Machine does not compose a score. A brief may supply a track (used unchanged, with an optional bpm), or choose cues plus a bed, or choose silence [SPEC §9]
- A brief that asks for original music is answered by naming the gap and offering those three options
- When a track exists, scenes are sized to whole beats and edits join on downbeats with a 12 ms crossfade
- Without a track, no beat map exists and cue snapping is skipped [SPEC §9]
- Tempo, beat times and first downbeat are measured from the supplied file in Node, not guessed
