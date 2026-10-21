# Defects · demo-film

Times are film seconds of the cut in which each row was raised. Raised by: `director` (a review of the stills and exports), `crew` (found while building) or `gate <id>` (a rule of `mm check`).
The crew's director pass reads the 15 fps animatic and the exports: 2 fps sheets, cut strips, the first 2 s, rests and mid-entrances, the 360 px phone sheet.

| # | Timecode / press | Note | Raised by | Status | Fix |
|---|---|---|---|---|---|
| D1 | 9.9–14.0 s · brands | nothing arrives for 4.1 s | gate G-DEAD | fixed | scene 5.0 s, tiles at 0.5/0.75/1.0 s |
| D2 | skill · sub | `text/typewriter` does not exist | gate G-PATTERN-REF | fixed | `entrances/typewriter` |
| D3 | site | 12 words need 5.1 s in a 5 s scene | gate W-READ | fixed | body at 1.4 s |
| D4 | 30–40 s | 4 arrivals, kinetic band 5–10 | gate W-PACE | fixed | an extra arrival in the 30–40 s window (cursor, then the split-flap caption) |
| D5 | 8.7, 13.7, 27.7, 36.7 s | 7 to 13 near-empty frames after a push before the first arrival | gate W-EMPTY | fixed | hard cut (`position: related`) where the cue must sit on the grid; `site` headline at d + 0.1 = 0.38 s |
| D6 | 9.4 s · tile-1 | cue 100 ms off the beat | gate W-CUE | fixed | cues on 0.5 s offsets only |
| D7 | 29.0 s · patterns body | numeric `dur` | gate W-DUR-LITERAL | fixed | `dur: "hold"` |
| D8 | 36.5–41 s · time | the browser frame is an empty placeholder (bars, a title): reads as a generic mock, not proof | crew | fixed | replaced by `layouts/split` with `text/split-flap` "1635" |
| D9 | time · odometer | `data/odometer` crossed the safe margin by 57.4 px and overlapped its caption (the strip's hidden digits are measured) | gate G-EDGE, G-OVERLAP | fixed | split-flap instead |
| D10 | every rest | no picture of the machine's own output could be shown: no image slot | crew | fixed | an image slot in the engine (`layouts/media`, device screens, bento tiles, `target: media`); twelve pictures in `assets/media/` |
| D11 | 41.0 s | one blank frame mid whip-pan into the gate (2 fps sheet) | crew | accepted | it is the whip's blur, under W-EMPTY's 6-frame limit |
| D12 | 40.6 s · time | headline on two lines in 16x9 crossed the safe margin by 14 px | gate G-EDGE | fixed | "Drawn from time alone." |
| D13 | hook | 11 words need 4.3 s in 4 s | gate W-READ | fixed | sub "One story file, drawn from time." |
| D14 | 50–57 s | 3 arrivals, kinetic band 5–10 per 10 s | gate W-PACE | fixed | library caption at 1.5 s; time scene 5.5 s |
| D15 | 43.6 s · gate | 14 near-empty frames after the whip | gate W-EMPTY | fixed | headline at 0.25 s |
| D16 | 48.5 s · library | the wall is present as the grid-dissolve runs (an arrival inside a soft cut) | gate W-STAGGER | accepted | the wall is the dissolve's content: the cells reveal it, which is the library's cascade; an arrival at 0.38 would dissolve to an empty canvas |
| D17 | hook | `moves/idle-breathe` travelled 18.3 px over the rest | gate W-AMBIENT | fixed | no move; `emphasis/indicate` on the sub keeps the first 2 s alive |
| D18 | palette, catch, gate, library | reading time over the scene | gate W-READ | fixed | captions shortened and brought to 1.0 s |
| D19 | 4.2, 9.2, 13.2, 17.2, 21.7, 34.2, 38.7 s | 7 to 11 near-empty frames after pushes | gate W-EMPTY | fixed | first arrivals at d + 0.1 = 0.38 s; push `right` where the outgoing block is left-aligned, `up` into site and palette; phone → laptop as a hard match cut |
| D20 | time · headline (deck) | Fraunces ascenders 13 px over the safe margin when the block filled the box | gate G-EDGE | fixed | engine: `layouts/media` reserves 1.2 lines per headline line (1.25 in 16x9) |
| D21 | hook · 9x16 | "Writte / n," broken mid-word at display 1.15 × 1.25 | crew | fixed | nocturne display 1.0 × headline scale 1.3 |
| D22 | library · 9x16 | "pattern / s." broken on the bleed plate | crew | fixed | engine: bleed plates take the full measure |
| D23 | phone, laptop, site · 16x9 | the devices fill half the frame | crew | fixed | engine: `size: large` |
| D24 | phone, laptop | `object-fit: cover` cut the poster's first letter | crew | fixed | posters extended with their own canvas to the screen's shape |
| D25 | gate | a row per rule at 25 px is texture, not a report | crew | fixed | only the W- rows at 33 px, totals in the caption |
| D26 | hook, catch, film, skill | 2.1 to 3.2 s with no motion event (the skill command typed in 0.28 s) | crew | fixed | `emphasis/indicate` on the hook sub, "energy: high" and the command, `emphasis/shine` on "Caught. Fixed."; those entrances `dur: "slow"`, the typewriter `dur: "hold"`; catch 4.0 s; largest gap now 1.9 s |
| D27 | every push and the whip | 3 to 6 near-black frames between the outgoing block leaving and the first arrival | crew | accepted | under W-EMPTY's 6-frame limit; a cut's length comes from its module (`cutParams` cannot shorten it) and an earlier arrival trips W-STAGGER; reads as kinetic's breath at speed |
| D28 | hook · 16x9 | the hook is 177 px, under half the frame's width | crew | accepted | it is capped by 9x16, where "Written," (4.07 em) must fit 891 px; content does not change by format |
