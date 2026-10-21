# Patterns cheatsheet

Read when: writing the beat sheet (gate 2) or choosing a cut, move or entrance, to name patterns
that exist. Every id below is listed by `mm pattern list`; the card (repository root:
`patterns/<id>/PATTERN.md`) is the authority for params, limits and legibility notes, so open it
before using a param.

Written from every `patterns/**/PATTERN.md` (`mm pattern list`, plus each card's Purpose and
Params) and kept in step with the cards by hand; a test fails when a pattern id is missing
from it. Update it when a card changes. Layout rows list slots and the layout's own params; other
rows list key params as `name=default` (the first five; `+N` counts the rest, which the card
lists). A story passes params as `params` on a beat (entrance), `params.exit` /
`params.emphasis` (sub-bags), `cutParams` (transition) and `moveParams` (move).

## layouts (15)

| id | what it does | slots | params |
|---|---|---|---|
| `layouts/bento-3` | A headline over three tiles, the first of them leading, for a short set of parallel things, each a label, a picture or both (a tile beat's `asset`). | headline, tile-1, tile-2, tile-3 | `align=left` |
| `layouts/caption-bar` | A stage for a device or picture with a persistent lower band that carries the caption. | stage, overlay, caption | `align=left` |
| `layouts/comparison` | A headline over two equal sides, for a this-versus-that point. | headline, left, right | `align=left` |
| `layouts/desktop` | The whole frame is a laptop screen: a menu bar with a notch (an island), a two-colour wallpaper, one caption under the notch. | desk (screen), menu, caption, headline | `wall=accent` |
| `layouts/endcard` | The sign-off: a centred wordmark with an optional closing line above it and one unbroken line (a URL) below, the last frame of a film or a deck. | line, headline, body | `align=center` |
| `layouts/media` | One picture from the piece's `assets/`, framed at its own proportions or full bleed, with an optional headline above and caption below. | headline, image (asset), caption | `frame=framed` (image beat: `bleed`) `align=left` |
| `layouts/list-reveal` | A headline and up to six items that arrive one after another. | headline, item-1, item-2, item-3, item-4, item-5, item-6 | `align=left` |
| `layouts/quote` | A pulled line with an accent bar above it and an attribution beneath. | headline, attribution | `align=left` |
| `layouts/split` | A headline and body on one side and a figure with its caption on the other (16x9), stacked in 9x16 and 1x1. | headline, figure, body, caption | `align=left` |
| `layouts/stat-hero` | One figure as the whole picture, with a headline and a line of body beneath. | figure, headline, body | `align=center` |
| `layouts/statement` | One large claim, with an optional sub, for the scene that makes a single point. | headline, sub | `align=left` |
| `layouts/title-stack` | A rule, a headline and a sub, stacked and centred in the safe box: the opening layout. | headline, sub | `align=left` |
| `layouts/grid-break` | A headline over identical tiles, then one tile that breaks the pattern: accent fill, larger, lifted. | headline, tile-1, tile-2, tile-3, tile-4, tile-5, odd | `align=left` |
| `layouts/paper-cards` | A headline over up to three torn-edge paper cards at staggered heights, like notes on a board. | headline, card-1, card-2, card-3 | `align=left` |
| `layouts/fan-stack` | A headline over a stack of up to four cards, each in front of and below the last, every label readable: a pile of notifications. | headline, card-1, card-2, card-3, card-4 | `align=left` |

## entrances (18)

| id | what it does | key params |
|---|---|---|
| `entrances/blur-fade` | Brings an element in out of focus, sharpening as it fades up. | `blur=12` |
| `entrances/count` | Counts a number up from a start value to its fact, with steady digit widths. | `from=0` `prefix=(empty)` `suffix=(empty)` `fix=-1` `pad=0` |
| `entrances/draw` | Reveals a line along the x axis by growing it from one edge, so a rule or a stroke draws itself. | `origin=left` |
| `entrances/drop` | Lets an element fall from above and fall on the ui spring and stop at its place, without a bounce. | `d=0.75` |
| `entrances/fade` | Brings an element in by opacity alone, the quietest arrival there is. | none |
| `entrances/ghost-fade` | Shows a faint, soft, slightly large ghost of the element first, then tightens it into focus. | `ghost=0.25` `from=1.04` `blur=6` |
| `entrances/letter-cascade` | Drops every letter of a short line into place in a quick ripple. | `d=36` |
| `entrances/mask-reveal` | Uncovers an element with a clip-path wipe along one side, without moving or scaling it. | `side=left` |
| `entrances/pop` | Scales an element up from 0.9 to 0.97 of its size to full size on the ui spring, never from zero and never past full size. | `from=0.94` `origin=center` |
| `entrances/punch` | Lands a short line from slightly large with one fast ease-out, like a stamp. | `from=1.15` `origin=auto` |
| `entrances/rise` | Slides an element in a short distance along one side while it fades up. | `d=40` `side=up` |
| `entrances/scatter-settle` | Starts the letters or words of a line at seeded random positions and angles and settles them into place together. | `d=90` `turn=14` `unit=char` |
| `entrances/sketch` | Draws the slot as a wireframe: a pen goes round its box and over itself, the label arrives as it closes, and at rest the line shivers. | `shape=box` `roughness=1` |
| `entrances/slam` | Brings a line down hard: large and high at first, landing hard on the type spring, so the line stops at rest and never passes it. | `from=1.4` `d=0.3` `origin=auto` |
| `entrances/typewriter` | Types a line out one character at a time with a caret at the typing position. | `caret=true` `blinks=0` |
| `entrances/words` | Brings a line in word by word, each word rising and fading in turn. | `d=28` |
| `entrances/slats` | The element shows through slats that open one after another until they meet. | `slats=6` `axis=vertical` |
| `entrances/assemble` | Seeded dots travel on spiral arcs into the letterforms, then the real text fades in as they land. | `dots=420` `color=ink` |

## exits (4)

| id | what it does | key params |
|---|---|---|
| `exits/blur-out` | Takes a picture, device or shape out of focus while it fades, the mirror of `blur-fade`; a layer that carries text only fades. | `blur=12` |
| `exits/drop-out` | Lets an element fall away downward while it fades. | `d=96` |
| `exits/fade-out` | Takes an element out by opacity, over exitRatio of its entrance. | none |
| `exits/push-out` | Slides an element out toward one side while it fades, making room for what follows. | `d=120` `side=left` |

## emphasis (8)

| id | what it does | key params |
|---|---|---|
| `emphasis/circumscribe` | Draws an outline around an element's box and then wipes it away from where it started. | none |
| `emphasis/indicate` | Pulses an element once, scaling up a few percent and tinting toward the accent, then returns it exactly as it was. | `amp=0.08` `tint=1` |
| `emphasis/shine` | Sweeps one band of the accent across the element's text and leaves, like light crossing a surface. | `angle=100` `width=18` |
| `emphasis/spotlight` | Dims everything else toward the canvas and then releases it, so the eye lands on one element. | `dim=0.8` |
| `emphasis/marker-circle` | A hand-drawn ring around the text, traced, held, then lifted away. | `color=accent` `pad=0.18` |
| `emphasis/stretch-pill` | A pill slides in behind the words with its leading edge ahead, holds, then leaves with its trailing edge catching up. | `strength=0.28` |
| `emphasis/brackets` | Four corner brackets snap in around the words, the element lifts a little, then everything settles. | `lift=0.04` |
| `emphasis/lens` | The other items soften and dim while this one grows a little under a thin lens rim, then everything clears. | `blur=0.06` `zoom=0.06` |

## transitions (18)

| id | what it does | key params |
|---|---|---|
| `transitions/blinds` | Shows the incoming scene through slats that open together, like venetian blinds. | `slats=8` `axis=horizontal` |
| `transitions/blur-crossfade` | Dissolves between scenes while the outgoing one defocuses and the incoming one pulls into focus. | `amount=1` |
| `transitions/clock-wipe` | Reveals the incoming scene with a hand sweeping round the centre from twelve o'clock. | `direction=clockwise` |
| `transitions/color-dip` | Takes the outgoing scene down into a flat colour and brings the incoming one up out of it. | `veil=canvas` `hold=0.2` |
| `transitions/crossfade` | Dissolves from the outgoing scene to the incoming one by opacity alone; with text on both sides it clears the old text before the new text appears. | none |
| `transitions/flip` | Turns the frame on its axis: the outgoing scene swings edge-on and the incoming one swings out to rest. | `perspective=2` `axis=y` |
| `transitions/grid-dissolve` | Brings the incoming scene in cell by cell on a grid, each cell on its own seeded schedule. | `cols=8` `spread=0.6` |
| `transitions/hard-cut` | Replaces the outgoing scene with the incoming one in a single frame. | none |
| `transitions/iris` | Opens the incoming scene from the centre of the frame through a growing circle or diamond. | `shape=circle` |
| `transitions/light-leak` | Washes a warm accent glow across the frame that peaks as the scenes swap. | none |
| `transitions/push` | Slides the incoming scene in while it pushes the outgoing one out of the frame; both scenes travel. | `direction=left` |
| `transitions/shared-element` | Carries an element that appears in both scenes from its box in the outgoing scene to its box in the incoming one. | `fit=width` |
| `transitions/sketch-to-ink` | Turns a wireframe scene into the finished one: each sketched slot's line straightens onto the matching finished slot, which comes in under it, then the line lifts. | none |
| `transitions/split` | Opens the incoming scene from a seam through the middle of the frame, like doors opening onto it. | `shape=diagonal` |
| `transitions/whip-pan` | Pans fast to the next scene with a one-axis blur that swells and falls with the speed. | `direction=left` `amount=1` |
| `transitions/wipe` | Sweeps a plate across the frame and cuts the outgoing scene away behind it. | `plate=accent` `direction=right` |
| `transitions/zoom-out` | Pulls the camera back: the outgoing scene recedes and the incoming one settles from larger than the frame. | `depth=0.6` |
| `transitions/zoom-through` | Dives the camera through the outgoing scene into the incoming one. | `depth=0.8` |

## moves (12)

| id | what it does | key params |
|---|---|---|
| `moves/hero-drift` | A slow hero shot: a shallow 3D drift with a float and a breath of scale, back at rest at both ends. | `tilt=1.2` `d=12` `end=scene` |
| `moves/hold` | The camera does not move; it exists so a story can choose stillness by name. | none |
| `moves/idle-breathe` | An ambient swell so a held scene is alive without being a move. | `amount=0.008` `d=4` `cycles=2` |
| `moves/ken-burns` | The classic slow zoom with a small sideways creep. | `to=1.05` `dir=right` `target=camera` (`media`: pictures only) `end=scene` |
| `moves/morph` | Inside a scene one box becomes another: a box travels from one slot to another (separate-axis springs) and the second slot's content takes its place. | `from=` `to=` `start=0.6` `dur=1.2` |
| `moves/orbit` | A gentle turn about the vertical axis that parallaxes the layers, no WebGL. | `turn=5` `gap=140` `end=scene` |
| `moves/pan` | The camera slides sideways or up and down across the scene. | `dir=left` `d=48` `target=camera` (`media`: pictures only) `end=scene` |
| `moves/pull-back` | The camera starts close and settles to the full frame, revealing context after a detail. | `from=1.06` `end=scene` |
| `moves/push-in` | The camera drifts toward the scene, optionally toward a data-focus element. | `to=1.06` `focus=empty` `target=camera` (`media`: pictures only) `end=scene` |
| `moves/rack-focus` | Focus pulls from one depth plane to another; layers away from the plane blur. | `from=0` `to=1` `rest=sharp` `blur=8` `end=scene` |
| `moves/reframe` | The camera re-centres on a data-focus element while pushing in a little. | `focus=empty` `to=1.12` `amount=1` `end=scene` |
| `moves/explode-layers` | Mid-scene the camera tips back while the layers part in depth toward one vanishing point, then folds flat again. | `tilt=22` `gap=260` |

## text (10)

| id | what it does | key params |
|---|---|---|
| `text/caption-karaoke` | Cuts a line into groups of 2 to 6 words and lights the words of one group in turn. | `group=4` |
| `text/fit-headline` | Sizes a headline to the measure its layout gives it, then brings it in with a short rise. | `grow=false` `minRatio=0.5` `d=32` |
| `text/handwrite` | The line is written: each line's outline is traced in turn, then the fill comes in. | `stroke=ink` |
| `text/highlight` | Sweeps a marker behind a line of text from left to right while the words fade in. | `strength=0.35` |
| `text/kinetic-words` | Shows one word or phrase at a time, each replacing the last, ending on the final one. | `sep=|` `d=36` |
| `text/scramble` | Decodes a line from noise: letters resolve left to right while the rest shuffle. | `changes=12` `pool=(empty)` |
| `text/split-flap` | Sets a line on departure-board tiles that flip through letters and land one by one. | `flips=6` |
| `text/masked-fill` | The words stand as a faint outline and a fill rises inside the letterforms, led by a thin accent edge, until they are solid. | `fill=ink` `edge=true` |
| `text/elastic` | The line arrives stretched: a width wave starts at the middle letter and travels outward on a locked baseline. | `amp=0.22` |
| `text/date-flip` | A before-and-after change: the old value is struck through, then flips away while the new value flips in. | `from=` |

## data (10)

| id | what it does | key params |
|---|---|---|
| `data/bar-grow` | Grows up to six vertical bars from a baseline in turn, each carrying its counting value. | `values=(empty)` `labels=(empty)` `max=0` `focus=0` `fix=0` +3 |
| `data/counter` | Counts a figure from `from` to the beat's value in tabular digits through the kit's count(). | `from=0` `fix=0` `pad=0` `prefix=(empty)` `suffix=(empty)` +1 |
| `data/fill-bar` | Fills a pill track to value over max, with a counting readout above it. | `max=100` `fix=0` `prefix=(empty)` `suffix=%` `readout=true` +1 |
| `data/funnel` | Shows up to five stages as centred bars narrowing down the frame, each with its name and counting value. | `values=(empty)` `labels=(empty)` `fix=0` `prefix=(empty)` `suffix=(empty)` +1 |
| `data/line-draw` | Draws a polyline from a list of points by p, a dot riding its head, with an optional counting readout above. | `points=(empty)` `thick=1.2` `fix=0` `prefix=(empty)` `suffix=(empty)` +1 |
| `data/odometer` | Rolls a figure into place as clipped digit strips, one column per digit, so a number arrives as a mechanism rather than a fade. | `from=0` `fix=0` `pad=0` `prefix=(empty)` `suffix=(empty)` +1 |
| `data/ring` | Draws a circular progress stroke by p, with a counting readout in its centre. | `max=100` `fix=0` `prefix=(empty)` `suffix=%` `thick=8` +1 |
| `data/stat-tile` | Shows one figure on a surface card with a label and a delta chip, the figure counting and the label and delta settling in after it. | `label=(empty)` `delta=(empty)` `from=0` `fix=0` `pad=0` +3 |
| `data/bar-to-line` | Bars grow in turn, then each becomes a dot on its top while a line is drawn through them: amounts, then the trend. | `values=(empty)` `labels=(empty)` `max=0` `focus=0` `fix=0` +2 |
| `data/flow` | One node fans out to several and gathers into one on curves; pulses travel along them and each node rings as one lands. | `nodes=(empty)` |

## devices (5)

| id | what it does | key params |
|---|---|---|
| `devices/browser` | A generic browser window with a toolbar that settles in with a small scale and lift; a beat `asset` fills its screen. | `from=0.94` `d=40` `size=regular` |
| `devices/cursor` | An SVG pointer that follows a path through the host slot and then clicks. | `path=20,30 50,55 75,45` `click=true` |
| `devices/laptop` | A generic notebook whose lid opens as the entrance, then rests flat; a beat `asset` fills its screen; a camera notch and an optional menu bar. | `open=80` `size=regular` `model=notch` `menu=` |
| `devices/phone` | A generic handset that rises into frame with a settling tilt; a beat `asset` fills its screen; an island or notch and a status bar. | `tilt=24` `d=80` `size=regular` `model=island` `statusTime=10:00` +1 |
| `devices/screen-zoom` | A framed screen whose content scales until the screen alone fills the frame. | none |

## sound (9)

| id | what it does | key params | anchor |
|---|---|---|---|
| `sound/bed` | Marks a held rest: a quiet loop under the scene, synthesised in three feels with no samples. | `gain=0.12` `seed=97` | start |
| `sound/complete` | Marks the end card, synthesised in three feels with no samples. | `gain=0.35` `seed=83` | start |
| `sound/hit` | Marks a slam, or a figure landing, synthesised in three feels with no samples. | `gain=0.35` `seed=53` | start |
| `sound/press` | Marks a deck press or a button press, synthesised in three feels with no samples. | `gain=0.35` `seed=23` | start |
| `sound/riser` | Marks the second before a climax, synthesised in three feels with no samples. | `gain=0.35` `seed=61` | end |
| `sound/step` | Marks progress advancing: a counter step, a list item, a stage, synthesised in three feels with no samples. | `gain=0.35` `seed=41` | start |
| `sound/success` | Marks a positive outcome, synthesised in three feels with no samples. | `gain=0.35` `seed=71` | start |
| `sound/swipe` | Marks a transition between scenes; the sound pipeline places it on the cut, synthesised in three feels with no samples. | `gain=0.35` `seed=37` | end |
| `sound/tick` | Marks a small arrival: a chip, a word, a bar landing, synthesised in three feels with no samples. | `gain=0.35` `seed=11` | start |

## 3d (3)

Real 3D through the vendored Three.js, rendered in software, frame-identical between renders.

| id | what it does | key params |
|---|---|---|
| `3d/laptop` | A notebook in real 3D turns in as its lid opens, turns slowly or makes a showcase half-turn; its screen plays a recording or a captured page. | `move=hero` `model=notch` `metal=aluminium` `status=auto` |
| `3d/phone` | A phone in real 3D rises and turns, with the built-in phone's rim, glass, keys and cutouts; hero, turntable, still, a showcase half-turn from its back, or a cross from left to right with one full turn. | `move=hero` `model=island` `metal=aluminium` `status=auto` |
| `3d/particles-to-shape` | Seeded particles fly in through real depth and land on the words, then the real text fades in. | `particles=900` `depth=1` |

## screen (8)

Actions on a device screen, given in a beat's `screen` list as `{ "do": "screen/<name>", "at": s, "d"?: s, "params": {…} }`
(film: seconds after the beat arrives; deck: `step` presses after the beat's). The beat's `asset` is a still, or a
folder made by `mm media prep` (a recording) or `mm capture site` (a page); marks come from `--mark`.

| id | what it does | key params |
|---|---|---|
| `screen/compare` | A before-and-after divider on a device screen: a line enters at the right edge, stops, and another asset shows right of it. | `to=` `stop=0.5` `move=0.35` |
| `screen/callout` | A leader line from a mark on a device screen to a short label beside the device. | `at=50%,50%` `text=` `side=auto` |
| `screen/island` | The device's cutout grows into a widget with a line of text, holds, and shrinks back, with no jump between actions. | `w=0.86` `h=0.12` `text=` `close=false` |
| `screen/play` | Plays a prepared screen recording on a device screen, from a point in the clip and at a speed. | `from=0` `rate=1` |
| `screen/scroll` | Glides a captured web page on a device screen to a named mark or an offset. | `to=0` `align=top` `settle=0.4` |
| `screen/swap` | Moves a device screen to another asset, as app navigation does: slide, fade or cut. | `to=` `how=slide` |
| `screen/tap` | A touch ring at a mark or a point on a device screen: a press, then a ripple. | `at=50%,50%` `ripple=true` |
| `screen/zoom-to` | Pushes in on a mark or a point inside a device screen until it fills the centre of the screen. | `at=50%,50%` `s=1.6` |

## Notes the cards leave to be found

- **Style roles.** `fx: "style:headline|body|figure|plate"` takes `style.entrances.<role>`; a scene's
  `position` (`opening|related|topic|climax|outro`) takes `style.transitions.<position>` when
  there is no `cut`. A figure beat whose role resolves to `entrances/punch`
  (kinetic) draws `text`, not `value`: give it both.
- **`params.instant: true`** makes an entrance 0 s (the hook); in a deck a beat's `step: 0`
  puts it on rest 0.
- **`data/*` size.** `size` is a style size role, one of `display`, `h1`, `h2`, `body`, `caption`
  (not `hero`, `large` or a number: `size: hero` was silently ignored). Defaults: `data/counter` and
  `data/odometer` `h1`, `data/stat-tile` `display`, `data/fill-bar`, `data/ring` and
  `data/line-draw` `h2`, `data/bar-grow` and `data/funnel` `body`.
- **Layouts take `align`** (`left|center`), as a beat param on any slot of the scene or
  `data-align` on the root; the default is each card's own, so centring is a decision.
  `layouts/endcard` has a `line` slot: the closing line above the wordmark.
- **Moves take `end`** (`scene|settle`): `settle` ends the move at the scene's settle instant and
  holds, so the rest is still (W-AMBIENT finds nothing moving).
- **Sound anchors.** `sound/riser` and `sound/swipe` have `anchor: "end"`: the cue ends on the
  beat's landing (the cut for `swipe`); all others start on the beat.
- **Overlap.** `layouts/stat-hero`'s figure box does not overlap its headline in any bundled
  face (its line-height and gap see to it; its card says why). If G-OVERLAP still names two slots, render
  options and change the size role or the layout; never the threshold.
