# Defects · golden-deck-kinetic

Same story as `golden-deck-editorial`. Raised by: `director` (a review of the stills and exports), `crew` (found while building) or `gate <id>` (a rule of `mm check`).

| # | Where | Note | Raised by | Status | Fix |
|---|---|---|---|---|---|
| D1 | press 10 · cta | the last press brings the headline and the URL together | gate G-QUIET | fixed | end card over two presses (11 presses) |
| D2 | press 8 · gate | the figure's text box overlapped the headline in the editorial deck (stat-hero) | crew | fixed | shared layout fix: `layouts/stat-hero` sets the figure's line-height to `normal` |
| D3 | rest 0 | an empty card with the title rule before the first press | crew | accepted | rest 0 precedes any step; it is the presenter's blank |
| D4 | all | deck cues are not mixed into the walkthrough | crew | accepted | out of scope: deck cues play in `mm serve` |
| D5 | rest 0 | the opening rest is a blank slide with a dash; the handout page 1 is blank | director | fixed | hook headline `step: 0`; G-HOOK PASS |
| D6 | press 2.5, 6.2 | incoming headline printed over the fading outgoing one; a figure lands on a zoomed tile | director | fixed | crossfade clears the old text first; the gate figure arrives at 0.5 s, after the zoom-through dissolve |
| D7 | fades | a container box shows during fades | director | fixed | sections fade whole; mid-press stills |
| D8 | rests 3 and 5 | two rests are not finished pictures | director | fixed | time and style scenes on one press each; ten presses, eleven finished rests |
| D9 | walkthrough | a slideshow of rests that opens on the blank rest 0 | director | fixed (engine) | the walkthrough now records the transitions and opens on the finished hook |
| D10 | handout | handout set in the system font | director | fixed (engine) | pdffonts: Fraunces/Archivo, Manrope and IBM Plex Mono embedded |
| D11 | every rest | the two decks share one layout  | director | fixed (layout part) | style.json carries the brand composition: centred, headline scale 1.2, compact; both decks' rests |
| D12 | rest 0 | the hook must stay the largest headline of the deck | director | fixed | hook 169 px against 135 px for the next largest headline (×1.25) |
| D13 | press 5 | the kinetic gate press has no zoom-through; confirm no frame of the walkthrough double-exposes | crew | fixed | whip-pan; the 1/40-press sweep finds no frame with text of two scenes over each other |
| D14 | press 1, handout pages 2, 8, 11 | press 1 adds only the hook's subtitle; three handout pages carry stub notes ("hook continues", "gate continues", "cta continues") | director | accepted | ten presses kept: the press count is pinned by `tests/contracts/schemas.test.mjs`, and the stubs come from `scripts/export.mjs` |
| D15 | gate press (walkthrough about 10.0 s) | the count passes through "1 rules" | director | fixed | kinetic punches the figure from its `text`; no count |
| D16 | gate, cta | centring switches only on the gate and the end card | director | fixed | every layout takes its alignment from the brand: centred at every rest |
| D17 | style, time, gate (step 2), both presses | a later arrival inside a press re-centres what is already on screen: the style headline jumps 173 px when its plates arrive | crew | fixed | every beat of those presses arrives at `at: 0`; the jump at the press instant remains |
