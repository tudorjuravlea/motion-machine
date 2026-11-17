# entrances/streamer

## Purpose
The element flies in along an arc, trailing a ribbon in a palette role that flutters behind it and catches up as it lands, so the arrival leaves a mark for a moment and nothing at rest.

## Use when / Do not use when
**Use when**
- a headline or an object should arrive with a flourish: a launch line, a title card, a name
- the brand's motion is lively and has a ribbon, a streamer or a swoosh in its language

**Do not use when**
- more than one streamer in a scene: two ribbons cross and the eye loses both
- a calm or premium brand whose type simply appears or rises
- the element starts near a frame edge on the side it flies from: its ribbon trails off frame (fly from `below` there)

## Params
| name | type | default | meaning |
|---|---|---|---|
| `from` | enum(below|left|right) | `below` | where the element flies in from; the ribbon trails from its edge on that side |
| `distance` | number | 3 | how far it flies, in multiples of the format base size (ctx.unit), before the style multiplier |
| `role` | enum(accent|ink|muted|line) | `accent` | the palette role of the ribbon |
| `width` | number | 0.9 | the ribbon's width at the element, in multiples of the base size; it tapers to a fifth of that at its free end |
| `wave` | number | 1 | how much the ribbon flutters, in multiples of the base size at its free end; the flutter dies out as the element lands (0 is a straight trail) |

## Style variables consumed
- `--mm-color-accent`, `--mm-color-ink`, `--mm-color-muted` or `--mm-color-line` (by `role`) for the ribbon
- `ctx.unit` and `style.motion.travel` for the flight and the ribbon's width and flutter
- duration role `hold`, the entrance's length

## Legibility and rest notes
- Faked from delayed copies of the main motion (`runtime/kit/trail.js`): point i of the ribbon is where the element's trailing edge was i·lag seconds ago (16 points, the tail 40 % of the entrance behind), plus a wave that travels down the ribbon and grows toward its free end. No simulation and no state: any instant draws alone, in any seek order.
- The element flies the first 60 % of the entrance along a quadratic arc, eased in and out, and stops in its place without passing it (type never overshoots); the ribbon's tail reaches it by the end, so at p = 1 nothing is written and a rest holds no ribbon.
- The ribbon lies behind the element's own content (the element is isolated and the ribbon sits under its text), in one palette role, so it never covers the words it carries; every pixel is the role, the ground, or a blend (G-BRAND).
- Reduced motion: the kit draws the finished element fading in, with no flight and no ribbon.

## Provenance
- original

## Known limits
- The ribbon trails from one edge of the element's box, not from a point a layout marks.
- Flying from `left` or `right`, an element at the frame's margin starts off frame and so does its ribbon; `below` keeps both in view.
- A flag on a pole or a hanging cable are the same delayed-copies trail with a fixed end; only this streamer is built.
