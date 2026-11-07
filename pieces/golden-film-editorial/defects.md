# Defects · golden-film-editorial

Notes raised while building the golden film by following `skill/motion-machine/SKILL.md`. Each
row was written before the change it led to. Times are film seconds of the current story.
Raised by: `director` (a review of the stills and exports), `crew` (found while building) or `gate <id>` (a rule of `mm check`).

| # | Where | Note | Raised by | Status | Fix |
|---|---|---|---|---|---|
| D1 | 18.5–22.65 s · 9x16 · gate | the gate figure with its unit crosses the 72 px safe margin by 194.6 px at the layout's figure size | gate G-EDGE | fixed | story: the figure is a `data/counter` (h1 size role), not the layout's figure size |
| D2 | 21 s · 16x9 · gate | the figure's text box overlaps the headline by 9.8 px at rest (stat-hero, paper brand) | gate G-OVERLAP | fixed | see D3 |
| D3 | all · `layouts/stat-hero` · 16x9 | layout defect: figure set at display × 2.2 with line-height 0.95 and a 40 px gap; with a face whose text box is taller than 1 em (Fraunces) the box crosses the gap | crew | fixed (layout) | `layouts/stat-hero` sets the figure's line-height to `normal`, so its box is the face's whole text box and the gap below it is real |
| D4 | 0–30 s · cues | fixture cues 0.2 s off the 120 BPM grid; no grid file existed | gate W-CUE | fixed | `assets/beats.json` by arithmetic; cued beats moved onto beats |
| D5 | 3.5–30 s · every soft cut | first arrivals inside the cut (0.32 s inside a 0.52 s cut in the first build) | gate W-STAGGER | accepted | first arrivals enter with the cut: waiting for it to end leaves empty frames after hard cuts and short pushes, a defect a viewer sees; the warning stands in 7 scenes (direction log 2.5) |
| D6 | hook, style, gate, both | copy longer than its scene's reading time | gate W-READ | fixed | shorter copy |
| D7 | hook, gate, both | rests shorter than calm's 1.6 s floor | gate W-HOLD | fixed | durations rebalanced |
| D8 | problem, patterns | camera moves still travelling over the rest | gate W-AMBIENT | fixed | moves removed |
| D9 | 8–18 s | six cues in ten seconds against calm's 4 | gate W-MIX | fixed | cues redistributed |
| D10 | all · 10 s windows | 6 arrivals per 10 s against calm's 2–5 | gate W-PACE | accepted | the brief's density; the brief needs every line it has left, and the motion style's own band (kinetic 5–10) accepts the same story |
| D11 | 26.85–30 s · 9x16 · cta | the URL breaks at its hyphen ("motion-" / "machine") | crew | accepted | legible on the phone sheet; a URL is not re-set in a layout |
| D12 | 22.65–26.85 s · 9x16 · both | wide gap between the headline and the caption (split's empty figure slot) | crew | accepted | layout behaviour, content is not pooled low |
| D13 | 27.5 s · 16x9 · export | the first full render stopped at frame 826: a page screenshot exceeded Playwright's 30 s timeout | crew | fixed | re-exported alone, nothing else rendering |
| D14 | all · audio | the cue-only mix measured -15.8 LUFS against -14 ± 1 (linear loudnorm under a -1.5 dBTP ceiling) | gate W-LOUDNESS | fixed (outside the piece) | `scripts/sound.mjs` limiter stage; no story change |
| D15 | 15.0–18.5 s · 16x9 · patterns | a forward render and a reverse re-render of the tiles' entrance differ (pop: rest; rise/drop: mid-entrance), one pixel at 7/255 | crew | fixed (worked around) | tiles `entrances/fade`; forward and reverse renders of `entrances/fade` are identical |
| D16 | 0.00–0.53 s · all formats | the first 16 frames hold only an accent dash; the thumbnail is empty | director | fixed | hook in `layouts/statement`, `instant` at 0 (story); W-HOOK PASS |
| D17 | exits, 18.5 s zoom, counters | smeared multi-exposure exits, blurred zoom-through, ghosted counter digits | director | fixed | export at `--sub 1`; no exits in the story; zoom-through has no blur; kinetic whip-pan `cutParams.amount: 0`; counter digits swap whole |
| D18 | whole piece | editorial and kinetic are one layout, one timing and one cut list recoloured | director | fixed (layout part accepted) | beats as `style:<role>`, scenes by `position`: 7 of 7 cuts and 16 of 18 entrances now differ; the shared left column is a stated limit |
| D19 | cuts, 18.8 s hole | 15–17 % empty frames, a 1.3 s hole before the gate figure | director | fixed | first arrivals enter with the cut; W-EMPTY longest run under 0.5 % ink: 4 frames (editorial), 5 (kinetic) |
| D20 | 0–4 s | the hook is the smallest headline; the irony subtitle is grey micro | director | fixed (cliché image accepted) | hook at display size, largest or tied in every format; the sub is body size; showing the cliché itself has no pattern |
| D21 | fades | a container box shows behind fading text | director | fixed | crossfade fades whole sections; plates fade with their text (cut strips) |
| D22 | 18.5–19.7 s | the riser crests 0.45–0.6 s after the number lands | director | fixed | riser anchored to the counter's landing: crest within 45 ms of the landing |
| D23 | climax cut, scene 7 | the two biggest visual events are silent | director | fixed | the riser spans the climax cut and lands on 37; `hit` on "Povești în mișcare" |
| D24 | 16x9 rests, Romanian line | micro lines illegible at feed width; the Romanian line is the smallest text | director | fixed | "Povești în mișcare" is scene 7's headline in the display face; no fact or call to action in micro text; 16x9 judged at 960 px |
| D25 | 26.5–30 s, loop seam | ends on a logo, the URL wraps mid-name, the loop seam stutters on a dash | director | fixed | final rest "One brief. Any style. Checked." over the unbroken address; the seam cuts to the finished hook |
| D26 | hook entrance | type overshoots about 1.5 % | director | fixed | the hook enters instantly; W-OVERSHOOT PASS on every entrance |
| D27 | gate, cta | centring switches only on the gate and the end card | director | accepted | stat-hero and endcard centre by their cards; a kinetic-only centred grammar would fork the story (a stated limit) |
| D28 | scene 7 | the film never shows a frame the machine made | director | accepted | no layout carries an image or rendered frame |
| D29 | 18.5–18.8 s · climax | zoom-through dissolve layers the outgoing tiles and the incoming headline for about three frames | crew | accepted | the dissolve is the pattern; kinetic's whip-pan has no overlap |
| D30 | whole piece | editorial and kinetic are one picture recoloured: positions, sizes and the posters match | director | fixed (layout part) | style.json carries the brand composition: left, headline scale 1, airy, against kinetic's centred, 1.2, compact; posters, 2 fps contact, both styles. Scene timing stays shared by design |
| D31 | 18.60–18.77 s · all formats | the patterns-to-gate zoom-through is a multi-exposure ghost with "Measured, not felt." printed over it | director | fixed (pattern) | zoom-through draws one scene at a time; the frame sweep of the page at 30 fps, three formats finds no frame with text of two scenes over each other |
| D32 | 0–4 s · 16x9, 1x1 | the hook is smaller than the scene-2 and CTA headlines in 16x9 and 1x1 | director | fixed | hook 168 / 122 / 136 px (9x16 / 1x1 / 16x9) against 134 / 97 / 109 px for the next largest headline (kit hook step) |
| D33 | 0.00–1.00 s | frames 0–29 identical; a hit lands on a still card | director | fixed | the subtitle arrives at 0.5 s with its tick: frame 0 is still the finished hook (W-HOOK 25.4 % ink), frames 0–15 hold it and the subtitle enters from frame 16. An idle (`moves/idle-breathe`) was tried and dropped (D40) |
| D34 | 26.60 s · all formats | the whole canvas shifts by 3 levels for one frame during the CTA fade-in | director | accepted | the page varies by at most 1 level during the colour dip (26.567–26.867 s); the encoded MP4 shows 2–3 levels on 4 frames, which is the encoder |
| D35 | 18.5–19.0 s | the gate figure's slot is empty until the counter writes its first number, so the headline moves once (about 65 px in 9x16) | crew | accepted | `text: "37 rules"` was tried: it reserves the layout's figure size, not the counter's, and the jump grew; reverted |
| D36 | 7.8–7.9 s | the time scene's arrival is the one scene arrival with no cue | director | accepted | the scene's cue sits on its largest event, the 900 at 8.5 s; a cue at 7.8 s would be off the beat grid (W-CUE) |
| D37 | 19.66–19.70 s | the riser crests 0.16–0.35 s after the landing, then chops to silence in 40 ms | director | accepted | unchanged: the riser's envelope belongs to `mm sound`, not the story |
| D38 | 16x9 rests | the 16x9 micro floor (sub, body, address) is 28–37 px tall | director | accepted | unchanged; 16x9 is judged at 960 px |
| D39 | gate, cta | centring switches only on the gate and the end card | director | fixed | every layout takes its alignment from the brand: left at every rest in every format |
| D40 | 2.400–2.433 s, 3.933–4.000 s | `--prove` differed on the hook while `moves/idle-breathe` scaled the camera | crew | fixed | the hook carries no idle now; the float only (`amount: 0`) proved identical, but the idle was then dropped: motion capture read it as a crossfade and broke its labelled films |
| D41 | 18.533–18.600 s · all formats | `--prove` differed by one level over the scaled outgoing scene of the zoom-through (its transparent fill) | crew | fixed (pattern) | `patterns/transitions/zoom-through` drops the outgoing fill only once the section is fading; the film proves identical on a second render |
| D42 | 8.5 s | the time headline moves 55 px (9x16) and 49 px (1x1) as the 900 counter takes its room | crew | accepted | same cause as D35 |
