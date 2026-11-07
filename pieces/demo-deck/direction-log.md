# Direction log · demo-deck

For this example the crew stood in for the director; rows marked *stand-in* are crew calls with their reasons, not quotes from a person. The brief: "I want a demo video and demo presentation of what it can do - amaze me." Same story, facts, pictures and style as
`pieces/demo-film` (nocturne × kinetic); see that log for gates 1 to 3. Both stories are written by
`pieces/demo-film/capture/build-story.mjs`; the pictures are copied into `assets/media/` by
`pieces/demo-film/capture/render-assets.mjs`.

## Gate 1 · Brief

> The brief: a deck of 12–16 presses with speaker notes in which the machine's real output is on screen and the type fills the frame.

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 1.1 | Audience and running time | a presenter with a clicker, about a minute of talk per three presses | brief | 15 presses, 16x9 |
| 1.2 | Facts | the film's 13; f2 counts this deck's presses (15) | brief | f1–f13 |

## Gate 2 · Treatment

> *stand-in:* "The film's thirteen scenes, one press each; the gate and the end card take two."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 2.1 | Press map | one press per scene (13) · gate and end card split (15) · every caption on its own press (24, over 20) | *stand-in:* "15: the gate's totals deserve their own click; the licence line alone on the last press (W-QUIET)" | 15 presses |
| 2.2 | Notes | every `say` two to four sentences, with the click cue where one matters | brief | written per scene in `build-story.mjs` (`notes`) |

## Gate 3 · Style

> *stand-in:* "The film's style, unchanged."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 3.1 | Style | nocturne × kinetic | | as the film (deck base 128 px) |

## Gate 4 · Style frames

> *stand-in:* "Every rest a finished picture; no picture caught mid-move."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 4.1 | Moves at a rest | as the film (a pan's end pose leaves the site and the report off-centre at the rest) · push-in 1.04 for the deck's pans | *stand-in:* "push-in: a deck rest shows the end pose, so it must be a good picture" | pans become `moves/push-in` with `target: media`, `to: 1.04` |
| 4.2 | Stills | `out/contact.png`: 16 rests (rest 0 to 15) | *stand-in:* "signed: hook finished on rest 0, pictures fill, the last rest is the licence line alone" | signed |

## Gate 5 · Animatic

> *stand-in:* "The walkthrough is the animatic."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 5.1 | Press timing | `out/walkthrough.mp4` | *stand-in:* "each press lands in under a second; nothing waits on a clock" | as built |

## Gate 6 · Cut

> *stand-in:* "Lock on check exit 0, prove the rests."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 6.1 | Check | `mm check`: all gates passed, 0 warnings, 11 SKIP (film-only rules, no audio) | rule | lock |
| 6.2 | Prove | `mm export --prove`: 58 frames identical on a second render | rule | lock |

## Gate 7 · Deliver

> *stand-in:* "Folder, handout, walkthrough."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 7.1 | Files | `out/deck/index.html`, `out/handout.pdf`, `out/walkthrough.mp4` | *stand-in:* "signed" | delivered |
