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

## layouts (20)

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
| `layouts/talking-full` | The story's footage (a talking-head recording cut by `mm footage cut`) fills the frame, with an optional headline in the top band and a caption low in the frame. | headline, caption (the footage is not a slot) | none |
| `layouts/talking-cutout` | The speaker, cut out by the person matte (`mm footage matte`), stands in the brand's background in front of one or two huge backdrop words, with a headline and a caption on plates in front. One backdrop beat per scene; the backdrop is decoration (`data-decor`): never a fact or the call to action. | backdrop, headline, caption (the footage is not a slot) | `lines=1` (backdrop beat) |
| `layouts/shortlist` | Up to six candidates arrive, then the field collapses to the one picked when the `result` beat arrives, with the result card under it. Exactly one item beat carries `pick: true`; with none nothing collapses and the result sits under the grid, with two the first wins. | headline, item-1 … item-6, result | `pick=false` (item beat) `align=center` |
| `layouts/pile-up` | Up to 14 cards land one at a time, overlapping, newest on top, until the pile is the message; an opaque panel over it carries the line to read. The first four cards sit clear of the panel; deal them `instant: true` on whole frames, quickening, with a pause before the panel. | card-1 … card-14, headline, sub | `align=center` |
| `layouts/label-column` | An object (a picture, or its layers) with up to six labels in a column beside it, each joined by a leader to its point on the object, like a teardown. Labels shrink toward the body floor to fit; keep names to a few words, labels in point order, and fade them in. | headline, object (asset), measure, label-1 … label-6 | `x=0.5` `y=0.5` `spec=` (label beats) |

## entrances (24)

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
| `entrances/sketch` | Draws the slot as a wireframe: a pen goes round its box and over itself, the label arrives as it closes, and at rest the line shivers. | `shape=box` `roughness=1` `pen=plain` `fill=none` `tint=accent` |
| `entrances/slam` | Brings a line down hard: large and high at first, landing hard on the type spring, so the line stops at rest and never passes it. | `from=1.4` `d=0.3` `origin=auto` |
| `entrances/typewriter` | Types a line out one character at a time with a caret at the typing position. | `caret=true` `blinks=0` |
| `entrances/words` | Brings a line in word by word, each word rising and fading in turn. | `d=28` |
| `entrances/slats` | The element shows through slats that open one after another until they meet. | `slats=6` `axis=vertical` |
| `entrances/assemble` | Seeded dots travel on spiral arcs into the letterforms, then the real text fades in as they land. | `dots=420` `color=ink` |
| `entrances/photo-wake` | A photo arrives as a two-colour print in the brand's ink and canvas, and an accent front sweeps across it, leaving its real colours behind. | `origin=left` `band=0.12` `warp=0.35` |
| `entrances/character` | The brand's mascot (any character: extra parts that swing, floating or legless, armless, eyes-only or screen faces; a cast member picked with `who`) hops into its slot (crouch, arc, squashed landing) and keeps an idle on the beat grid at rest, while the kit reports it finished. | `mood=calm` `to=none` `view=front` `facing=right` `look=center` `+6` |
| `entrances/diagonal-join` | A title arrives as two halves, cut along a diagonal, that slide toward each other along the cut and join; each half's slide is capped by its own room. | `angle=30` `gap=1.2` |
| `entrances/card-flip` | A blank card turns over about its vertical axis to show the slot's content, ending at 180° with no mirrored face; `steps: 6` gives a stepped cadence. | `steps=0` |
| `entrances/light-reveal` | A soft light front crosses the block at an angle and turns it on, with a faint accent glint riding the front: a keynote reveal on a dark ground. | `angle=120` `soft=0.35` `base=0.07` `glint=0.4` |
| `entrances/one-line` | Draws a mark from the beat's SVG `asset` (a logo outline, a silhouette, a signature) as one continuous line: the pen never lifts, slows on curves and draws wider where slow. Give the beat `params.dur` of 4 s or more. | `curves=1.5` `weight=1` `fit=0.86` `follow=0` `boil=false` `+1` |

## exits (6)

| id | what it does | key params |
|---|---|---|
| `exits/blur-out` | Takes a picture, device or shape out of focus while it fades, the mirror of `blur-fade`; a layer that carries text only fades. | `blur=12` |
| `exits/drop-out` | Lets an element fall away downward while it fades. | `d=96` |
| `exits/fade-out` | Takes an element out by opacity, over exitRatio of its entrance. | none |
| `exits/push-out` | Slides an element out toward one side while it fades, making room for what follows. | `d=120` `side=left` |
| `exits/wither` | A garden grown by `text/garden` (any kind, the botanical bed too) recedes in reverse growth order to the bare type, which then fades or stays whole until the slot leaves; it reads the piece time, so floating petals fly home without a jump. | `type=fade` |
| `exits/knife-cut` | A blade slices through each line of the text, parting the letters, then the element folds shut onto the middle and is gone: "what we removed". Give the beat an entrance, not `instant`, so the exit has a length. | `rule=ink` |

## emphasis (14)

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
| `emphasis/act` | Acts a mood change on the brand's mascot (or the cast member named by `who`): eyes squeeze shut into the key, the face swaps while they are shut, a take pops it up, and it settles into the new mood's idle. | `mood=calm` `to=none` `amount=1` `view=front` `facing=right` `+4` |
| `emphasis/roulette` | A highlight runs along the element's sibling slots (the options), slows and lands on the element carrying the emphasis (the answer), which stays marked for the rest of the scene: "which plan, which day". Give the answer beat `instant: true`. | `passes=1` |
| `emphasis/wash-bloom` | Colours in a sketched slot: once its pen closes, a watercolour wash blooms behind the ink and stays, slot after slot in pen order, cycling the brand's roles. On an `entrances/sketch` slot only. | `bloom=cycle` `offset=2` |
| `emphasis/emote` | Pops a small drawn reaction (exclaim, question, heart, sparkle, dots, zzz, note, drops) beside the words, clear of every line in the scene, and lets it go; with no free place it draws nothing and warns. | `mark=exclaim` `side=right` `size=0.75` `color=accent` |
| `emphasis/stamp` | A verdict word slams down as a pitted rubber stamp in one palette role and stays, level type on a tilted plate. Beat `instant: true`; the word is sized to its room; the slam starts at min(2.6, room), about 1.2 to 1.5× for a one-word h1 verdict. Pair with `moves/shake` and `sound/hit`. | `personality=slam` `tone=accent` `tilt=left` `size=h1` `flash=0.35` `+1` |
| `emphasis/dimension` | A measure drawn across exactly what it measures, glyph ink to glyph ink: the slot's own text, or `for: <slot>` (the headline above, `object` on label-column), the value centred on it. Beat `instant: true`. | `for=` `axis=x` `tone=accent` |

## transitions (22)

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
| `transitions/iris` | Opens the incoming scene through a growing circle or diamond, from the centre of the frame or from a slot of the new scene. | `shape=circle` `target=` (a slot of the incoming scene to open from) |
| `transitions/light-leak` | Washes a warm accent glow across the frame that peaks as the scenes swap. | none |
| `transitions/push` | Slides the incoming scene in while it pushes the outgoing one out of the frame; both scenes travel. | `direction=left` |
| `transitions/shared-element` | Carries an element that appears in both scenes from its box in the outgoing scene to its box in the incoming one. | `fit=width` |
| `transitions/sketch-to-ink` | Turns a wireframe scene into the finished one: each sketched slot's line straightens onto the matching finished slot, which comes in under it, then the line lifts. | none |
| `transitions/split` | Opens the incoming scene from a seam through the middle of the frame, like doors opening onto it. | `shape=diagonal` |
| `transitions/whip-pan` | Pans fast to the next scene with a one-axis blur that swells and falls with the speed. | `direction=left` `amount=1` |
| `transitions/wipe` | Sweeps a plate across the frame and cuts the outgoing scene away behind it. | `plate=accent` `direction=right` |
| `transitions/zoom-out` | Pulls the camera back: the outgoing scene recedes and the incoming one settles from larger than the frame. | `depth=0.6` |
| `transitions/zoom-through` | Dives the camera through the outgoing scene into the incoming one. | `depth=0.8` |
| `transitions/flood` | A disc of a palette role grows from a slot of the outgoing scene past the corners, holds, and shrinks into a slot of the incoming scene, or comes to rest on the dot of an i or a round element (`land`): topic or climax. 1.3 s in every style, divided by `speed`. | `from=` `to=` `color=accent` `land=point\|dot\|circle` `speed=1 (0.5–2)` `+2` |
| `transitions/cover` | The incoming scene slides in from one edge over the outgoing scene, which holds still and sinks under a scrim of the darkest role: related or topic. | `side=bottom` `dim=0.2` |
| `transitions/re-ink` | A print look: the incoming scene is pulled in a second role set behind a ragged front, then pulled again in the brand's own inks; into a canvas, footage or device screen it wipes with a role plate. | `inks=invert` `side=left` |
| `transitions/brush-wipe` | Tilted ragged painted bands in brand colours cover the frame, the cut happens under cover, and they drag off: a topic or chapter break. | `pair=accent` `bands=5` `tilt=-6` `side=left` |

## moves (15)

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
| `moves/depth-parallax` | A still picture becomes a dolly shot through a lens that settles: the layers of its pack start off their places by how far their depth lies from the focus (the nearest layer) and slide home, the far layers discreetly soft; the rest is the settled picture (`aperture=0`: the plain picture). | `path=dolly-right` `amount=0.12` `focus=auto` `aperture=0.35` `bands=10` `end=settle` |
| `moves/punch` | Hides jump cuts in talking-head footage: every other clip of the scene is framed closer, scaled about the speaker's eye line. | `scale=1.15` `x=50` `y=35` |
| `moves/shake` | An impact jolt on the camera (a landing, a slam, a stamp) that decays to a still rest; `hits` in seconds from the scene's start; never in a deck. | `hits=0.5` `amp=14` `decay=0.45` `seed=0` |

## text (12)

| id | what it does | key params |
|---|---|---|
| `text/caption-karaoke` | Cuts a line into groups of 2 to 6 words and lights the words of one group in turn; `mode: words` times the groups to the footage's spoken words. | `group=4` `mode=even` `lead=0.05` |
| `text/fit-headline` | Sizes a headline to the measure its layout gives it, then brings it in with a short rise. | `grow=false` `minRatio=0.5` `d=32` |
| `text/handwrite` | The line is written: each line's outline is traced in turn, then the fill comes in. | `stroke=ink` |
| `text/highlight` | Sweeps a marker behind a line of text from left to right while the words fade in. | `strength=0.35` |
| `text/kinetic-words` | Shows one word or phrase at a time, each replacing the last, ending on the final one. | `sep=|` `d=36` |
| `text/scramble` | Decodes a line from noise: letters resolve left to right while the rest shuffle. | `changes=12` `pool=(empty)` |
| `text/split-flap` | Sets a line on departure-board tiles that flip through letters and land one by one. | `flips=6` |
| `text/masked-fill` | The words stand as a faint outline and a fill rises inside the letterforms, led by a thin accent edge, until they are solid. | `fill=ink` `edge=true` |
| `text/elastic` | The line arrives stretched: a width wave starts at the middle letter and travels outward on a locked baseline. | `amp=0.22` |
| `text/date-flip` | A before-and-after change: the old value is struck through, then flips away while the new value flips in. | `from=` |
| `text/garden` | Vines, flowers, ivy leaves, ferns, blossoming branches, roots, coral, seaweed, moss, grass (or a mix), illustrated botanical blooms (rose-like camellias, fringed peonies, three-quarter lilies, sweet peas, in an ink-and-wash look), circuit traces or crystal shards grow out of the headline's own letters, or, as a botanical bed, rise from below the headline across the frame as one dense mass, and finish as a still garden in the brand's colours; `text=type` types the line letter by letter and grows each letter's plants once it is there. | `kind=vines` `stem=auto` `leaf=auto` `bloom=auto` `bed=false` `text=fade` `typeShare=0.5` `density=1` `+9` |
| `text/lit-sweep` | A whole block reads at a floor tone from the first frame, then a reading cursor lifts it to full ink word by word: manifesto and promise slides. | `floor=30` `soft=0.12` `edge=none` |

## data (11)

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
| `data/unit-stack` | A figure built from countable plates of a stated unit; the number counts the landed plates. `fix` unset keeps the value's own decimals; five or more digits are grouped; a value of zero or below draws nothing and warns. Cite the fact. | `unit=1` `per=10` `ruler=10` `rule=(empty)` `fix=(unset)` `+3` |

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

## 3d (4)

Real 3D through the vendored Three.js, rendered in software, frame-identical between renders.

| id | what it does | key params |
|---|---|---|
| `3d/laptop` | A notebook in real 3D turns in as its lid opens, turns slowly or makes a showcase half-turn; its screen plays a recording or a captured page. | `move=hero` `model=notch` `metal=aluminium` `status=auto` |
| `3d/phone` | A phone in real 3D rises and turns, with the built-in phone's rim, glass, keys and cutouts; hero, turntable, still, a showcase half-turn from its back, or a cross from left to right with one full turn. | `move=hero` `model=island` `metal=aluminium` `status=auto` |
| `3d/particles-to-shape` | Seeded particles fly in through real depth and land on the words, then the real text fades in. | `particles=900` `depth=1` |
| `3d/point-cloud` | A product cut-out, mark or headline rebuilt as a free-floating 3D object of sparse, glittering points: a seed bursts into a swirling cloud of pale streaks, a front sends each point home in its own colour, and the object rests turned three-quarters, twinkling and swaying. | `points=16000` `density=0.22` `colors=palette` `relief=auto` `depth=0.4` `depthMap=` `yaw=20` `sway=6` `drift=0.6` `streak=10` `origin=center` |

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
- **Growing type.** `text/garden` (`kind` vines, flowers, leaves, ferns, branches, roots, coral, seaweed,
  moss, grass, mix, circuits or crystals; any of `stem`, `leaf`, `bloom` set on its own mixes parts, e.g.
  `kind: flowers, bloom: rose`; `stemScale` 0.5 to 2 for how long stems grow) is a showpiece headline of
  one to four words. Render four to six `seed`s as stills and record the chosen seed in the story;
  circuits suit technology, crystals finance or precision, coral and seaweed water, ferns, moss and grass
  natural lines; `kind: botanical` gives an illustrated, editorial look (camellias, peonies, lilies, sweet
  peas), and `bed: true` with a headline set high grows a bed of flowers under the type, petals drifting
  (`drift: settle` for a still rest). Give it a hold of 2 s or more, and leave it with `exits/wither`.
- **Point cloud.** `3d/point-cloud` takes the beat's `asset`: a cut-out with a transparent ground
  (inflated into a pillow), a picture on a flat ground (keyed), a picture with a `depthMap` (displaced,
  black is ground) or an SVG mark (extruded). Without an asset it takes the slot's words (extruded; they
  rest as the slot's text, turning with the object). A picture on a busy ground with no depth map is
  refused and named in `mm.warnings`. It fills about 60 % of the frame's height and its canvas covers
  the frame, so give it a quiet scene; expect W-EMPTY in the first half second (one seed).
  `colors: palette` (the default) paints only brand roles and nothing is masked; `colors: source` keeps
  the picture's own colours on a canvas declared media.
- **One picture, made deep.** Take it apart once with `mm media layers` (masks from any editor,
  polygons, or `--key auto` for a flat background), make the beat's asset the pack's `source.png`, and
  give the scene `move: moves/depth-parallax`; the rest is the picture with its far layers discreetly
  soft (`aperture: 0` keeps the picture itself). Give `--plate` a clean plate when one exists: the drift
  shows what lies behind the parts. Decide the layers
  before the shot: only a part with its own mask can travel. Rigid things (faces, products, letterforms) move
  whole, never warped. To make a photo look native to the palette before it shows its own colours,
  enter it with `entrances/photo-wake` at `at: 0`.
- **Mascot.** `entrances/character` and `emphasis/act` draw the brand's `mascot` block (a brand
  without one gets the rig's plain default character). A mascot reacts to the headline; it never
  carries text. Write each mood change as a beat on the mascot's slot with
  `emphasis: emphasis/act` and `to` among the beat's own params; one act per beat; time the beat's
  `at` so the key (0.16 s after the landing) falls on the hit. Bring a client's mascot in with
  `mm brand mascot drawing.svg --brand brand.json` after naming its layers `body`, `face`, `eye-left`,
  `eye-right`, `mouth`, `arm-…`, `leg-…`, `shadow` (any other layer name is an extra part such as `tail`
  or `ear-left`); read the printed warnings (a colour no role explains) and notes (what was skipped). A
  second character goes in with `--as <name>` and is used with `who: <name>`. The rig keeps a drawn eye's
  place, size and colour but draws its own eye shapes; limbs are straight strokes.
- **Footage.** `mm media prep <video> --name <n>`, then `mm footage cut <video> --name <n>`, cut a
  talking-head recording in its measured pauses. Set `story.footage: { asset: "assets/<n>/" }` and
  `audio.track` to `assets/<n>/voice.wav`, and lay it out with `layouts/talking-full`, `moves/punch`
  and `text/caption-karaoke` (`mode: words`, with a word list given to `--words`: a plain list or
  WhisperX output; `--fillers` also cuts the hesitations a transcript leaves out). To stand the speaker in
  the brand, run `mm footage matte --name <n>` (Vision on macOS, or `--masks <dir>` from any tool) and use
  `layouts/talking-cutout`: one phrase per scene, one big word from it on the `backdrop` slot. There is no
  transcription and no split audio and picture cut: the words come from a supplied list.
- **Transitions from an element.** To make a scene out of the last one, flood from an element
  (`transitions/flood` with `cutParams: { from, to }`) or open an iris on the new scene's subject
  (`transitions/iris` with `cutParams: { target }`). A misspelled slot is named in `mm.warnings` and the
  cut falls back to the frame centre.
- **Pen voices.** `entrances/sketch` takes `pen` (pencil, marker, charcoal) and `fill` (wash or hatch,
  in the `tint` role); a hatch keeps clear of the label. Give a sketched slot `emphasis/wash-bloom` to
  colour it in after the pen closes.
- **Looks.** `spot-mono`: one accent subject per scene; let the payoff figure or the one keyword take the
  accent (stat-hero or split figures); everything else stays grey. `print-plates`: a key plate and a spot
  plate off register on warm stock, printed on threes; every emphasis kicks the plate, so place
  emphasis on the beats that should jolt. `blueprint`: a drafting grid in the ink role, mono lettering; mark figures with
  `emphasis/dimension` and let plates enter with `entrances/draw`. The `proof` motion half is
  short-form evidence: kinetic's quick entrances, calm's still camera, nothing bounces, every cut hard.
