# ui/exchange

## Purpose
Shows one request and its answer between two nodes, then data still flowing: a send line with its badge, the right node confirming, a dashed reply line back, and a dotted stream line whose dots keep moving.

## Use when / Do not use when
Use when:
- the story is a call and a response between two named parts (a shop and its orders, an app and its service)
- the lines should each mean one thing: send, reply, stream

Do not use when:
- there are more than two nodes or more than one exchange
- the real product can be recorded (use a device with `screen/` actions)

## Params
| name | type | default | meaning |
|---|---|---|---|
| from | string | (empty) | the left node's label, which sends the request |
| to | string | (empty) | the right node's label, which confirms and answers |
| request | string | (empty) | the badge on the request line, a few words |
| reply | string | (empty) | the badge on the answer line, a few words |
| stream | string | (empty) | the small label under the stream line |
| surface | enum(flat|glass) | flat | flat: the surface role; glass: the brand's glass surface |

Brand knob: surface (`style.patterns["ui/exchange"] = { surface: "glass" }`).

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-color-line`, `--mm-color-accent`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- the style's `enter` and `move` easings

## Legibility and rest notes
At p = 1 both lines are whole with their heads, the right node is lit and the stream is whole with its dots standing still, so the rest works as the poster and under reduced motion. While the beat runs the stream's dots move along a route that stays put, their phase read from the clock alone, and only once the stream has started. Each line draws by being cut, so its dashes never stretch. Badges sit clear of the lines and their heads, and no line touches a node: each stops 0.3em short. The nodes sit left and right when both badges fit between them at the size they are given, and stacked, with vertical routes, when they do not.

## Provenance
Stageshow, MIT: the idea only (separate looks for a request, its answer and a live stream), written in our own code as a pure function of time. No code or art taken.

## Known limits
- The length is fixed at 5.75 s; the stream flows for 3 s after it starts.
- Two nodes and one exchange only; the stream always runs from the right node toward the left.
- Long badges push the nodes into the stacked layout; a badge that is wider than the card still overflows it.
- The arrowheads are drawn by the pattern itself, since the kit's own head cannot be read by a browser.
