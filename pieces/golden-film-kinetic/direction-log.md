# Direction log · golden-film-kinetic

For this example the crew stood in for the director; rows marked *stand-in* are crew calls with their reasons, not quotes from a person. Brief: `fixtures/golden/brief.md`. This piece wears the **identical story** of `golden-film-editorial` (only `id` differs); the rule for this pair is that a story change asked by either style's gate is made in both, so the two films keep one schedule and differ only by style.

## Gate 1 · Brief

> *stand-in:* "Same brief as the editorial film; nothing to ask. The rules for this cut: no ghost at the zoom, two brands rather than one recoloured, the hook the largest type in every format."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 1.1 | Purpose, formats, the one thing, feeling, faces | `fixtures/golden/brief.md` | *stand-in:* "feed first, three formats, three sourced facts, no faces" | as the editorial log 1.1 |
| 1.2 | Facts | f1, f2, f3 with sources; f2 is the gate's rule count (20 G- and 17 W- rule files) | *stand-in:* "every number on screen cites one, and the screen says what the gate checks" | 900 → f1, 37 → f2 |
| 1.3 | Findings | known layout and kit issues, written into `defects.md` before the story changed | *stand-in:* "every finding gets a ledger row first" | D9 to D32 |

## Gate 2 · Treatment

> *stand-in:* "The same story as the editorial film, scoped once for both styles. Change only what a finding needs, and measure before keeping a change."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 2.1 | Direction, copy, durations, overrides, cuts by position | the editorial log 2.1–2.7 | *stand-in:* "one story: roles and positions, three overrides that carry reasons" | shared story; here the cuts resolve to hard-cut, hard-cut, push, hard-cut, push, whip-pan (blur off), hard-cut, hard-cut |
| 2.2 | First arrivals: W-STAGGER against W-EMPTY | the trade-off of editorial 2.5; kinetic's cuts are hard or 0.28 s pushes | *stand-in:* "an arrival inside a cut is a margin, an empty frame is a defect a viewer sees" | arrivals enter with the cut |
| 2.3 | Arrivals per 10 s (W-PACE, kinetic band 5–10) | 6, 8, 5 | arithmetic | PASS |
| 2.4 | The opening | the editorial log 2.8: an idle under the hook, a punch from frame 0, the subtitle earlier | *stand-in:* "C alone: the subtitle at 0.5 s on its tick" | subtitle 1.0 → 0.5 s; no camera move |
| 2.5 | The gate figure's empty slot | the editorial log 2.9: with `text` the headline jumps 108 px instead of 64 px (9x16) | *stand-in:* "keep the slot empty" | D27 |
| 2.6 | The time counter | no story-level fix: the counter's room is the kit's | *stand-in:* "record it" | D32 accepted |

## Gate 3 · Style

> *stand-in:* "Kinetic preset: signal over kinetic. The brand owns the grid, so the preset is copied with its composition. Same 120 BPM grid."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 3.1 | `style.json` | `mm new --kind film --style kinetic --id golden-film-kinetic`: signal × kinetic, copied from `styles/presets/kinetic.json`; composition center, 1.2, compact | *stand-in:* "dark, loud accent, legible; as composed" | applied |
| 3.2 | Grid and cues | grid by arithmetic; 9 cues on beats, one on the largest event of each scene: hit 0, tick 1, tick 4, tick 8.5, tick 11.5, tick 15.5, riser on the figure, hit 22.5, complete 26.5 | *stand-in:* "kinetic's sound band needs at least 3 cues per 10 s, so nine cues stay: exactly 3.0" | W-CUE PASS |

## Gate 4 · Style frames

> *stand-in:* "Signed: the hook leads in every format and every scene follows the brand's alignment."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 4.1 | Stills | `out/contact.png`, `out/phone.png`, the two posters side by side, frame 0 in 9x16, 1x1 and 16x9 | *stand-in:* "1 the hook finished at frame 0; 2 one idea per rest; 3 content in the upper middle; 4 the Romanian line reads at 360 px, the 16x9 micro lines stay small (D30); 5 no banned look; 6 900 and 37 cite f1 and f2; 7 the last rest is the line to remember" | signed |
| 4.2 | Type and alignment, measured in the page at each rest | 9x16 hook 222 px against 177 (lead) and 133 (content); 1x1 161 against 128 and 120; 16x9 180 against 144 and 108; centred at every rest in every format | *stand-in:* "the hook leads by at least 1.25 everywhere" | hook leads; alignment comes from the brand |
| 4.3 | G-EDGE: the figure with its unit crossed the margin by 271.7 px in 9x16 at the layout's figure size | A `data/counter` at the h1 role, shared with the editorial film · B a smaller figure | *stand-in:* "A: share the editorial fix so the schedules stay one" | `data/counter` (D1) |
| 4.4 | W-AMBIENT: push-in 85 px, hero-drift 39.2 px over their rests (caps 10.3 px) | A keep · B soften · C remove | *stand-in:* "C, shared" | `move: null` on problem and patterns |

## Gate 5 · Animatic

> *stand-in:* "Judged from the export, a 2 fps contact of both styles and a sweep of every frame."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 5.1 | Animatic | `mm export --formats 16x9 --fps 15`, the transition strip | *stand-in:* "holds even, no hole longer than a beat" | approved |
| 5.2 | Frame sweep | every frame at 30 fps in three formats: text of two scenes over each other, text outside the safe area outside a cut, overlapping slots, jumps over 25 px | *stand-in:* "no ghost, no crop, no overlap; the jumps left are the counters' (D27, D32)" | 2 fps contact of both styles |
| 5.3 | Empty frames at the topic cuts | first check: kinetic 7 empty frames at 7.667–7.867 s (after the time push), patterns at the limit | *stand-in:* "bring both headlines to 0.3 s" | time and patterns headlines 0.38 → 0.3 s; W-EMPTY longest run 5 frames |
| 5.4 | `--prove` on the idle (crew) | the idle's scale differed on a second render in editorial. A float only (`moveParams: { "amount": 0 }`) · B drop the idle | *stand-in:* "A: identical on a second render, and the story stays shared" | `amount: 0` (then dropped, 5.5) |
| 5.5 | The idle against motion capture (crew, `npm test`) | with the float, `mm motion capture` read the hook as a crossfade and its pixel steps as arrivals; five tests in `tests/capture/` failed, since the golden films are capture's labelled truth. A drop the idle; the subtitle at 0.5 s gives the opening a second event · B keep it and re-label the films | *stand-in:* "A: the float was too faint to earn a broken calibration" | `move: null` |

## Gate 6 · Cut

> *stand-in:* "Lock what the story can lock."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 6.1 | Gate | `mm check --sub 1` exit 0 → `mm export --prove` → `mm sound` → `mm check --sub 1` exit 0 → `mm review` | *stand-in:* "green" | PASS · WARN · SKIP 30 · 1 · 4; prove ok: 900 frames identical in each format; -14.4 LUFS, -1.0 dBTP (on the ceiling) |
| 6.2 | W-STAGGER: the time headline arrives 0.02 s after the 0.28 s push settles (needs 0.1 s); every other scene passes | the trade-off of 2.2 and 5.3 | *stand-in:* "accepted: at 0.38 s the push left 7 empty frames (W-EMPTY)" | row in `tests/golden/accepted-warnings.md` |
| 6.3 | Loudness | true peak -1.0 dBTP, on the G-PEAK ceiling (at most -1) | *stand-in:* "passes as measured; a second mix may land either side" | noted |
| 6.4 | W-MIX | structure passed; peaks SKIP (partial: `mm sound` mixed no bed) | crew: "nothing to compare cue peaks against; not a pass" | SKIP stands |
| 6.5 | Tiles entrance | pop, fade, list-reveal, each run through a forward/reverse comparison of 14.9–18.5 s: only fade and list-reveal come back identical | *stand-in:* "fade, shared with the editorial film: it keeps the bento picture; the tiles still arrive in order" | tiles `entrances/fade` (D7) |
| 6.6 | Ledger re-check | `defects.md` top to bottom against the new stills and `out/check.json` | crew: "no regressions" | — |
| 6.7 | Lock | review page, check summary | *stand-in:* "lock" | locked |

## Gate 7 · Deliver

> *stand-in:* "Signed off: three MP4s with sound, poster, loop check, contact sheet, review page."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 7.1 | Formats | 9x16 1.07 MB · 1x1 0.98 MB · 16x9 0.98 MB, 30.0 s, 900 frames | *stand-in:* "all three" | exported at 30 fps, `--sub 1` |
| 7.2 | Loop seam | `out/loop_check.mp4`: the CTA cuts to the finished hook (SSIM last vs first 0.800) | *stand-in:* "the seam lands on a picture" | kept |
| 7.3 | Deliverables | `out/` holds the MP4s, poster, loop check, contact sheet, mix and review page | *stand-in:* "signed off" | delivered |
