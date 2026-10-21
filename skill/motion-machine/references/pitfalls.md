# Pitfalls

Read when: before gate 2, and whenever `mm check` fails or warns. Each pitfall names the rule that
catches it, what the gate's evidence looks like, and the fix that worked when the four golden
pieces were built by following this skill (`pieces/golden-*`: their direction logs and defects ledgers).
Never fix a pitfall by loosening a threshold (AXIOMS.md AXIOM 8); a cause inside a pattern or the kit is
logged in `defects.md` and the piece folder's `gaps.md`, then worked around in the story if an honest
story change exists.

## 1. Cues off the grid, or a declared BPM with no grid (W-CUE)

`audio.bpm` alone builds no grid; W-CUE then reports SKIP, and the mixer has nothing to snap to.
With a track: `mm beats <track> --bpm N --out pieces/<id>/assets/beats.json`. With no track, write
the grid by arithmetic (beats at `k × 60/bpm` s for the whole length) into `assets/beats.json`,
`{ "bpm": 120, "beats": [0, 0.5, 1, 1.5, …] }` (format and a generating one-liner in
`beat-sheet.md`), and set `audio.beats` (a known build gap). Then put every cued beat *on* a beat: `scene start + at` within
40 ms of a grid beat. Scenes need not start on the grid; choose `at` so the sum lands on it. The
golden films moved `hit` from 0.2 s to 0.5 s and the riser to 20.0 s.

## 2. The first arrival inside the cut (W-STAGGER)

A transition plays inside the incoming scene's first `d` seconds, so an
arrival at `at: 0.2` after a 0.52 s crossfade lands while the cut is still moving. Put the first
arrival at `d + 0.1` or later for the *slowest* style the story will wear (calm's standard cut is
0.52 s, kinetic's 0.28 s). The evidence names every scene and the measured gap. A hard cut has
`d = 0` and is exempt, as is frame 0: `at: 0` is allowed there. The opposite fault is
W-EMPTY: more than 6 frames with under 0.5 % ink, which a late first arrival into a
scene that a dip or a whip-pan cut shows empty produces. Pull the arrival to `d + 0.1`, or
choose a cut that carries the outgoing scene (crossfade, push).

## 3. Too many words for the seconds (W-READ, W-HOLD, W-QUIET)

W-READ: words × 0.3 s + the last beat's `at` must fit in the scene, and each line must hold settled
(from the end of its entrance to its `out` or its scene's end) 0.8 s for 1 to 3 words, else 0.3 s per
word and at least 1.2 s. On a fast grid (beats under 0.6 s apart) give text lines every other beat,
or bring them in fast and hold the set; only accents may take every beat. W-HOLD: after the last
arrival *settles* (its `at` plus its duration: `hold`-role text patterns such as
`text/kinetic-words` and `text/caption-karaoke` take 1.8 s in calm), the rest must reach
`pacing.holdMinS`. W-QUIET: 2 s after the film's last arrival. The arithmetic at gate 2 is cheaper
than a re-cut: cut words first (a headline repeated by its plates, a list line under a figure),
then move seconds between scenes, keeping the total. The golden film cut four lines and
rebalanced durations at a fixed 30.0 s.

## 4. One story in two motion styles (W-PACE, W-MIX)

Motion styles carry bands: arrivals per 10 s (calm 2–5, kinetic 5–10) and cues per 10 s (calm
1–4, kinetic 3–8). A story worn by both passes W-PACE only at exactly 5 arrivals in every 10 s
window, and W-MIX only with at least 3 cues per 10 s overall and no more than 4 in any 10 s
stretch. Count windows from 0 s; a beat moved by 0.5 s across a window edge changes the count.
Decide per brief: trim to the shared count, or accept the warning in one style with a reason. The
golden films spread nine cues (never more than four in ten seconds) and accepted W-PACE in
editorial.

## 5. Cues bunched (W-MIX)

Three plates popping 0.2 s apart each with a `tick` put five cues in five seconds. Give a cascade
one cue (on its first item), and put cues on the moments that matter: the hook, the figure, the
end card. Every cue needs a visible event within its window (arrive, cut, move).

## 6. A camera move over the rest (W-AMBIENT)

Moves (`moves/push-in`, `moves/hero-drift`, …) run for the scene's full length, so they are
still moving during the rest, and W-AMBIENT caps that at 20 % of the scene's largest entrance travel;
in calm that is a few pixels. Softening with `moveParams` rarely gets under the cap while staying
visible (a known build gap). Choose stillness (H-STILL) or accept with a reason; the golden films removed
both moves.

## 7. A figure too wide for portrait (G-EDGE)

`layouts/stat-hero` never wraps its figure; its card says about five characters fit in 9x16. A
suffix (`" rules"`) pushes it past the margin. Move the unit into the headline ("32" over "rules,
measured, not felt.") or use a smaller figure size.

A bleed on purpose (a headline cropped by the frame edge) is declared with `data-bleed` on that text
or an ancestor; G-EDGE then leaves it alone.

## 8. Text boxes touching at a rest (G-OVERLAP)

G-OVERLAP measures each text node's box (the line's text box, taller than the glyphs for some
faces), not the ink. A tight `line-height` on a display figure lets that box cross a fixed gap
(stat-hero's figure sits against its headline with `line-height: normal`, at least 26 px
apart in the bundled faces). If it still fires, the evidence names the two
slots; choose a pattern or size role that keeps the boxes apart (`data/counter` takes `size:
display|h1|h2|body|caption`) and render the options before choosing.

Text laid over text on purpose (a ghosted word behind a headline) is declared with `data-over` on one
of the two; G-OVERLAP then skips the pair. Use it for an intended overlap, never to hide a collision.

## 9. A deck's last press bringing two things (W-QUIET)

The final press may introduce at most one element. An end card with a name and an address on one
press warns. Split the end card over two presses (name, then address), or drop one line.

## 10. Literals and clocks in piece code (G-BRAND, W-LITERAL, G-TIME)

A colour or a `font-family` the brand does not own fails G-BRAND, however it is set (it reads the
computed style and samples the rendered pixels); a literal hex, size, space, radius, millisecond or
`cubic-bezier` in `piece.css` warns W-LITERAL; `setTimeout`, `Date`, `Math.random` or a CSS animation in the piece fails G-TIME. The style file
is the only look and `t` is the only clock; glows, gradients of roles and `multiply` or `screen` blends of roles pass, while a black vignette or
a global `contrast()` or `saturate()` grade fails (they move the brand's own colours): the style's `finish` holds the brand-safe finishes; the golden pieces ship the skeleton's empty
`piece.css` and a `piece.js` that differs from the skeleton only in the kit import `mm new` wrote.
Do not move a piece afterwards: that import is relative, and `mm check` stops with the missing
import's name (scaffold in place with `mm new --dir`).

## 11. Slots and ids that do not exist (G-PATTERN-REF, kit warning)

A beat naming a slot the layout lacks gets a slot appended and a kit warning; a `fx` that does not
resolve fails G-PATTERN-REF. Check slots and ids in `patterns-cheatsheet.md` before writing beats.

## 12. Exporting moves and soft cuts at `--sub 1` (W-SUB)

`mm export` defaults to `--sub 1`. Sub-frame blending (`--sub 4`) turns fast text into
multi-exposure ghosts, so W-SUB warns when `--sub` is above 1 while any text element travels
more than 4 px per frame; `mm check <piece> --sub 4` reports it without
exporting, and without `--sub` the check reports SKIP. Leave `--sub` at 1 for kinetic styles.

## 13. The review page shows images only for the newest round

`mm review` photographs the newest `## ` round when it runs. Run it at the end of every round, or
earlier rounds keep "No images were archived for this round".

## 14. `--prove` fails by a pixel after an entrance (export, not the gate)

`mm export --prove` re-renders every frame in reverse in a fresh page. On the golden films the
`layouts/bento-3` tiles at 16x9 differed by one pixel (7/255) after `entrances/pop` (scale) or
`entrances/rise` (translate) because the browser keeps raster state across seeks.
G-DETERMINISM cannot see this; only `--prove` can. Before a 25-minute export, probe the scene: a
forward render with subframes in one page against a reverse render in another, over the scene's
seconds. The fix that held: an opacity-only entrance (`entrances/fade`) on the tiles.

## 15. Long exports and timeouts

A 30 s film at `--sub 4` in three formats is about 10,800 screenshots; with `--prove`, 2,700 more.
Run one export at a time with nothing else rendering: a screenshot that waits more than 30 s
aborts the export and leaves a truncated MP4 that `mm sound` will still mux. Re-export before the
final check.

## 16. A line that asserts what the project never said (no rule reads copy)

The gate measures copy, it does not read it. Keep apart what a line *claims* and the way it is
*worded*. Names, numbers, capabilities, quotes and anything shown as the product's own words must
be in the brief's facts or the product's own copy (re-cased, trimmed or split is fine; invented is
not). Hooks, jokes, framing and connecting lines are free. When a wanted line is not grounded,
quote what the product does say: it is usually stranger and better. The same holds for the share
caption (`story.share`; `mm export` warns on launch clichés such as "excited to share").

## 17. The climax on the beat only by luck

`mm beats` writes `strong[]`, the beats and onsets that land hardest. Put the film's one to three
biggest arrivals within 0.15 s of a strong cue and small entrances within 0.10 s of a beat, and
let reading time win when the two disagree. Nothing checks this yet; do it at the animatic.
