# layouts/talking-cutout

## Purpose
The speaker, cut out of their recording by its person matte, stands in the brand's own background in front of one or two huge backdrop words, with a headline and a caption on plates in front of everything.

## Use when / Do not use when
**Use when**
- a person speaks to camera and the film should look like the brand, not like their room: the background is the brand's canvas and ground
- one or two strong words from what they say should stand big behind them, a new word for each phrase

**Do not use when**
- the recording has no matte yet (run `mm footage matte --name <n>`; without one the whole picture shows and the kit warns)
- the speaker's own room matters to the story (use `layouts/talking-full`)
- the words carry a fact, a figure or the call to action: the backdrop is decoration; say those in the headline or the caption
- in a deck: decks do not play footage

## Params
| name | type | default | meaning |
|---|---|---|---|
| `backdrop` | slot (text) | none | one or two words, written as they should read (capitals if wanted), behind the speaker in the display face and the accent; sized by the kit so the longest word fills the safe width, never above the size at which its lines fit between the safe top and the speaker's head; its last line stands across the head's top, so the head covers only the lower part of its letters; any text entrance brings it in; one backdrop beat per scene, so give each phrase its own scene; removed when it has no beat |
| `lines` | number (beat param of `backdrop`) | 1 | the lines the backdrop is sized for, 1 or 2: set 2 for two words to stack them (each then smaller) |
| `headline` | slot (text) | none | a line on a canvas plate above the caption, at h2 times `--mm-headline-scale`; removed when it has no beat |
| `caption` | slot (text) | none | a line a step over body size (1.25) on a canvas plate at the foot of the frame; `text/caption-karaoke` with `mode: words` puts the spoken words here; removed when it has no beat |
| `speaker` | markup | the story's `footage` | not a slot: an `<img data-footage data-footage-matte data-media data-keep>` the kit points at the frame the edit maps `t` to, masked by that frame's person matte |
| `data-format` | html attribute | set by the kit | the speaker box stands on the frame's foot: the full width and 62 % of the height in 9x16, 72 % in 1x1, 66 % in 4x5; in 16x9 the whole recording at two thirds of the frame's width, centred; the head's top is taken to be 6 % of the box under its top; in 16x9 the plates stand in the lower left |

## Style variables consumed
- `--mm-color-accent`
- `--mm-color-canvas`
- `--mm-color-ink`
- `--mm-font-display`
- `--mm-font-text`
- `--mm-frame-h`
- `--mm-frame-w`
- `--mm-headline-scale`
- `--mm-radius-2`
- `--mm-safe`
- `--mm-size-body`
- `--mm-size-display`
- `--mm-size-h2`
- `--mm-space-3`
- `--mm-space-4`
- `--mm-tracking-display`
- `--mm-tracking-text`
- `--mm-weight-display`
- `--mm-weight-text`

## Legibility and rest notes
- Order from back to front: the scene's canvas and ground, the backdrop, the speaker, the plates. The backdrop never covers the speaker, and the plates stand at the foot of the frame (in 16x9 in the lower left), clear of a face framed with its eyes in the upper half of the recording.
- The backdrop is declared decoration: `data-decor` (the gate refuses a fact or the call to action in it, as it does for `data-micro`, and holds it to the body floor like any text) and `data-over` (the speaker's plates may stand on it). It is fitted at rest by the kit's word fit, so its glyphs are drawn at the size G-LEGIBLE reads, and it stays inside the safe area: its size is capped so its lines (1, or 2 with `lines: 2`) and their glyph overhang fit between the safe top and the head, and its last line ends 0.3 em under the head's top, so about the top two thirds of its letters stand clear above the head.
- The speaker is a declared media leaf: the gate's pixel rules mask its box. Its mask is the matte frame of the same source frame as a luminance mask (an SVG `<mask>` the kit adds beside it), laid with the picture's own object-fit and object-position; the kit decodes the mask's image inside `settle()`, so a frame is the same in any seek order and the mask never trails the picture.
- The matte was smoothed when it was written (`mm footage matte`: a 3-frame temporal median and a feather), so the edge neither flickers from frame to frame nor reads as cut with scissors.
- The speaker box stands on the frame's foot and the recording covers it, so the body leaves through the bottom edge as it leaves the recording's; a box no wider than 16:9 shows the whole height of a wide recording, so the head is never cropped.
- Headline and caption are ink on canvas plates, so their contrast is the brand's whatever the speaker wears.

## Provenance
original

## Known limits
- The layout expects a wide (16:9) recording with the speaker framed with a little headroom (the head's top about 6 % under the recording's top) and the body leaving through its bottom edge: the words stand on that assumed head row, so a speaker framed much lower leaves the words floating above the head, and one framed higher hides more of them. A tall recording is cropped equally at its top and foot and can lose the head.
- In 16x9 the recording is drawn at two thirds of the frame's width: hands that leave the recording's sides end at its edge.
- Nothing measures the face: a long headline and caption stacked at the foot of a 9x16 frame can reach a low chin. Keep them short.
- The backdrop holds one or two words; two words on two lines need `lines: 2`, and a third line is never allowed for: it would cross the safe top. A display face whose glyph boxes rise more than 0.2 em over its line box can cross the safe top by a few px.
- A word whose middle letters stand behind the head reads by its ends: prefer words of four letters or more, and words the speaker says in that phrase.
