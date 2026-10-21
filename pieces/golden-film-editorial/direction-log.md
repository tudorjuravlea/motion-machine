# Direction log · golden-film-editorial

For this example the crew stood in for the director; rows marked *stand-in* are crew calls with their reasons, not quotes from a person. Brief: `fixtures/golden/brief.md`. Sibling piece with the identical story: `golden-film-kinetic`.

## Gate 1 · Brief

> *stand-in:* "The brief is complete as written: purpose, formats, the one thing, three words, sourced facts, no faces, one Romanian line. The rules for this cut: no ghost at the zoom, two brands rather than one recoloured, the hook the largest type in every format."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 1.1 | Purpose, formats, the one thing, feeling, faces | the brief: README and launch post, a muted feed, a talk opener | *stand-in:* "feed first, so copy must carry the meaning; one brief, film and deck, any style, checked by a machine; precise, calm, confident; no faces" | 9x16, 1x1, 16x9; no faces |
| 1.2 | Facts | f1, f2, f3 with sources (SPEC §2, §7, §1/§10); f2 is the gate's rule count (20 G- and 17 W- rule files) | *stand-in:* "every number on screen cites one, and the screen says what the gate checks" | 900 → f1, 37 → f2 ("The gate checks 37 rules: 20 errors and 17 warnings.") |
| 1.3 | Findings | known layout and kit issues, written into `defects.md` before the story changed | *stand-in:* "every finding gets a ledger row first" | D16 to D39 |

## Gate 2 · Treatment

> *stand-in:* "Eight scenes and 30 seconds. Let the motion style speak: roles and positions, a pattern id only where the scene has a reason, and the reason in this log."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 2.1 | Direction | A roles and positions everywhere · B roles and positions with three overrides that carry reasons · C one story per style | *stand-in:* "B: C would break the shared-story proof, A puts a figure above the hook" | B |
| 2.2 | Overrides | both figures `data/counter` (size role h1): `style:figure` takes the layout's figure size (display × 1.4–2.2), larger than the hook in every format; gate `cutParams: { amount: 0 }`: kinetic's climax whip-pan keeps its travel and loses its blur (zoom-through has no such param and ignores it) | *stand-in:* "both, logged" | applied |
| 2.3 | The hook | `layouts/statement` (display size), `style:headline` at 0 with `instant`, `hit` on frame 0 | *stand-in:* "the first frame is the finished hook, the largest type" | W-HOOK PASS (25.4 % ink at frame 0) |
| 2.4 | Copy and arithmetic | hook + "Centred. Gradient. Fades."; problem in `layouts/title-stack`; time "Only time moves things." · 900 frames · "each drawn from t alone"; style two plates; patterns headline + three tiles; gate "37 rules" · "Measured, not felt." · "determinism, legibility, pacing, style, sound"; both "Povești în mișcare" (display face) · "One story: a film and a deck." (f3); cta "One brief. Any style. Checked." · the address; durations 4 / 3.5 / 4 / 3.5 / 3.5 / 4 / 4 / 3.5 = 30 s. W-READ per scene: "both" needed 4.1 s of 4 | *stand-in:* "end on the line to remember, not on a logo; cut words before seconds" | "both" sub cut to 7 words; W-READ PASS; W-QUIET 3.0 s |
| 2.5 | First arrivals: W-STAGGER against W-EMPTY | A wait 0.62 s after every soft cut (editorial's 0.52 s + 0.1) · B enter with the cut: at 0 after related and outro scenes, 0.3 s after topic, 0.22 s after the climax | *stand-in:* "B: waiting for editorial's cuts leaves kinetic 10 to 20 empty frames after its hard cuts and 0.28 s pushes (a blocker); an arrival inside a cut is a margin, an empty frame is a defect a viewer sees" | B; W-STAGGER stands where it fires (round 6) |
| 2.6 | W-PACE | 6 / 8 / 5 arrivals per 10 s window; only 5 / 5 / 5 passes both bands and needs three lines cut | *stand-in:* "accept on editorial: the brief needs every line it has left, and kinetic (5–10) passes the same story" | accepted |
| 2.7 | Cuts by position | opening, related, topic, related, topic, climax, related, outro; resolves here to hard-cut, push, crossfade, push, crossfade, zoom-through, push, color-dip | *stand-in:* "the style decides the cut" | no explicit `cut` in the story |
| 2.8 | The opening | A `moves/idle-breathe` under the finished hook (whole cycles, identity at frame 0) · B a punch on the hook from frame 0 (frame 0 would be mid-entrance: W-HOOK) · C the subtitle earlier, at 0.5 s on the beat with its tick | *stand-in:* "A and C first; then C alone (5.3): the idle steps the hook by single pixels and breaks motion capture's labelled films" | subtitle 1.0 → 0.5 s on its tick; no camera move; W-READ, W-CUE PASS |
| 2.9 | The gate figure's empty slot | A `text: "37 rules"` on the counter beat · B keep the slot empty | *stand-in:* "tried A: it reserves the layout's figure size (314 px in kinetic 9x16), not the counter's 111 px, so the headline jumped 108 px instead of 64; it also pushed W-READ to 4.5 s. B" | reverted to B (D35) |
| 2.10 | The time counter (the same cause, found by the frame sweep) | no story-level fix: the counter's room is the kit's | *stand-in:* "record it" | D42 accepted |
| 2.11 | A frame the machine made, in scene 7 | no layout carries an image or a rendered frame (the kit does not copy a beat's `asset`; devices draw placeholders) | *stand-in:* "cut the row; record the limit" | D28 |

## Gate 3 · Style

> *stand-in:* "Presets: editorial is paper over calm. The brand owns the grid, so the preset is copied with its composition. The grid is the declared 120 BPM, written out because there is no track."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 3.1 | `style.json` | `mm new --kind film --style editorial --id golden-film-editorial`: paper × calm, copied from `styles/presets/editorial.json`; composition left, 1, airy | *stand-in:* "warm, quiet, legible; as composed" | applied |
| 3.2 | Beat grid | `mm beats` needs a track and there is none | *stand-in:* "write the 120 BPM grid by arithmetic, k × 0.5 s" | `assets/beats.json`, 61 beats, `audio.beats` set |
| 3.3 | Cues on the grid (W-CUE) and their density (W-MIX: editorial tops out at 4 per 10 s, kinetic needs at least 3 per 10 s overall) | A keep the fixture's cues and snap (drift up to 200 ms) · B move cued beats onto beats and redistribute | *stand-in:* "B: a cue 200 ms off its event is worse than a moved cue; one cue on the largest event of each scene" | 9 cues: hit 0.5, tick 1.0, tick 5.0, tick 8.5, tick 12.0, tick 12.5, tick 16.0, riser 20.0, complete 27.5 (seconds, film time); W-CUE, W-MIX structure PASS |
| 3.4 | Riser lands on 37 | the counter on spring `heavy` (0.762 s calm, 0.673 s kinetic) arriving at 18.983 s, so the riser's start falls within 45 ms of the 18.5 s beat and the gate cut in both styles | *stand-in:* "the crest within two frames of the landing in both styles" | mixer plays the riser 18.5–19.7 s: crest 45 ms before the landing (19.745 s) |

## Gate 4 · Style frames

> *stand-in:* "Signed: the hook leads in every format and every scene follows the brand's alignment."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 4.1 | Stills | `out/contact.png`, `out/phone.png`, the two posters side by side, frame 0 in 9x16, 1x1 and 16x9 | *stand-in:* "1 the hook finished at frame 0; 2 one idea per rest; 3 content in the upper middle; 4 the Romanian line reads at 360 px, the 16x9 micro lines stay small (D38/D30); 5 no banned look; 6 900 and 37 cite f1 and f2; 7 the last rest is the line to remember" | signed |
| 4.2 | Type and alignment, measured in the page at each rest | 9x16 hook 168 px against 134 (lead) and 104 (content); 1x1 122 against 97 and 94; 16x9 136 against 109 and 84; left (`start`) at every rest in every format | *stand-in:* "the hook leads by at least 1.25 everywhere" | hook leads; alignment comes from the brand |
| 4.3 | G-OVERLAP: the figure text box overlapped the headline in 16x9 (paper's display face has a tall text box) | A count at hero size · B `data/counter` at the h1 role · C statement layout | *stand-in:* "B: still the accent figure, centred in its card, and it passes; A fails the gate, C loses the figure" | `data/counter` (D2, D3: the layout's line-height is `normal` since) |
| 4.4 | W-AMBIENT: push-in moves 47 px over the problem rest, hero-drift 20.1 px over patterns (cap 20 % of entrance travel: 5.8 and 6.2 px) | A keep and explain · B soften with moveParams (hero-drift `d: 3, tilt: 0.3` still 16.7 px) · C no camera moves | *stand-in:* "C: stillness after the claim (H-STILL); a move too small to see carries nothing (H-INFO)" | both scenes `move: null` |
| 4.5 | The URL breaks at its hyphen in portrait | accept · re-set the address | *stand-in:* "legible on the phone sheet; a URL is not re-set in a layout" | accepted (D11) |

## Gate 5 · Animatic

> *stand-in:* "Judged from the export, a 2 fps contact of both styles and a sweep of every frame."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 5.1 | Animatic | `mm export --formats 16x9 --fps 15`, the transition strip | *stand-in:* "cuts read as push, crossfade, zoom, dip; holds even, no hole longer than a beat" | approved |
| 5.2 | Frame sweep | every frame at 30 fps in three formats: text of two scenes over each other, text outside the safe area outside a cut, overlapping slots, jumps over 25 px | *stand-in:* "no ghost, no crop, no overlap; the jumps left are the counters' (D35, D42)" | 2 fps contact of both styles |
| 5.3 | Empty frames at the topic cuts | 12 frames around every cut in 9x16; first check: kinetic 7 empty frames at 7.667–7.867 s (after the time push), patterns at the limit | *stand-in:* "bring both headlines to 0.3 s" | time and patterns headlines 0.38 → 0.3 s; W-EMPTY longest run 4 frames |
| 5.4 | `--prove` on the idle (crew) | the idle's scale differed on a second render at 2.400–2.433 s and 3.933–4.000 s in editorial. A float only (`moveParams: { "amount": 0 }`) · B drop the idle | *stand-in:* "A: identical on a second render, and the story stays shared" | `amount: 0` (then dropped, 5.5) |
| 5.5 | The idle against motion capture (crew, `npm test`) | with the float, `mm motion capture` read the hook as a crossfade (0.97 / 1.77 s editorial, 1.57 s kinetic) and its pixel steps as arrivals; five tests in `tests/capture/` failed, since the golden films are capture's labelled truth. A drop the idle; the subtitle at 0.5 s gives the opening a second event · B keep it and re-label the films | *stand-in:* "A: the float was too faint to earn a broken calibration" | `move: null` (D40) |

## Gate 6 · Cut

> *stand-in:* "Lock. The warnings that stand are the price of one story in two styles."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 6.1 | Gate | `mm check --sub 1` exit 0 → `mm export --prove` → `mm sound` → `mm check --sub 1` exit 0 → `mm review` | *stand-in:* "green" | PASS · WARN · SKIP 29 · 2 · 4; prove: 900 frames × 3 formats identical; -14.1 LUFS, -1.9 dBTP |
| 6.2 | W-PACE (6, 8, 5 arrivals) | the trade-off of 2.6 | *stand-in:* "accepted for the reason in 2.6" | row in `tests/golden/accepted-warnings.md` |
| 6.3 | W-STAGGER: first arrivals inside the cut in 7 scenes (problem, style, both, cta at 0 s inside a 0.52 s push or dip; time, patterns 0.3 s inside a 0.52 s crossfade; gate 0.22 s inside a 0.52 s zoom-through) | the trade-off of 2.5 | *stand-in:* "accepted for the reason in 2.5" | row in `tests/golden/accepted-warnings.md` |
| 6.4 | W-MIX | structure passed; peaks SKIP (partial: `mm sound` mixed no bed) | crew: "nothing to compare cue peaks against; not a pass" | SKIP stands |
| 6.5 | `--prove` at 18.533–18.600 s: one level over the scaled outgoing scene of the zoom-through | probe: the zoom-through's `background-color: transparent` on the outgoing section; with the fill dropped only once the section is fading, forward and reverse renders are identical | *stand-in:* "no story change can fix a pattern; the pattern is fixed, not forced" | D41 fixed in `patterns/transitions/zoom-through` |
| 6.6 | Ledger re-check | `defects.md` top to bottom against the new stills and `out/check.json` | crew: "no regressions" | — |
| 6.7 | Lock | review page, check summary | *stand-in:* "lock" | locked |

## Gate 7 · Deliver

> *stand-in:* "Signed off: three MP4s with sound, poster, loop check, contact sheet, review page."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 7.1 | Formats | 9x16 1.13 MB · 1x1 0.97 MB · 16x9 1.03 MB, 30.0 s, 900 frames | *stand-in:* "all three" | exported at 30 fps, `--sub 1` |
| 7.2 | Loop seam | `out/loop_check.mp4`: the CTA cuts to the finished hook (SSIM last vs first 0.869) | *stand-in:* "the seam lands on a picture" | kept |
| 7.3 | Deliverables | `out/` holds the MP4s, poster, loop check, contact sheet, mix and review page | *stand-in:* "signed off" | delivered |
