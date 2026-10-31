# The catalogue films

Every pattern Motion Machine ships, shown, named and explained, in 45 films that pass the gate: 20 to
60 s, except the three that run on footage (below). One spec per family in `specs/` becomes one or more
`pieces/catalogue-<family>-<n>/` pieces; each family keeps one style, and the families rotate the shipped
presets. A pattern that no spec names is missing from the catalogue: compare `scripts/pattern-lint.mjs`'s
list with the patterns the specs name before you add a pattern.

| family | parts | style | how each pattern is shown |
|---|---|---|---|
| entrances | 5 | kinetic | the split layout: name, one line on how it works and the path beside the pattern, then a replay with one knob turned; the patterns that need their own layout (one-line, photo-wake, sketch) take it |
| exits | 2 | editorial | as entrances, the element arriving and then leaving through the exit; the lower third on a phone, under its caption |
| text | 3 | calm-product | as entrances; annotate and the lower third on a phone, beside their caption |
| emphasis | 3 | nocturne-kinetic | as entrances; lens and roulette in a list, where they have siblings; wash-bloom over sketched tiles |
| data | 5 | kinetic | title-stack: the chart in the headline slot, name and line beneath (a line waits for a chart that takes seconds to draw) |
| transitions | 7 | editorial | three cards: A explains, B arrives through the cut as shipped, C with a knob turned |
| moves | 4 | calm-product | the camera move over the explain card, or over three layered tiles for the depth moves; depth-parallax over a layered picture; punch over the talking footage |
| layouts | 4 | nocturne-kinetic | each layout fills its own slots with its own description; the two talking layouts run on footage and have a film each |
| devices | 1 | calm-product | caption-bar: the device on the stage, the caption naming it |
| screen | 2 | editorial | a large phone with a captured page; each screen action, then a knob |
| 3d | 1 | calm-product | the 3D phone and laptop, then particles-to-shape and point-cloud |
| sound | 2 | nocturne-kinetic | one cue per card, on its own moment (the films have sound) |
| music | 1 | nocturne-kinetic | a synthetic 120 BPM track, its beat grid and strong cues, cues on the beat |
| looks | 5 | obsidian-premium | one film a change to the style, named and shown: the bloom ground and glass cards as shipped; the graph-paper ground; the dots ground; the chroma and bloom finish; the scanlines and look finish |

A family spec can also say `variants` (each part wears its own patch of the style: the looks, which a
piece cannot change halfway through), `lead` on an item (footage runs on the film's clock from 0, so the
item is a film of its own with no intro) and `lineAt` on an item (the line under a chart waits for a chart
that takes seconds to draw).

## Build

```bash
node pieces/catalogue/build.mjs            # every family, or name some: build.mjs entrances data
for p in pieces/catalogue-*-[0-9]; do node scripts/mm.mjs check $p --format 16x9 && node scripts/mm.mjs export $p --formats 16x9; done
node scripts/mm.mjs sound pieces/catalogue-sound-1 && node scripts/mm.mjs sound pieces/catalogue-music-1
node pieces/catalogue/join.mjs             # one cut per family in pieces/catalogue/out/
```

`build.mjs` sizes every scene from the gate's own numbers: 0.3 s a word after the last timed
arrival (W-READ) and no more than 4 s from that arrival to the cut (W-DEAD), so a scene carries at
most 13 words. It packs a family into even parts of at most 60 s (W-LENGTH). A transition's second
and third cards bring their content in once the cut settles (W-STAGGER), read from the kit's
`cutSeconds`. The music film's track is generated with ffmpeg and git-ignored; `mm beats` writes its
grid.

## Warnings that stay

- **W-PACE.** Every cut re-arrives the name and the line, so a catalogue runs busier than a story;
  the calm presets' bands (2 to 5 or 3 to 6 arrivals per 10 s) cannot hold two scenes a pattern,
  and the kinetic band (5 to 10) is passed in a window here and there.
- **W-EMPTY (transitions).** The incoming card is empty until its cut settles, so a wipe, iris or
  dip shows the canvas for a moment by design.
- **W-AMBIENT (moves).** An ambient move shown on its own travels more than a fifth of the
  entrances' travel, which is the point of showing it.
- **W-MIX (sound, music).** One cue per card, so each can be heard alone, is under the cue band.
- **W-STAGGER (shared-element).** The shared element must be present in both scenes as the cut
  starts.
- **W-EMPTY (data, entrances, 3d).** A figure that takes seconds to build (a ring of steps, a
  quadrant grid, a tree, a waterfall, a mark drawn in one stroke, a cloud of points) leaves the
  canvas near-empty while it starts; that stretch is the mechanism.
- **W-DUR-LITERAL (one-line, garden, wither, point-cloud).** These draw over seconds, past
  the role scale (`hold` stops at 1.5 s), so their `dur` is given in seconds.
- **W-POP (card-flip, sketch).** The card's back hands over to its front on the one frame where it
  stands edge-on; the sketch's pen start differs by under 0.01 % of the picture on one frame.
- **W-CONTRAST (dial readouts, cross-out, shortlist, wither, stamp, dimension).** The readout of a
  ring or gauge is measured over its own track; struck claims and the unpicked shortlist cards are
  dimmed on purpose; the garden, the stamp's flash and the measure's line sit under the text they
  mark, which the sampler reads as a gradient.
- **W-FOCUS (label-column, lower-third on a phone).** A teardown lights every label it names; a lower
  third is shown beside the phone's own accent bar.
- **W-SAMEBOX (replays in one layout).** A replay with one knob turned keeps the layout, so the two
  scenes differ in the knob and the words (roulette, verdict, toggle-on and toggle-off, sketch-to-ink,
  which must keep its boxes for the pen to straighten onto).
- **W-DEADSTOP (wash-bloom).** The last tile's pen closes on one frame by design: the wash opens once
  it has closed.
- **W-TOKENS.** A film that shows ten patterns draws more stroke widths and sizes than a story
  would; each belongs to a different pattern.
- **W-LENGTH, W-DEAD (the footage films: talking-full, talking-cutout, punch).** Footage runs on the
  film's clock from 0, so each is a film of its own, as long as the footage (5 to 12 s); the checker
  sees nothing move while the speaker talks.
- **Looks, one change a film.** A film cannot change its style halfway through, so each look has a
  film that wears it; chroma and bloom share one, scanlines and look another, and both say so.
