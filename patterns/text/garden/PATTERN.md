# text/garden

## Purpose
Ornament grows out of the headline's own letters: vines, flowers, ivy leaves, ferns, blossoming branches, roots, coral, seaweed, moss, grass, a mix of them, illustrated botanical blooms, circuit traces or crystal shards root on the letterforms (or, as a botanical `bed`, rise from below the headline toward its baseline), weave behind and in front of the type, and finish as a still garden in the brand's colours.

## Use when / Do not use when
**Use when**
- a short headline (one to four words) is the film's showpiece: an opener, a launch line, a brand promise
- the brand needs a crafted, made-by-hand moment without leaving its palette: `vines`, `flowers`, `branches` and `leaves` for warm and consumer brands, `ferns`, `moss` and `grass` for natural, outdoor and wellbeing lines, `roots` for heritage and foundations, `coral` and `seaweed` for water and the sea, `circuits` for technology, `crystals` for finance, value and precision
- the brand wants a lush, illustrated, editorial look: `botanical` draws filled, shaded, veined camellias, peonies, lilies and sweet peas with broad leaves; with `bed: true` it grows a whole bed of them across the bottom of the frame under a headline set high, loose petals drifting above, and reads best on a light canvas whose accent is a warm flower colour and whose accentInk is a second warm colour (the lilies)
- the scene can hold still after the growth: the garden reads best over a hold of two seconds or more

**Do not use when**
- the line is body copy or longer than about twenty letters: the plants crowd and the text box budget prunes most of them
- the headline shares its box with tightly set neighbours on every side: growth is kept off every other filled slot and inside the safe area, so a boxed-in line grows little
- the brand's accent sits close to its ink (the blossoms then read as stains on the letters); pick `circuits` or `crystals`, whose accent parts are small

## Params
| name | type | default | meaning |
|---|---|---|---|
| `kind` | enum(vines|flowers|circuits|crystals|leaves|ferns|branches|roots|coral|seaweed|moss|grass|mix|botanical) | `vines` | what grows. An organic kind is a preset of three parts (the table below): vines of curving stems with leaves, spiral curls, some blossoms and bridges between letters; flowers whose stems end in blossoms and whose offshoots end in buds or leaf pairs; leaves: slender ivy stems with pairs of heart leaves and curls; ferns: arching fronds of graded leaflets ending in a fiddlehead curl; branches: twigs with buds at their joints and small notched blossoms at their tips; roots: forking threads with fine hairs hanging from the letters' feet; coral: thick limbs that fork often and widen to round tips; seaweed: tall kelp ribbons with ruffled edges and a midrib, waving as they grow; moss: cushions of dots, tufts and capsule stalks on the letters' top edges; grass: clumps of blades and seed heads along the baseline; `mix`: two or three organic presets chosen by the seed, each anchor drawing its own (botanical is never drawn into a mix); botanical: curving stems with broad two-tone leaves, each plant opening one illustrated bloom drawn from a bouquet of camellia, peony, lily, sweetpea and bud by the seed. Not organic: 45-degree trace buses on a 0.08 em grid ending in vias and pads (circuits); 30-degree stems ending in faceted shards (crystals) |
| `stem` | enum(auto|curve|branch|ribbon|root|none) | `auto` | the stem part: `auto` takes the kind's. `curve` and `branch` root on the letters' anchors; `ribbon` grows grass blades from the baseline (seaweed's kelp from the anchors); `root` hangs from the feet; `none` sets cushions on the top edges |
| `leaf` | enum(auto|none|round|lance|heart|frond|broad) | `auto` | the leaf part: `auto` takes the kind's. `frond` sets graded leaflets along every stem; on a stemless set the leaf shapes its tufts; `broad` is a wide, pointed leaf in two tones (deep teal from `line`, sage from `muted`), one half in shade, with a light midrib and side veins |
| `bloom` | enum(auto|none|daisy|rose|tulip|bud|berry|spore|camellia|peony|lily|sweetpea) | `auto` | what opens at a stem's end: `auto` takes the kind's. A number here is read as `bloomShare`. `camellia`, `peony`, `lily` and `sweetpea` are filled, shaded, veined blooms (below) |
| `bloomShare` | number | 0.5 | vines: the share of main stems that end in a bloom instead of a curl, 0 to 1 |
| `density` | number | 1 | how much grows, 0.5 to 1.6: anchors per letter, a second plant on more letters (a third on some above 1), offshoots at a quarter of the joints at 1, branches and bridges. Measured on the demo's lines, 1.6 grows about 1.4 times the ornament of 1 |
| `stemScale` | number | 1 | how long stems grow, 0.5 to 2: at 1 a stem's first segment is 0.55 to 0.85 of the font size and the stem three to six segments long; blossoms, leaves and shards grow with its square root |
| `seed` | number | 1 | which garden: another seed grows another arrangement from the same letters; render four to six seeds as stills and keep the one you like in the story (the number of blossoms in particular varies by seed) |
| `bridges` | boolean | true | vines and circuits: stems that reach from a letter to its neighbour in the same word |
| `lean` | number | 0 | the whole garden leans right (positive) or left (negative), -0.4 to 0.4 rad |
| `layer` | enum(weave|behind) | `weave` | weave passes a capped share of stem crossings in front of the letters; behind keeps every stem under them |
| `sway` | enum(none|breathe) | `none` | after landing, `breathe` sways the ornament by its height above the root on a 3.2 s cycle; roots and text never move |
| `text` | enum(fade|present) | `fade` | the text fades in over the first 16 % of the entrance, or is there from the first frame |
| `bed` | boolean | false | botanical: the flowers grow as a bed rising from below the headline toward its baseline, across the whole frame, instead of from the letters (below) |
| `petals` | number | 8 | botanical bed: loose petals that leave the blooms once they open and drift into the air above the bed, 0 to 24 |
| `drift` | enum(float|settle) | `float` | botanical: after landing the loose petals keep floating slowly round their place (within about 1 % of the frame's short side, a sway, a turn and a tumble on periods of 5 to 9 s), or settle and hold still |

Duration role: `hold` (a beat's `params.dur` overrides it; 2 to 3 s shows the growth best). Plants start in reading order. A stem reveals by its length on an ease-out (circuits with an ease-in-out, crystals with an ease-in); an offshoot starts when its parent's reveal passes the joint it grows from and takes 60 % of the time the parent has left; a leaf opens when the reveal passes its joint. Ends (blossoms, buds, leaf pairs, pads, shards) open once their stem is complete, on a closed-form spring whose overshoot stays under the style's `motion.overshootMax` (0.12 at most). Every window is mapped inside the entrance, so the garden is complete at p = 1.

**The parts of each organic kind** (any part given on its own replaces the preset's; circuits and crystals take no parts)

| kind | stem | leaf | bloom |
|---|---|---|---|
| `vines` | curve | lance | daisy, on a `bloomShare` of main stems |
| `flowers` | curve | lance (pairs at offshoot ends) | daisy |
| `leaves` | curve | heart, in pairs along every stem | none |
| `ferns` | curve, gently arching | frond | none |
| `branches` | branch | none | daisy, small and notched, and buds |
| `roots` | root | none | none |
| `coral` | branch, thick with round tips | none | none |
| `seaweed` | ribbon (kelp from the anchors) | none | none |
| `moss` | none | lance (tufts) | spore (capsules) |
| `grass` | ribbon (blades from the baseline) | none | spore (heads of grains) |
| `botanical` | curve | broad | a bouquet: camellia, peony, lily, sweetpea or bud, one per plant by the seed |

The blooms: `daisy` a ring of petals opening one after another, an inner ring and a dotted heart; `rose` three rings of outlined petals opening from the heart out round a spiral; `tulip` a cup of three petals that splay a little; `bud` a closed petal between two sepals; `berry` three to six berries with a shine; `spore` a capsule with a cap, or a head of three to seven grains. The botanical blooms are filled and shaded, not outlined: each petal is a path in its own frame, painted with its flat role and then a gradient of alphas of one other role laid along it (the ink deepening it where it tucks under its neighbour, the canvas lighting its rim), with fine ink lines at a low alpha for edges and veins. `camellia` (the accent) seven to eight rings of round overlapping lobes drawn from the outside in, the inner rings a little higher, round a deep heart; `peony` (the surface) a cup: a flared ring of ruffled petals, a back wall of upright ruffled petals, a golden heart of stamens (accentInk, with accent flecks) and a front wall of petals over its lower half; `lily` (accentInk, warmed by the accent at its throat) six pointed, recurved tepals with a midrib, fine veins and spots, six stamens with dark anthers and a pistil; `sweetpea` a ruffled standard (the accent blended toward the canvas, lighter at its rim), two white wings and a keel (the surface) on a sage calyx. With botanical, a `bud` is a shaded closed bud (peony, camellia or sweet pea colours) between sage sepals, or a long lily bud (sage at its base, accentInk at its tip). Every random choice of a bloom is drawn from its own seed before the frame is read, so no petal moves between frames.

**The botanical bed** (`kind: botanical, bed: true`). The plants root below the frame's bottom edge and rise toward the headline: a back row of sweet pea climbers (thin sinuous stems with flowers on short pedicels up their top half and spiral tendrils), long-stemmed lily buds and lilies; one hero camellia, left of centre in a landscape frame and near the middle in a portrait one, about 0.46 of the frame's short side across; rows of peonies, lilies and buds (more rows in a tall frame); and a front row of large peonies and lilies cut by the frame's bottom edge. Every plant carries broad leaves on its stem (the camellia's large and spreading sideways from under its bloom). Every bloom stays under the headline's box, its top at least 3 % of the short side below it and below any other text near it; only the climbers' tendril tips reach up into the band of the last line's descenders, never above its baseline. Stems grow on the garden's ease-out from left to right and front to back, leaves open as the reveal passes them, blooms open once their stem is there; the loose petals leave a bloom of their own colour (coral, pink or gold) on an arc and land in the air above the bed, never by the text. The bed is drawn row by row, back to front, all of it under the type.

The leaves: `lance` narrow with a bowed midrib; `round` nearly as wide as long, on a short stalk; `heart` notched at its stalk with lobes reaching back past the notch; `frond` graded leaflets, longest just above the root.

**How a stem grows**
- A stem leaves its anchor between the anchor's outward normal and straight up (a seeded 30 to 70 % of the way to up; a downward anchor hangs its stem the other way) and is a chain of three to six cubic Bézier segments, each 72 to 90 % of the one before.
- Each segment turns 12 to 34 degrees; the turn changes side at seven joints in ten, so the line is a sinuous S. A segment's control points sit at a third and two thirds of its chord, moved to the outside of the bend, so every joint is smooth.
- At each joint after the first, a quarter of the time at density 1, an offshoot of one to three segments leaves 28 to 58 degrees off the stem, each on the other side from the one before. Offshoots do not branch.
- A stem stops where it would leave the safe area or reach another text block; a blossom that does not fit at its end opens smaller, then becomes a bud, and a stem cut short steps back along itself until its end fits. A letter's second and third plants reach a little higher than its first.
- A line under another (a wrapped headline) grows short sprigs of up to three segments into the gap under the line above; downward anchors hang short stems.
- The other stem types grow from the same chain with their own ranges: a `branch` twig turns 5 to 18 degrees with angular joints and puts out offshoots at about half its joints, which carry twigs of their own (coral's limbs are shorter and fork more often); a `root` hangs, forks twice and is pulled toward straight down; a `ribbon` stands up, pulled toward straight up, a grass blade short and arching one way, a kelp ribbon tall and sinuous. A grass clump fans three to five blades around straight up, the middle ones tallest. Moss cushions grow from the middle out.

## Style variables consumed
- `--mm-color-muted` (stems, leaves, roots, coral, kelp, grass, moss dots and tufts, traces, crystal stems; botanical stems, tendrils, sage leaves, calyces, filaments)
- `--mm-color-surface` (botanical: peony petals, sweet pea wings and keels, peony buds)
- `--mm-color-line` (botanical: the deep teal broad leaves)
- `--mm-color-accent` (petals, buds, berries, spore capsules and grains, pads, via rings, shard faces; botanical: camellias and their loose petals, sweet pea standards, lily throats and midribs, peony flecks)
- `--mm-color-accentInk` (petal creases, inner petal outlines, the blossom's heart, shard ridges; botanical: lilies, lily buds, the peony's golden heart)
- `--mm-color-canvas` (leaf veins, kelp midribs and via holes, read as cut-outs; at 55 % alpha, a berry's shine; at 42 % alpha over the accent, one side face of a shard)
- `--mm-color-ink` (at 34 % alpha over the accent, the other side face of a shard; botanical: at alphas in the petal and leaf gradients, the shaded half of a broad leaf, lily spots and anthers, and fine edges and veins at 13 to 24 %)
- `--mm-color-canvas` also lights the rims of botanical petals and leaves (at alphas in their gradients) and draws a broad leaf's veins (at 24 and 40 %)
- the slot's own face, size and tracking (the letters are read in the face they are set in)
- `motion.overshootMax` (the springs of the ornament)
- duration role `hold`

## Legibility and rest notes
- The type never moves, scales or recolours: the slot keeps its own text node, so its layout and shaping are exactly those of a plain entrance; only an opacity fade on a wrapper runs during the first 16 % (none with `text: present`).
- At p = 1 the garden is complete and still. Kelp waves only while it grows, the wave fading to nothing at its landing. With `sway: breathe` the ornament moves after landing by its height above the root; the letters and the roots stay put.
- Front-layer cover of glyph ink is capped by the plan at 5 % (crossings are sent behind, last first); the browser test measures it below 8 % on every kind, two brands and three formats. Blossoms, leaves, buds, pads and shards never sit over ink in the front layer.
- Ornament stays inside `--mm-safe` and off every other filled slot of the scene (their boxes plus 0.08 em).
- Ornament inside the slot's own box is held under 6 % of the box, so W-CONTRAST, which reads the pixels under the text, still sees mostly canvas there: leaves, shards, moss dots and tufts inside the box go first, then stems are cut back from the tip (to no less than 40 % of their length, with what grows beyond the cut), then whole plants without a blossom, then blossoms inside it become buds, then any plant. The dense organic kinds (all but vines, flowers, circuits and crystals) are held under 4.5 %, below the 5 % of the box W-CONTRAST's percentile reads. Grass blades count only where they lie off the ink, since behind a letter they are hidden while the text shows. On the demo, W-CONTRAST and G-LEGIBLE pass on paper, signal, linen and nocturne; the browser tests hold every organic kind under 6 % on six seeds.
- A slot that ends with nothing grown grows one plant of its first part set on its most upward anchor of the first line. A slot that grows a single plant or nothing is named in `mm.warnings` (`text/garden: <selector> grows …`).
- Every colour is a role or an sRGB blend of two roles, so G-BRAND's pixel half holds without masks. A botanical part is its flat role under a gradient of alphas of one other role at a time (where the overlay changes role, one side is fully transparent), so with a fine ink line over it a pixel is a blend of three roles at most; the demo film passes G-BRAND on a light brand in 16x9 and 9x16.
- A botanical bed lies wholly in the back layer, under the type, so its front-layer cover is 0. Its blooms stay under the headline's box; what reaches into the box (tendril tips in the descender band) is held by the same box budget, and the browser test measures the bed under 4.5 % of the box on two brands and two formats while covering more than 30 % of the frame under the headline. The bed is ornament, not text: it grows across the whole frame and is cut by the frame's bottom and side edges (the safe area bounds text, and the bed keeps off every other filled slot near the headline).
- At rest a bed is complete. With `drift: float` (the default) its loose petals keep floating within a small bound, a sine of the piece's time, the same at every seek; everything else is still. With `drift: settle` the whole rest is still. `exits/wither` reads the piece's time too, so a floating petal flies back into its bloom without a jump.
- Geometry is a pure function of the laid-out letters, the face and the params, seeded by `seed`, the letter's index and its character: the same in every render and at every seek order. The anchors are in em on each letter, so a reflow at another format roots the plants at the same places on the same letters.

## Provenance
- Type Garden, no licence: ideas only — plants growing from letterforms, weaving behind and in front; our own growth model. No code taken. Ours: the Bézier-chain stems and their offshoots, the stem forms and the part grammar (stems, leaves, blooms, presets and mix), the botanical blooms, broad leaves, loose petals and the bed composition, the spiral curls, the anchor finder on real glyph masks, the weave decided by the glyph distance field, the front-cover cap, the text box budget, the circuit and crystal kinds and every drawing.

## Known limits
- The letters are read one by one at 64 px per em; ligatures and contextual forms are read as their separate characters, so a plant can root a hair off a ligature's ink.
- A script face with connected letters reads as one stroke per letter; its stroke ends may be where the letters join.
- The plan is cached per layout; a seek that changes the slot's size (a layout responding to a later beat) grows a new arrangement for that layout.
- A very long line is pruned hard by the text box budget and may show only stems.
- Stems may cross one another; blossoms and leaves keep off each other's cores, so a dense garden layers its blossoms rather than adding more of them.
- Roots hang into the space under the line; a layout with a line close beneath the headline leaves them short (they stop 0.08 em from it).
- Moss and grass live inside the headline's own box (on its top edges, along its baseline), so the text box budget keeps them light there: moss cushions are small, and grass blades between the letters are cut back while a clump past the line's end grows full. They read best on a short line with open gaps.
- A frond carries many leaflets; on a long line the text box budget thins them inside the box first.
- Botanical is drawn for a light canvas: its colours are the brand's roles, so on a dark brand the peonies take the dark surface and on a brand whose accentInk is its canvas the lilies vanish into the ground; pick a brand whose accent and accentInk are two warm flower colours.
- A bed draws many parts (a 16x9 bed is about two thousand SVG paths at rest), so a seek of a bed scene is slower than other gardens; the export is a few times slower per frame.
- A bed under a headline set low in the frame has little room: its unit shrinks with the room under the text, down to 0.3 of the frame's short side, and its flowers with it. Set the headline high (a piece's CSS can lift a statement's headline to the top) for the full bed.
- With a bed, `stem`, `leaf`, `bloom`, `stemScale`, `bridges`, `lean` and `layer` do not apply; `density` widens or narrows the spacing of each row.
