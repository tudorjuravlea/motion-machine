# Defects · golden-film-kinetic

Same story as `golden-film-editorial`; rows raised by this piece's own gate, plus the shared
changes it inherited. Times are film seconds of the current story.
Raised by: `director` (a review of the stills and exports), `crew` (found while building) or `gate <id>` (a rule of `mm check`).

| # | Where | Note | Raised by | Status | Fix |
|---|---|---|---|---|---|
| D1 | 18.5–22.65 s · 9x16 · gate | the gate figure with its unit crosses the safe margin by 271.7 px at the layout's figure size | gate G-EDGE | fixed | story: the figure is a `data/counter` (h1 size role), not the layout's figure size |
| D2 | every soft cut | first arrivals inside the cut (0.08 s inside a 0.28 s cut in the first build) | gate W-STAGGER | accepted | first arrivals enter with the cut, shared with the editorial film: waiting for it to end leaves empty frames after hard cuts; one warning stands, the time headline 0.02 s after the push |
| D3 | hook, style, gate, both | copy longer than reading time | gate W-READ | fixed | shorter copy |
| D4 | problem, patterns | camera moves travelling over the rest (85 px, 39.2 px) | gate W-AMBIENT | fixed | moves removed (shared) |
| D5 | 0–30 s · cues | cues off the grid; no grid file | gate W-CUE | fixed | grid by arithmetic, cues on beats |
| D6 | 26.85–30 s · 9x16 · cta | the URL breaks at its hyphen | crew | accepted | legible on the phone sheet |
| D7 | 16.6–18.47 s · 16x9 · patterns | `--prove`: 57 frames differ between the forward render and the reverse re-render (one pixel, 7/255, after the pop entrances) | crew | fixed (worked around) | tiles `entrances/fade`, whose forward and reverse renders are identical |
| D8 | all · audio | mix -15.4 LUFS, MP4 true peak -0.7 dBTP after AAC | gates W-LOUDNESS and G-PEAK | fixed (outside the piece) | `scripts/sound.mjs` limiter stage and trial AAC encode |
| D9 | 0.00–0.53 s · all formats | the first 16 frames hold only an accent dash; the thumbnail is empty | director | fixed | hook in `layouts/statement`, `instant` at 0 (story); W-HOOK PASS |
| D10 | exits, 18.5 s zoom, counters | smeared multi-exposure exits, blurred zoom-through, ghosted counter digits | director | fixed | export at `--sub 1`; no exits in the story; zoom-through has no blur; kinetic whip-pan `cutParams.amount: 0`; counter digits swap whole |
| D11 | whole piece | editorial and kinetic are one layout, one timing and one cut list recoloured | director | fixed (layout part accepted) | beats as `style:<role>`, scenes by `position`: 7 of 7 cuts and 16 of 18 entrances now differ; the shared left column is a stated limit |
| D12 | cuts, 18.8 s hole | 15–17 % empty frames, a 1.3 s hole before the gate figure | director | fixed | first arrivals enter with the cut; W-EMPTY longest run under 0.5 % ink: 4 frames (editorial), 5 (kinetic) |
| D13 | 0–4 s | the hook is the smallest headline; the irony subtitle is grey micro | director | fixed (cliché image accepted) | hook at display size, largest or tied in every format; the sub is body size; showing the cliché itself has no pattern |
| D14 | fades | a container box shows behind fading text | director | fixed | crossfade fades whole sections; plates fade with their text (cut strips) |
| D15 | 18.5–19.7 s | the riser crests 0.45–0.6 s after the number lands | director | fixed | riser anchored to the counter's landing: crest within 45 ms of the landing |
| D16 | climax cut, scene 7 | the two biggest visual events are silent | director | fixed | the riser spans the climax cut and lands on 37; `hit` on "Povești în mișcare" |
| D17 | 16x9 rests, Romanian line | micro lines illegible at feed width; the Romanian line is the smallest text | director | fixed | "Povești în mișcare" is scene 7's headline in the display face; no fact or call to action in micro text; 16x9 judged at 960 px |
| D18 | 26.5–30 s, loop seam | ends on a logo, the URL wraps mid-name, the loop seam stutters on a dash | director | fixed | final rest "One brief. Any style. Checked." over the unbroken address; the seam cuts to the finished hook |
| D19 | hook entrance | type overshoots about 1.5 % | director | fixed | the hook enters instantly; W-OVERSHOOT PASS on every entrance |
| D20 | gate, cta | centring switches only on the gate and the end card | director | accepted | stat-hero and endcard centre by their cards; a kinetic-only centred grammar would fork the story (a stated limit) |
| D21 | scene 7 | the film never shows a frame the machine made | director | accepted | no layout carries an image or rendered frame |
| D22 | whole piece | kinetic is the editorial picture recoloured: positions, sizes and the posters match | director | fixed (layout part) | style.json carries the brand composition: centred, headline scale 1.2, compact; posters. Scene timing stays shared by design |
| D23 | 0–4 s · 16x9, 1x1 | the hook is smaller than the scene-2 and CTA headlines in 16x9 and 1x1 | director | fixed | hook 222 / 161 / 180 px (9x16 / 1x1 / 16x9) against 177 / 128 / 144 px for the next largest headline |
| D24 | 0.00–1.00 s | frames 0–29 identical; a hit lands on a still card | director | fixed | the subtitle arrives at 0.5 s with its tick: frame 0 is the finished hook (W-HOOK 29 % ink), frames 0–15 hold it and the subtitle enters from frame 16. An idle was tried and dropped |
| D25 | 4.03–4.10, 22.53–22.60, 26.53 s | the scale-down punches start wider than the safe area; "Nobody checl" and "Povești î" are cut by the frame edge | director | fixed (pattern) | punch and slam bound their start scale by the safe area; the frame sweep of the page at 30 fps, three formats finds no text outside the safe area outside a cut |
| D26 | 15.53–15.57 s | the "entrances" plate pops in oversized and covers "patterns." for 2 frames | director | fixed (pattern) | drop bounds its fall by the free room above; the sweep finds no overlapping slots on any frame |
| D27 | 18.5–19.0 s | the gate figure's slot is empty until the counter writes its first number, so the headline moves once | crew | accepted | the empty slot is kept: with `text` the headline jumps 108 px instead of 64 px (9x16) |
| D28 | 7.8–7.9 s | the time scene's arrival is the one scene arrival with no cue | director | accepted | the cue sits on the 900 at 8.5 s, on the beat grid |
| D29 | 19.65–19.70 s | the riser crests after the landing, then chops to silence in 40 ms | director | accepted | unchanged: the riser's envelope belongs to `mm sound` |
| D30 | 16x9 rests | the 16x9 micro floor (sub, body, address) is 28–37 px tall | director | accepted | unchanged; 16x9 is judged at 960 px |
| D31 | gate, cta | centring switches only on the gate and the end card | director | fixed | every layout takes its alignment from the brand: centred at every rest in every format |
| D32 | 8.5 s | the time headline moves 58 px (9x16) and 53 px (1x1) as the 900 counter takes its room | crew | accepted | no story-level fix: the counter's room is the kit's |
