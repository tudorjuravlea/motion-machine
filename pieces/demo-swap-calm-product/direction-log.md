# Direction log · demo-swap-calm-product

For this example the crew stood in for the director; rows marked *stand-in* are crew calls with their reasons, not quotes from a person. One of three pieces that wear the **identical story** (only `id` differs): `demo-swap-editorial`
(paper × calm), `demo-swap-kinetic` (signal × kinetic), `demo-swap-calm-product` (linen × premium).
This one wears `calm-product` (linen × premium), scaffolded with `mm new --style calm-product`.

## Gate 1 · Brief

> The brief: "one short scene (6 to 8 s, 16x9) rendered in the three presets, then a side-by-side triptych"

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 1.1 | Length | a 7 s film (warns W-LENGTH, outside 20–60 s) · a 20 s gate-clean film whose first scene is the short scene | *stand-in:* "20 s: nothing in the demo ships unchecked" | 20 s, four scenes |

## Gate 2 · Treatment

> *stand-in:* "Four scenes of 5 s, each landing the same beats in every style."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 2.1 | Cuts | each style's own cuts (editorial crossfade 0.52 s, kinetic push 0.28 s, calm blur-crossfade 0.9 s): W-EMPTY 25 to 31 frames in one style or W-STAGGER in another · one hard cut for all | *stand-in:* "hard cuts: the triptych changes scene in all three panels on the same frame; the styles still differ in brand, composition, entrances and tempo" | `cut: transitions/hard-cut` on scenes 2–4 (override, logged) |
| 2.2 | Arrival bands (W-PACE) | editorial 2–5, calm 3–6, kinetic 5–10 per 10 s | arithmetic | exactly 5 arrivals per 10 s window, the only count all three accept |
| 2.3 | Cue bands (W-MIX) | editorial at most 4 cues per 10 s, kinetic at least 3 | arithmetic | 4 cues in the first window, 2 in the second |

## Gate 3 · Style

> *stand-in:* "The shipped preset, unchanged."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 3.1 | Style | `styles/presets/calm-product.json` (linen × premium) | the brief | as shipped |

## Gate 4 · Style frames

> *stand-in:* "The three rests read as three brands."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 4.1 | Stills | `out/contact.png` beside the other two pieces' | *stand-in:* "alignment, face, palette and figure entrance differ; the editorial and kinetic 120 out-size their hook, accepted here because the figure is the one style-led beat" | signed |

## Gate 5 · Animatic

> *stand-in:* "Judged in the triptych."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 5.1 | Pacing | `demo-swap-editorial/out/style-swap-triptych.mp4` (1 fps sheet) | *stand-in:* "in step; each panel lands its own entrance" | kept |

## Gate 6 · Cut

> *stand-in:* "Check exit 0, prove, sound."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 6.1 | Check, prove, sound | `mm check --sub 1` all passed, 0 warnings; `--prove` 600 frames identical; `mm sound` 6 cues at −14 LUFS | the rule | lock |

## Gate 7 · Deliver

> *stand-in:* "Deliver the 16x9 MP4; the triptych lives in demo-swap-editorial/out/."

| # | Call | Options shown | Director's words | Decision |
|---|---|---|---|---|
| 7.1 | Files | `out/demo-swap-calm-product-16x9.mp4` | *stand-in:* "signed" | delivered |
