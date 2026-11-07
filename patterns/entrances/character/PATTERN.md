# entrances/character

## Purpose
Brings the brand's mascot into its slot with a hop (a crouch of anticipation, a short arc, a squashed landing) and keeps it alive at rest with an idle on the beat grid, while the kit reports it finished.

## Use when / Do not use when
**Use when**
- the brand has a mascot (`mascot` in its brand file) and a scene should introduce it or let it react to the headline beside it
- a film keeps a beat: the idle bounces, rocks or sways on the style's `sound.bpm`, so the character dances with the track
- a model sheet for sign-off: `sheet: all` draws every view in every mood at rest (the first thing a brand approves)
- any character the brand owns: a figure with ears, a tail, an antenna, a hat or wings (extra parts that swing), one with no legs that floats, one with no arms, an eyes-only face or a screen face; a brand with several characters names one with `who`. `mm brand mascot <file.svg> --brand <path>` imports a drawing from any vector tool

**Do not use when**
- the brand has no mascot and none is wanted: the rig then draws its plain default character, which belongs to no brand
- the character would hold the message: the mascot reacts to the headline; it never carries text
- more than two characters share a scene: the eye follows one actor at a time

## Params
| name | type | default | meaning |
|---|---|---|---|
| `mood` | enum(calm|happy|excited|sad|surprised|worried|sleepy|proud) | `calm` | the face, cheeks and idle it arrives with; a mood the brand does not allow is drawn as its first |
| `to` | enum(none|calm|happy|excited|sad|surprised|worried|sleepy|proud) | `none` | the mood `emphasis/act` changes it to, kept after the act; read only when the beat's emphasis is `emphasis/act` |
| `view` | enum(front|threeQuarter|side|back) | `front` | which drawn view; a view the brand did not draw is made from the front |
| `facing` | enum(right|left) | `right` | left mirrors the drawing |
| `look` | enum(center|left|right|up|down) | `center` | where the eyes look, added to the mood's own glance |
| `from` | enum(place|left|right) | `place` | place hops on the spot; left or right hops in from that side |
| `d` | number | 1 | how far a hop from the side travels, in widths of the character (0.2 to 3) |
| `idle` | number | 1 | how much the idle moves, 0 (still) to 1.5 |
| `bpm` | number | 0 | the beat grid the idle keeps; 0 reads the style's `sound.bpm` |
| `offset` | number | 0 | seconds of piece time where the beat grid starts (the first beat of the track) |
| `who` | string | (empty) | a character of the brand's cast by name (`mascot.cast`); empty draws the brand's main character |
| `sheet` | enum(off|moods|views|all) | `off` | a model sheet at rest instead of one character: the front view in every mood, every view in the beat's mood, or every view in every mood |

Duration role: `slow` (a beat's `params.dur` overrides it). The hop, on the entrance's linear progress: fade in crouched to 22 %, fly to 68 % (a parabola stretched at take-off and landing, rounded at the top), land squashed and ring down to exactly the rest pose at 100 %. The idle fades in over the 0.4 s after the landing.

## Style variables consumed
- `--mm-color-*` through the brand's `mascot.parts` (each part a role or an sRGB blend of two roles; defaults: body `accent`; shade the body's role with 28 % of the brand's darkest role, light with 35 % of its lightest, cheeks with 45 % of its lightest, so a dark brand is shaded as truly as a light one; outline, eyes and mouth `ink`; glint `surface`; shadow the darkest role at 22 %)
- `--mm-size-display` and `--mm-frame-h` (the stage's height: 2.6 display sizes, at most 30 % of the frame, so the character scales with the type). The stage yields to the text: in a grid row or a flex column it takes only the room the text leaves, and when a line of the scene still crosses the safe margin (glyphs hanging past a tight line-height) it gives up twice that much, read with `runtime/kit/room.js` from the layout alone
- `style.mascot` (views, face frame and its optional screen plate, limbs, extra parts, float, ground point, outline weight, allowed moods and faces, and the `cast` that `who` picks from) and `style.sound.bpm` (the idle's grid)
- extra parts and the plate take their colours from roles like every other part: an extra part defaults to the body's colour; a plate to the brand's darkest role, with the eyes and the mouth on it in the lightest
- duration role `slow`

## Legibility and rest notes
- At `p = 1` the character stands at its rest pose in its slot: no offset, no lean, no squash from the hop. The kit reports progress 1 from the end of the entrance, so G-REST reads the slot finished; the idle that follows is an acting layer drawn inside the slot's box, which never moves or resizes (W-AMBIENT measures camera moves and text scale, and sees neither).
- The drawing stays inside the slot: the rig's viewBox reserves headroom over the body for the liveliest idle (a hop of 3 u at `idle` 1.5), a pose that would reach higher gives up lift and then stretch, and the SVG and the slot clip to the slot's box. A brand drawing that reaches more than 20 % of its box past the box is refused (the front takes the rig's default figure, another view is made from the front).
- The idle is a closed form of the piece's time (`ctx.t`): each mood's squash accent peaks on a beat of the grid (sleepy on every second beat), so the same instant always draws the same pose, in either seek order (G-TIME, G-DETERMINISM). In a deck there is no idle and no blink: every rest is a still picture.
- Every painted part is a palette role or a blend of two roles, and its edges blend with the roles under it, so G-BRAND's pixel test passes by construction. The character carries no text: G-LEGIBLE, G-EDGE and G-OVERLAP have nothing to read in it, and since it never leaves its slot it never covers the text they read.
- Blinks (about every 3.4 s for 0.13 s) are phase-shifted by the slot's seed, so two characters never blink together.
- Extra parts swing about their anchors with follow-through: each turns so its tip trails where the anchor was 0.08 s earlier, plus a share of the change over 0.2 s that carries it past rest when the body stops, at most 40° times its `swing`. The earlier poses are the same closed forms evaluated at earlier instants, so the swing is pure in `t`, exactly 0 at rest and in a deck. An extra part that reaches outside the box is dropped (named in the rig's `issues`), and the headroom counts every part and the float, so nothing is cut.
- A floating character rests lifted by its `float` and bobs a quarter unit over two beats of the idle's grid; its shadow stays on the ground and shrinks as it rises.

## Provenance
- JohnHeibel/ClaudeAnimationBase, MIT: ideas restated in our own code in `runtime/kit/rig.js`: a character built from a unit and a ground point, one transform stack (offset, lean, squash about the feet), drawn key views with a face frame that shifts and narrows toward the heading, limbs with a layer, a hop with anticipation and a landing squash, a blink phase-shifted per character, and idles locked to the beat. One number is the source's own, adapted under its MIT licence: the excited idle's squash of 0.16 at the beat; the other timings and sizes are ours. Our squash keeps the area exactly (sy = 1 - s, sx = 1 / sy) and every colour is a brand role; no code or drawings taken, and the source's own character is not used.

## Known limits
- One character per slot (or one model sheet). Walk cycles and painted reaction marks are not drawn yet. A held prop is an extra part that swings about its own anchor; it does not follow the arm's angle.
- Limbs are straight strokes the rig poses (an arm's drawn bend or a hand shape is not kept); eyes and mouths are the rig's own shapes placed in the brand's face frame (a drawn eye's shape is not kept, only its place, size and colour); a body that should bend (a neck, a tail made of the body) bends only as a whole squash and lean.
- Extra parts are drawn in every view from the front's coordinates (narrowed in a made view) unless `views` limits them; turning a part with the body in a 3/4 or side view needs that view drawn.
- The rig clips to its slot, so a hop from the side enters at the slot's edge rather than from beyond it.
- When the text fills the frame the stage can shrink to a small character (a long headline in a large display face in 1x1); shorten the copy or move the character to its own scene.
- In the rare frame where a line still crosses the safe margin with the stage at its CSS size, the stage gives up that room when the character arrives, so the text above it settles a few pixels lower at that instant.
- A view the brand did not draw is made from the front: 3/4 narrows the silhouette, moves the face and shades the far limbs; side narrows it more, shows one eye and hides the far arm. A prismatic mascot looks better with its 3/4 view drawn (with a side `strip` and `seam`).
- The model sheet has no labels: name what it shows in the scene's headline.
