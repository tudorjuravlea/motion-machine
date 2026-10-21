# Direction log · demo-film

For this example the crew stood in for the director; rows marked *stand-in* are crew calls with their reasons, not quotes from a person. The brief: "I want a demo video and demo presentation of what it can do - amaze me." The deck (`pieces/demo-deck`) tells the same story press by press; both stories are written by one script, `capture/build-story.mjs`, so a change asked by either piece's gate lands in both.

## Gate 1 · Brief

> The brief: a 45–60 s film in 16x9 and 9x16 in which the machine's real output is on screen and the type fills the frame.

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 1.1 | What a type-only cut lacks | a 2 fps sheet of such a cut | "most scenes put small type in the top-left quarter of a near-empty dark frame … it shows none of the machine's output" | the brief: real output as pictures, type that fills the frame (H-FILL), H-INFO motion, hook largest, nothing dead over 2 s |
| 1.2 | Engine first | stand-ins as text · an image slot in the engine | *stand-in:* "a media slot first, test-first" | `layouts/media`, device screens and bento tiles take `asset`; moves take `target: media` |
| 1.3 | Pictures required | three brands side by side with a push-in; 9x16 poster in the phone, 16x9 in the laptop; Harbour & Pine screenshot in the browser, then its palette as swatches; a golden contact sheet; the gate's report; the pattern library | the brief's list | every one built, rendered by `capture/render-assets.mjs` into `assets/media/`, sources in `capture/assets.json` |
| 1.4 | Facts | 13 facts, each citing a file or a command run (story `facts`) | brief: "cite facts as before" | f1–f13; f11 counts the patterns, including `layouts/media` (pattern lint checks the count) |
| 1.5 | Faces, bans | none; nocturne stays fictional | | H-FACES not engaged |

## Gate 2 · Treatment

> *stand-in:* "Show, then name: every scene puts a real artefact on screen and says one line about it."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 2.1 | Direction | A "Show, then name" (13 scenes, each an artefact plus one line) · B "One continuous wall" (the library wall as a set, the camera travelling between artefacts pinned on it; no such move exists, it would be a gap) · C "Before / after" (type-only scenes cut against their picture) | *stand-in:* "A: B needs a camera that travels between pictures, C spends half the film on the weak version" | A |
| 2.2 | Beat sheet | hook · brands · phone · laptop · site · palette · catch · film · skill · time · gate · library · cta (57 s) | *stand-in:* "the three modes stay (capture brand, capture motion, embed); sound is heard, not shown" | no sound scene; its fact stays (f12) for the deck notes |
| 2.3 | Arithmetic, first check | G-EDGE `time` headline (two lines in 16x9), W-READ hook, W-PACE 50–57 s, W-EMPTY 43.6 s, W-STAGGER library, W-AMBIENT hook (idle-breathe) | forced by the gate | defects D12–D17 |
| 2.4 | Total | 57.0 s, 1710 frames at 30 fps | arithmetic | |

## Gate 3 · Style

> *stand-in:* "Keep nocturne; make its type big enough to fill a frame."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 3.1 | Brand | keep nocturne's scale · nocturne with a larger scale · a new brand | brief: "Keep the nocturne brand or improve it" | nocturne, scale display 1.0 / h1 0.8 / h2 0.52 / body 0.32 / caption 0.25 / micro 0.2, headline scale 1.3; colours, faces, align left, compact unchanged |
| 3.2 | How big | display 1.15 × 1.25 · display 1.0 × 1.3 | *stand-in:* "the first broke 'Written,' mid-word in 9x16 (the hook word is 4.07 em, the measure 891 px); 1.0 × 1.3 is the largest that keeps the hook whole: 218 px in 9x16, 177 px in 16x9; content headlines 175 / 141 px" | display 1.0 × 1.3; `styles/presets/nocturne-kinetic.json` recomposed |
| 3.3 | Motion half | kinetic unchanged | | kinetic |
| 3.4 | Grid | 120 BPM declared, no track, `assets/beats.json` by arithmetic (57 s) | arithmetic | |

## Gate 4 · Style frames

> *stand-in:* "Pictures carry it now; fix what crops and what is small."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 4.1 | Three brands | the swap films' pattern-count rest · their hook rest · their scene-2 rest "Brand, worn with motion." | *stand-in:* "scene 2: on message and no stale number" | `swap-*.png` at the rest of scene 2 |
| 4.2 | Devices too small in 16x9 | as shipped (browser 963 px wide) · a `size: large` param (0.74 of the frame height) | *stand-in:* "large: the device is the picture" | engine: `size` on phone, browser, laptop (tested) |
| 4.3 | Posters cropped on the screens | cover as is (cuts the "M" of "Most") · `contain` · extend each frame with its own canvas to the screen's shape | *stand-in:* "extend: cover stays, the crop lands on canvas" | `golden-editorial-*-screen.png` (phone 0.454, laptop 1.456, +10 % side margin) |
| 4.4 | Gate report legible | every row at 25 px · only the W- rows at 33 px with the totals line | *stand-in:* "the W- slice: it shows the one WARN, and the caption gives the totals" | `check-golden-kinetic.png` |
| 4.5 | Library | a cascade of every pattern name (body size cannot hold them all in 9x16) · a wall of demo stills, one per pattern, in this film's style, revealed by `transitions/grid-dissolve` | *stand-in:* "the wall: real stills, and the dissolve is the cascade" | `library-wall.png`; layouts, moves and devices photographed in 16x9 |
| 4.6 | Stills questions | `out/contact.png`, `out/phone.png` (16x9 and 9x16) | *stand-in:* "1 yes, the hook is finished at frame 0 and the largest type; 2 yes; 3 yes, blocks sit under the top row and pictures fill; 4 captions are at the body floor and read at 360 px; 5 no banned look; 6 every number has a fact; 7 yes" | signed |

## Gate 5 · Animatic

> *stand-in:* "Judge the cuts at 15 fps before the real export."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 5.1 | Cuts | kinetic's own (hard, push, whip) · push wherever the next scene has a picture or a new topic, with directions that keep the outgoing type on screen | *stand-in:* "push, right when the outgoing block is left-aligned, up into the site and its palette; a hard match cut phone → laptop (same instant, new device); whip into the gate; grid-dissolve into the library" | 12 cuts: 7 pushes, 3 hard (phone → laptop, the catch's slam, the outro), 1 whip, 1 dissolve |
| 5.2 | Moves on media | none · camera moves (capped to nothing by the full layouts) · `target: media` | *stand-in:* "media: the evidence drifts, the type holds" | push-in on brands, phone, laptop, palette; pan down the site; pan across the contact sheet; pan down the report; ken-burns on the wall |
| 5.3 | Dead time | a plain build holds 2.4 to 3.5 s per scene | brief: "nothing dead for more than 2 s" | media scenes move to their end; `emphasis/indicate` on the hook's sub, on "energy: high" and on the skill command, `emphasis/shine` on "Caught. Fixed."; those late arrivals take `dur: "slow"` (the command `dur: "hold"`), so no gap between motion events exceeds 1.9 s; catch 4 s, time 5.5 s |

## Gate 6 · Cut

> *stand-in:* "Lock on check exit 0 with every WARN explained, prove both formats, the mux at −14 LUFS."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 6.1 | Check | `mm check --sub 1`: all gates passed, 1 WARN (W-STAGGER, library), 4 SKIP | rule; *stand-in:* "the WARN stands: the wall is the dissolve's content, not an arrival hidden in it" | lock |
| 6.2 | Prove | `mm export --prove`: 1710 frames identical on a second render, in 16x9 and in 9x16 | rule | lock |
| 6.3 | Sound | `mm sound`: 22 cues, mix −14 LUFS / −1.5 dBTP (limiter); W-LOUDNESS measured −14.0 LUFS on the muxed 16x9 | *stand-in:* "hit on each scene's largest arrival, tick on the next, complete on the wordmark" | as built; nobody listened |
| 6.4 | Director pass on the 15 fps animatic and the first export | 2 fps sheets, cut strips, first 2 s, 360 px phone sheet | *stand-in:* "word broken in the 9x16 hook and the library plate; posters cropped on the screens; devices small; W-EMPTY dips after pushes; statement scenes dead for 2.5 to 3.2 s" | D18–D24 fixed |
| 6.5 | Director pass on the final export | the same sheets | *stand-in:* "what stays is accepted with its reason" | D27 and D28; nothing else re-opened |

## Gate 7 · Deliver

> *stand-in:* "Deliver both formats; the deck tells it in 15 presses; the triptych is unchanged."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 7.1 | Files | `out/demo-film-16x9.mp4`, `out/demo-film-9x16.mp4`, `out/poster.png`, `out/director/` | *stand-in:* "signed" | delivered |
| 7.2 | Triptych | re-export · keep | brief: "re-export the triptych only if its source pieces changed" | kept: the swap pieces did not change |
