# transitions/dissolve-edge

## Purpose
Dissolves the next scene in through a noise field whose moving edge burns in a palette role.

## Use when / Do not use when
**Narrative position:** topic change, reveal. **Mood:** organic, warm, tactile.

**Use when**
- a change of subject that wants texture rather than a slide
- a brand with a strong accent: the burning edge is where it shows
- a calm or medium style with a slow role of half a second or more

**Do not use when**
- a high-energy style where the slow role is under 0.3 s: the contours become a flash
- scenes of dense small type: for the middle of the cut each line is half one scene and half the other
- a piece whose accent is also its body text colour: the burn would lose against the type

## Params
| name | type | default | meaning |
|---|---|---|---|
| `glow` | enum(accent|ink|canvas|surface|muted|line|accentInk) | `accent` | the palette role the moving edge glows in |
| `width` | number | 0.08 | the glow band's width as a share of the field's range, 0.02 to 0.3: wider is a longer, softer burn |
| `scale` | number | 0.3 | the size of the field's features as a share of the frame's short side, 0.1 to 1: smaller is finer |
| `detail` | number | 3 | the octaves of the field, 1 to 5: 1 is smooth blobs, 5 a craggy edge |

Brand knobs: glow, width, scale, detail

Duration role: `slow`. Catalogue bands, in seconds: calm 1.0, medium 0.6, high 0.4. A motion style reaches them through the milliseconds it gives the role; the pattern holds no number of its own.

## Style variables consumed
- duration roles (via the module's `dur`)
- the palette role `glow` names (`--mm-color-accent` by default), read once per frame for the glow's flood

## Legibility and rest notes
The incoming section wears one SVG filter while 0 < p < 1: a seeded turbulence field (the seed comes from the scene's id, so the same cut is the same field in every render), a threshold that reveals the section wherever the field lies under a level that rises with the cut, and a band just outside that boundary, wider by `width`, filled with the role and fading outward. The level follows a curve measured on the field itself, so the share of the frame revealed is about the share of the cut gone. The outgoing scene stays whole underneath: every pixel shows one scene, except the two or three pixels of the reveal's own soft edge, which the glow covers. The glow kindles over the first tenth of the cut and dies over the last, and at p = 1 the filter and its overlay node are removed, so the incoming scene rests as itself, unfiltered. The filter is pure in p and the seed: nothing is carried between frames.

## Provenance
- pireel/pireel, 0xsline/OpenChatCut, AGPL-3.0: the idea of an organic dissolve with a glowing edge; no code, names or constants taken.

## Known limits
- for the middle of the cut text is cut through by the contours, so a line can read half one scene and half the other; keep the cut to the slow role or longer
- the field is stretched to the frame, so on a very tall format (9x16) its features are the same share of the short side and run longer along the long one
- a glow role close to the canvas role is invisible: pick one with contrast, `accent` or `ink`
- the filter flattens a 3D camera's depth on the incoming section for the length of the cut
