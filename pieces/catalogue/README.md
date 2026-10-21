# The catalogue films

Every pattern Motion Machine ships, shown, named and explained, in 25 films of 20 to 60 s that pass
the gate. One spec per family in `specs/` becomes one or more `pieces/catalogue-<family>-<n>/`
pieces; each family keeps one style, and the families rotate the four shipped presets.

| family | parts | style | how each pattern is shown |
|---|---|---|---|
| entrances | 3 | kinetic | the split layout: name, one line on how it works and the path beside the pattern, then a replay with one knob turned |
| exits | 1 | editorial | as entrances, the element arriving and then leaving through the exit |
| text | 2 | calm-product | as entrances |
| emphasis | 2 | nocturne-kinetic | as entrances; lens in a list, where it has siblings to soften |
| data | 2 | kinetic | title-stack: the chart in the headline slot, name and line beneath |
| transitions | 5 | editorial | three cards: A explains, B arrives through the cut as shipped, C with a knob turned |
| moves | 2 | calm-product | the camera move over the explain card, or over three layered tiles for the depth moves |
| layouts | 2 | nocturne-kinetic | each layout fills its own slots with its own description |
| devices | 1 | calm-product | caption-bar: the device on the stage, the caption naming it |
| screen | 2 | editorial | a large phone with a captured page; each screen action, then a knob |
| 3d | 1 | calm-product | the 3D phone and laptop, then particles-to-shape |
| sound | 1 | nocturne-kinetic | one cue per card, on its own moment (the films have sound) |
| music | 1 | nocturne-kinetic | a synthetic 120 BPM track, its beat grid and strong cues, cues on the beat |

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
