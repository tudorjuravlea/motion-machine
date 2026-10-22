# layouts/pile-up

## Purpose
Cards land one at a time with hard cuts, overlapping, until the pile itself is the message; an opaque panel over it carries the line to read.

## Use when / Do not use when
**Use when**
- social proof and momentum: sign-ups, reviews, orders, messages piling up
- the cards are texture: each one is short and none carries a fact on its own
- the panel line says what the pile is ("Sign-ups this week")

**Do not use when**
- each card must be read: use `layouts/list-reveal` or `layouts/paper-cards`
- a calm or premium piece: the deal is busy on purpose
- a card carries a figure or a claim: cards overlap and are never all readable

## Params
| name | type | default | meaning |
|---|---|---|---|
| `card-1` … `card-14` | slot (text) | none | the cards, each at a fixed place and tilt; the first four ring the panel's top and bottom edges, so a pile of one to four still shows; stacking rises with the number, so bring them in slot order and the newest is always on top; a card without a beat is removed |
| `headline` | slot (text) | none | the panel's line, at h2 times the headline scale (the panel is a small surface); carries `mm-fit` |
| `sub` | slot (text) | none | a line under it, at body size |
| `data-format` | html attribute | set by the kit | cards are 46 % of the pile's width in 9x16 and 4x5, 44 % in 1x1, 30 % in 16x9; the panel is 78 % wide (52 % in 16x9) |
| `align` | enum(left\|center) | the brand's `composition.align` | the panel's alignment; a beat param on any slot (`data-p-align`) or `data-align` on the layout root overrides it |

Timing is the story's, since a layout has no clock. Give every card `params.instant: true` (a hard-cut arrival) and put each `at` on a whole frame at 30 fps, so every cut lands on a frame. Let the deal gather pace: long gaps first (about 8 frames, a quarter second, so the first cards are seen one by one), shortening to 3 frames as the pile grows, because a quickening deal says "more, and faster", which is the point of the pile. One held breath midway (about 12 frames) lets the quickening be heard twice, and a pause of at least 0.4 s before the panel lets the panel land as the answer. The demo is dealt 8, 7, 6, 5, 5, 12, 6, 5, 4, 4, 3, 3, 3 frames apart. W-PACE will report the burst of arrivals, which is the point.

## Style variables consumed
- `--mm-safe`, `--mm-density`, `--mm-align`, `--mm-headline-scale`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-color-line` (cards), `--mm-color-canvas`, `--mm-color-ink` (panel and its text), with an alpha of ink for the soft shadows
- `--mm-font-display`, `--mm-weight-display`, `--mm-tracking-display`, `--mm-size-h2` (headline); `--mm-font-text`, `--mm-weight-text`, `--mm-tracking-text`, `--mm-size-body` (cards and sub)
- `--mm-space-0` to `--mm-space-5`, `--mm-radius-2`

## Legibility and rest notes
- Card type is level at rest: the tilt (1.5° to 6°, either way) is on each card's backing, its `::before`, never on the text (no rotated type).
- The first four cards sit at the pile's top and bottom edges, alternating sides, clear of the panel in every format (at most 40 % of a card under it, measured with the demo's panel on paper and nocturne); later cards fill in around the panel and pass under it.
- Cards overlap by design and carry `data-over`, so G-OVERLAP leaves them out; the panel's own text never overlaps another panel line.
- The panel is opaque, above every card, and shown from the moment its first slot arrives; at rest cards sit under it as well as around it. It is not carved out of the pile.
- Stacking order is the slot number, and a card's place never moves, so the newest card brought in slot order is never covered by an older one.
- Every box sits inside `--mm-safe`, with a further `--mm-space-3` around the pile; cards stay within the pile's box at every format. Text is at body size or above; nothing uses `data-micro`.

## Provenance
- feitangyuan/motion-web, CC BY-NC 4.0: ideas only; no code taken. A pile of cards that arrive with no entrance animation on an irregular beat (never a metronome), stacking that follows arrival so the newest is never buried, and an opaque panel over the pile; restated as a CSS layout with fixed places, the first cards clear of the panel, level type on tilted backings, and a deal that gathers pace with our own numbers and reasons, in our own code.

## Known limits
- Fourteen cards at most and no retirement: a longer deal needs a second scene.
- The deal's timing is a rule for the story, not enforced by the layout; a story that brings cards out of slot order can bury its newest card.
- Places are fixed per slot, the same in every piece; two pile-ups in one film look alike.
- A long card (three lines or more) near the bottom of the pile can cross the safe margin: keep cards to a few words.
