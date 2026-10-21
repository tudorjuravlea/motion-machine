# The kit

The browser runtime that turns `t` into a picture (SPEC §2, §6, §10). `kit.js` mounts a story over
a style; `schedule.js` is the timeline algebra, shared with the gate and importable in Node. This
page is for whoever writes stories and patterns against it: what the kit reads, what each pattern
receives, where a story's params end up, and every function the kit modules export.

- [Mount and seek](#mount-and-seek) · [Composition](#composition) · [Story shorthands](#story-shorthands-the-kit-resolves) · [Markup grammar](#markup-grammar-spec-6)
- [What each pattern kind receives](#what-each-pattern-kind-receives) · [Units of travel](#units-of-travel) · [Param routing](#param-routing) · [Cascades](#cascades-data-each--paramseach)
- [Fragments](#fragments-patternhtml-for-text-data-and-devices) · [Assets](#assets) · [Overlays](#overlays) · [Sound cues](#sound-cues) · [Schedule output](#schedule-output) · [Warnings](#warnings)
- [Screen actions](#screen-actions) · [3D devices](#3d-devices)
- [Module reference](#module-reference): `kit.js` · `schedule.js` · `springs.js` · `ease.js` · `random.js` · `seeded.js` · `fit.js` · `count.js` · `room.js` · `rough.js` · `screen.js` · `device3d.js` · `synth.js`

## Mount and seek

```js
import { mount } from '../../runtime/kit/kit.js';
await mount({ story, style, patternsBase });   // patternsBase defaults to the repo's patterns/
```

`mount` builds one `<section data-scene>` per scene with a `.mm-camera` inside holding the layout's
`pattern.html`, fills the slots from the beats, loads fonts, pattern CSS and every beat asset, then
exposes `window.mm` (`seek`, `goto`, `next`, `prev`, `report`, `settle`, `schedule`, `warnings`, …).
`seek(t)` restores every managed element to its mounted state and paints the instant from `t`
alone: film `t` is seconds, deck `t` is a fractional press (an integer is a rest). The story object
you pass in is copied; the kit never changes it.

**What a seek restores.** A managed element is a scene, its camera, or a slot a beat fills. Before
every seek the kit puts back each managed element's inline `style`, and its markup: the full
`innerHTML` when it holds no other managed element, else its list of child nodes (anything a
pattern appended is removed). A pattern may therefore add nodes to its element freely; it never has
to clean up after itself.

Before anything else, `mount` passes the story through `resolveStory(story, style)` (exported by
`schedule.js`, which `schedule()` also calls), so the page and the gate read the same patterns.

## Composition

The brand half's `composition` reaches the page as three variables on `<html>`, which every layout
reads for its defaults:

| Variable | From | Value | Layouts use it for |
|---|---|---|---|
| `--mm-align` | `composition.align` | `start` (left) or `center` | `text-align`, and `align-items` / `justify-items` / `justify-content` of the stacked blocks |
| `--mm-headline-scale` | `composition.headlineScale` | 0.8 to 1.4 | a multiplier on every layout headline's size role |
| `--mm-density` | `composition.density` | 1 (airy) or 0.6 (compact) | a multiplier on the gaps between a layout's blocks and on its side indent |

A beat's `align` param (`data-p-align`, `left` or `center`) or `data-align` on the layout root
overrides `--mm-align` for that scene, either way. A brand with no `composition` block reads as
left, 1, airy.

**The hook is a step larger,** so the first frame carries the piece's largest headline. The kit
marks the first scene `data-hook` and raises `--mm-headline-scale` inside it by `HOOK_STEP` (1.25,
exported). Statement, title-stack and endcard set their headline as a lead (the display role times
0.8; 0.64 in 1x1), so a hook in statement or title-stack is the display role itself (0.8 of it in
1x1): the largest headline of the piece in every format. Content layouts (split, comparison,
bento-3, stat-hero, list-reveal, quote) set theirs at h1.

## Story shorthands the kit resolves

| Story says | Kit reads | Rule |
|---|---|---|
| `"fx": "style:headline"` (or `body`, `figure`, `plate`) | `style.entrances.<role>` | the motion style picks the entrance; an unknown role throws at mount |
| a scene with `"position": "topic"` (or `opening`, `related`, `climax`, `outro`) and no `cut` | `style.transitions.<position>` | an explicit `cut` wins over `position`; a scene needs one of the two (schema) |
| `"params": { "instant": true }` on a beat | an entrance of 0 s | the beat is finished from its `at`. A film's first frame shows the hook with a first-scene beat at `at: 0` and `instant: true`. An instant beat does not cascade |
| `"step": 0` on a deck beat | press = the scene's first rest, 0 s | present at rest 0 (first scene) or already there as a later scene cuts in; its `at` is ignored and it cannot carry an emphasis |

## Markup grammar (SPEC §6)

| Attribute | Written by | Means |
|---|---|---|
| `data-slot` | layout | a place a beat fills |
| `data-fx`, `data-at`, `data-step`, `data-until`, `data-out`, `data-exit`, `data-emphasis` | kit, from the beat | the beat's patterns (resolved: never `style:<role>`) and timing; `data-step="0"` is a beat present at the scene's first rest |
| `data-p-*` | kit, from the beat | the beat's scalar params (camelCase to kebab), for CSS or for reading back |
| `data-value`, `data-fact`, `data-asset` | kit, from the beat | the beat's number, fact id, asset path |
| `data-each` · `data-stagger` | layout, or the kit for `params.each` | children arrive in turn; the kit rewrites `data-stagger` to the spacing it used (after the cap) |
| `data-part` | kit | a nested `data-slot` of an instantiated `pattern.html` (renamed, so no slot selector lands inside a fragment) |
| `data-empty` | kit | a layout slot no beat filled (hidden) |
| `data-keep` · `data-over` · `data-bleed` · `data-micro` | layout | audited at rest · overlap intended · may cross the edge · micro floor |
| `data-mm-overlay` | pattern | a node a transition added outside its scenes; the kit removes it on every seek |
| `data-mm-own` | kit | a layer the kit draws itself (a device screen layer); a seek leaves its pictures in place |
| `data-hook` | kit | on the first scene's `<section>`: the hook, whose headline is one step larger |

`data-fx` written directly in layout markup is still not read: every arrival comes from a beat.

## What each pattern kind receives

Every visual pattern is `at(el, p, ctx)`. `p` is eased progress, 0 to 1. A spring entrance can pass 1,
except on a **type layer** (a beat with `text` or `value`, or a `text/` or `data/` pattern), whose
`p` is clamped at 1: type never overshoots (SPEC §15), and `report()` gives it overshoot 0.
At a rest every arrived element gets `p = 1` exactly: local time is compared to `d` with a 1e-9
tolerance. Screen actions (`screen/`) export `reduce` instead; see [Screen actions](#screen-actions).

| Kind | `el` | `p` | `ctx` beyond the common fields | `ctx.params` |
|---|---|---|---|---|
| entrance (`entrances/`, `text/`, `data/`, `devices/`, `3d/`) | the beat's slot | the entrance spring or the `enter` ease | `u`, `d`, `scene` | defaults ∪ the beat's scalar `params` |
| exit | the slot | `exit` ease over `exitRatio` × one entrance | `d`, `scene` | defaults ∪ `params.exit` if the beat gives one, else the same scalar params |
| emphasis | the slot | `move` ease over the role `slow` (or the module's `dur`) | `u`, `d`, `scene` | defaults ∪ `params.emphasis` if given, else the same scalar params |
| transition | the incoming `<section>` | `move` ease over the cut's duration | `from`, `to`, `u`, `d`, `scene`, `policy` (= `style.transitions.policy`) | defaults ∪ the scene's `cutParams` |
| move, film | the scene's `.mm-camera` | `move` ease of seconds through the scene | `u`, `d`, `scene`, `settle` | defaults ∪ the scene's `moveParams` |
| move, deck | the scene's `.mm-camera` | `move` ease of the press position through the scene's presses | `presses`, `scene` | defaults ∪ the scene's `moveParams` |

Meanings of the per-kind fields:

- `ctx.u`: seconds since the item started (an emphasis: since the emphasis started; a move: since
  the scene started). In a deck, `u` of an item whose press has passed is `Infinity`, so
  `ctx.spring(ctx.u, …)` is 1 (a settled spring) there.
- `ctx.d`: the item's duration in seconds (an entrance, exit, emphasis or cut; a move: the scene).
- `ctx.scene`: the scene id.
- `ctx.settle` (film moves): seconds from the scene's start to its rest, or the whole scene when it
  has none. `end: "settle"` on a move ends it there and holds the end pose.
- `ctx.presses` (deck moves): how many presses the scene lasts.
- `ctx.from`, `ctx.to` (transitions): the outgoing and incoming `<section>`.
- `ctx.policy` (transitions): `style.transitions.policy` (`owns-exit` or `velocity-matched`). Only
  `transitions/crossfade` reads it: under `owns-exit` (the default) two text scenes fade one out and
  then the other in; under `velocity-matched` they dissolve together. No other transition changes with it.

Common fields, on every call:

- `ctx.style`: the composed style.
- `ctx.format`: `9x16`, `4x5`, `1x1` or `16x9`.
- `ctx.unit`: SPEC §12: 168, 160, 152, 136 (a 16x9 deck 128): the format's base type size in px.
  See [Units of travel](#units-of-travel) for when to use it.
- `ctx.deck`: `true` in a deck, where the seek position is a press and every rest is a still picture.
- `ctx.random`: `random(seed)` seeded from the element's selector.
- `ctx.boil(n = 3)`: which of n shiver frames shows now, from the piece's time, the same for
  every stroke: style `motion.boil` seconds a frame (0.4 by default, 0 = still); a deck is always 0.
  Draw pen strokes with `rough.js` (`stroke(shape, { seed, roughness, boil, frame: ctx.boil(), pen })`).
- `ctx.spring(t, role)`: the style's spring `role` (`ui`, `type`, `heavy`, …, or `{k, c, m}`) at
  `t` **seconds**. Seconds first, role second, matching the kit's exported `spring(t, params)`. To
  drive it from your own progress, map it onto the settle time: `ctx.spring(x * ctx.spring.settle('type'), 'type')`.
  Also `ctx.spring.settle(role)`, `ctx.spring.overshoot(role, t)`, `ctx.spring.params(role)`.
- `ctx.ease(name, p)`: the style's named easing (`enter`, `exit`, `move`, …).
- `ctx.afterSettle(fn)`: runs `fn` after this seek's picture decodes are done, inside `settle()`
  (what a 3D render uses to copy a screen into a texture). What `fn` returns, if a promise, is awaited.
- `ctx.seeded(fn)`: runs `fn` with `Math.random` replaced by a generator seeded from the element's
  selector, for a vendored library that names its objects with it. See `seeded.js`.

Timing fields on the module: `dur` (a duration role, or seconds) or `spring` (a spring
role); a beat's `params.dur` / `params.spring` wins over them, which win over role `standard`. A
transition with `dur: 0` is a hard cut.

A module may also export `afterItems: true` (a move that sets its slots' own styles; it then runs
after the entrances of a film seek) and `fragment: true` (see Fragments).

## Units of travel

A distance a pattern moves something by states its unit in the param's `meaning`, and every
distance is multiplied by `style.motion.travel` (the style's overall amount of movement).

- **px**: a pixel of the page. Every format is 1080 px on its short side (9x16 is 1080×1920, 1x1
  1080×1080, 4x5 1080×1350, 16x9 1920×1080), so a distance in px is the same share of the short
  side in every format. Small nudges and blur radii are in px: `entrances/rise` (`d: 40`),
  `exits/push-out`, `moves/pan`, `devices/phone`, the blur patterns.
- **multiple of `ctx.unit`**: scales with the type. A travel that should read as a fraction of the
  type size is a multiple of the format's base size: `entrances/drop` (`d: 0.75`), `entrances/slam`.

Pick the unit by what the movement is relative to: a nudge that frames a small element is px; a
fall or throw that has to clear a headline is a multiple of `ctx.unit`. Write the unit in
`meaning`, as the shipped cards do. `--mm-travel` is a unitless multiplier, never a distance.

`room.js` bounds a travel by the room the layout leaves, so no unit choice can push type across
the safe margin.

## Param routing

```jsonc
{ "id": "proof", "cut": "transitions/wipe", "cutParams": { "direction": "up" },
  "move": "moves/pan", "moveParams": { "dir": "right" },
  "beats": [
    { "slot": "headline", "fx": "entrances/rise", "params": { "d": 56, "exit": { "side": "right" } },
      "out": 3.2, "exit": "exits/push-out", "emphasis": "emphasis/indicate" }
  ] }
```

- `rise` gets `{ d: 56 }`; `push-out` gets `{ side: "right" }` (its own bag replaces the shared one);
  `indicate` gets `{ d: 56 }` (no `params.emphasis`, so the shared scalar params).
- `wipe` gets `{ direction: "up" }` and `ctx.policy`; `pan` gets `{ dir: "right" }`.
- Sub-bags (`params.exit`, `params.emphasis`) are never written as `data-p-*`.
- Values are strings, numbers or booleans (story schema); a series travels as a string
  (`"values": "3,5,8"`).

## Cascades: `data-each` / `params.each`

A beat with `params.each: true`, or a beat whose layout slot carries `data-each`, arrives child by
child with its entrance pattern:

- Children: the slot's element children. A beat with text and no fragment is split on
  `params.sep` (default `|`) into one `<span class="mm-each">` per part.
- Spacing: `params.stagger` (seconds, finite and at least 0; anything else falls back to the
  style's spacing with a warning), else the slot's `data-stagger`, else `style.motion.stagger.eachS`;
  the spread of starts is capped at `stagger.capS` (the spacing shrinks). `stagger()` in
  `schedule.js` does the arithmetic.
- The schedule lists one `arrive` event per child (`<slot selector> > :nth-child(k)`); the beat's
  item is the parent, lasts the whole cascade, and owns the exit and the emphasis. Departures
  never stagger: the exit runs once on the parent, `exitRatio` × one child's entrance.
- `report()` audits the parent; children are not separate elements.
- Without the DOM (the gate in Node), a cascade's child count comes from its text parts; the kit
  passes counted children through `schedule(story, style, { each: { [selector]: { n, stagger } } })`.

## Fragments: `pattern.html` for text, data and devices

A text, data or device module that exports `fragment: true` gets its `pattern.html` instantiated
into the slot at mount, before `at` is ever called, and restored before every seek:

- A nested `data-slot="text"` takes the beat's text; `value` its value; `asset` its asset
  (`data-asset`, and `src` on an `<img>`/`<video>`); a nested slot named after a param takes that
  param's value; the beat's text otherwise goes to the first nested slot nothing claimed.
- Nested slots are renamed `data-part` after filling. Query them as `[data-part="screen"]`.
- `at()` then only animates: find the root with `el.querySelector(':scope > …')`.
- `pattern.html` is the only copy of the markup; a missing file is a warning at mount.

Modules without `fragment: true` keep building their own markup in `at()` from the slot's text
(the slot is restored before every seek, so rebuilding is safe). `devices/phone`, `browser` and
`laptop` use the fragment path (so a beat's asset is on the screen and decoded before the first
seek); the other shipped text, data and device patterns still build their own.

## Assets

A beat's `asset` (a path under the piece's `assets/`) lands on the slot as `data-asset`; every
`<img>` or `<video>` in the slot (or the slot itself) without a `src` gets it as a relative `src`,
so it resolves against the piece's page. Mount waits until each picture decodes (a video until
`loadeddata`) so the first frame is deterministic; one that fails is a warning. A picture a seek
asks for later (a frame of a recording, a page tile) that fails to decode is named in
`window.mm.warnings`, once per file. Once it has decoded, the slot gets the picture's proportions
as `--mm-asset-ratio` (width / height, four decimals), before the mount snapshot, so a layout can
frame a picture at its own shape (`layouts/media`).

Where a picture goes: `layouts/media` (its `image` slot), the screen of `devices/phone`,
`browser` and `laptop` (a nested `data-slot="asset"` `<img>`), and each `layouts/bento-3` tile. Each
is an `<img data-media>` leaf, so the gate's pixel rules mask it. A slot that holds a picture and
text keeps its text in a `[data-text]` child: the kit writes a beat's `text` there instead of over
the slot (a bento tile's label). `moves/push-in`, `ken-burns` and `pan` with `moveParams:
{ "target": "media" }` move the pictures inside their frames instead of the camera.

## Overlays

A transition that needs a node outside its two sections marks it `data-mm-overlay`; the kit removes
every such node at the start of every seek, and the transition draws it again if the new instant is
inside the cut. Custom properties a transition writes on a section (`--mm-tx-*`) go with the
section's inline style, which every seek restores. No overlay or veil can outlive its frame.

## Sound cues

A beat's `cue: "riser"` makes the kit read `sound/riser/pattern.js` (from the same patterns base)
for two fields: `durationS` and `anchor`. A cue is placed on its beat's arrival (`t` = the beat's
start), unless the module says `anchor: "end"`: then it ends on the beat's **landing** (the
arrival plus its entrance; a cascade's last child) and starts `durationS` before it, never before
0. The cue event carries `d` (= `durationS`, 0 if unknown) and `anchor`. A cue whose
module cannot be read is placed on the arrival, with a `cue <name>: … could not be read` warning
(not a G-PATTERN-REF one: the story names a cue, not a pattern). A sound pattern exports
`render(ctx, at, feel, opts)`, which draws into a Web Audio context with the voices of `synth.js`.

## Schedule output

`schedule(story, style, { patterns, each })` returns, and `window.mm.schedule` is:

- film: `{ kind, duration, scenes, events, rests, holds, items, timeline, warnings }`;
- deck: `{ kind, presses, pressLengths, scenes, events, rests, items, timeline, warnings }`;
- `scenes[]`: `{ id, start, end, cut: { pattern, d }, position, move }` (`position` and `move` are
  `null` when the story gives none; `cut.pattern` is resolved);
- `events[]`: `cut`, `move` (camera moves, emphasis and screen actions), `arrive` (one per cascade
  child), `depart`, `cue`; film events carry `t` and `d` in seconds; deck events carry `press`, `at`
  and `d` in seconds within the press, and `from`/`to` as press positions;
- `holds[]` (film): `{ scene, from, to }`, one per rest.

Rules that live here and nowhere else in code:

- **A film scene's rest** is the instant its cut, every arrival and every emphasis in it have
  ended; an exit does not move it. The scene has a rest only if that instant is before the
  scene's end (the last scene: at or before). Its hold runs from the rest to the scene's end.
- **A deck** has a rest at every integer 0 to `presses`. A press lasts as long as the longest thing
  it plays (cut, arrival, emphasis, exit); a press that plays nothing lasts 0 s (under a
  camera move it jumps). Rest 0 never animates.
- **Times are whole milliseconds**: every `t`, `d`, `start`, `end`, rest, hold, `at` and
  press length is rounded to 0.001 s, a spring's settle time included, so a film's `duration` is
  exactly the sum of its scene durations.
- **Frame hold** (`motion.frameHold` 2) steps an element's local time every 2/30 s whatever the
  export frame rate; `report().progress` is the progress of the step that is drawn. Cuts and camera
  moves stay smooth.

## Warnings

`window.mm.warnings` is a list of strings. The kinds that matter to a story author:

- `pattern <ref> did not load: …`: an unknown or broken pattern (G-PATTERN-REF reads this text).
- `unknown slot: layout <ref> has no slot "<name>"; appended one`: the story names a slot the
  layout does not provide.
- `screen: <file> did not decode`: a picture a seek asked for failed to decode (once per file).
- `<selector>: params.stagger … is not a number of seconds >= 0`: a cascade fell back to the style's spacing.

## Screen actions

A beat's `screen` list animates what a device shows (`devices/phone`, `browser`, `laptop`, and the
`3d/` devices). The screen's state at `t` is a **fold** over the actions in start order: each is a
pattern in `patterns/screen/` and every action continues from wherever the earlier ones left the
screen, in any seek order.

A `screen/` module exports:

| Export | Required | Meaning |
|---|---|---|
| `name`, `group: 'screen'`, `params`, `dur` | yes | as every pattern; `dur` is a duration role or seconds |
| `reduce(state, p, ctx)` | yes | returns the next screen state at the action's own progress `p` (0 to 1); pure, and returns `state` unchanged for an action that only draws |
| `draw(el, p, ctx)` | no | draws the action's overlay in `el` while it is under way (0 < p < 1; a deck rest also draws an action that `holds`) |
| `paint(screenEl, state, ctx)` | no | draws state that outlives its action, on every seek (an open island) |
| `outside: true` | no | `draw` is given a fresh overlay beside the screen, in the device's slot, instead of one over it |
| `holds: true` | no | in a deck, the finished drawing stays at the rest its press ends on |
| `holdsBefore: true` | no | before it starts the action shows its `p = 0` state (a recording waits on its first frame) |

The screen **state** is `{ content, frameTime, scrollY, zoom: {x, y, s}, swapping, compare? }`:
`content` is `{ kind: 'still' | 'sequence' | 'page', base, meta }` (`meta` is the folder's
`media.json`), `frameTime` seconds into a sequence, `scrollY` css px into a page, `zoom` a push-in
about a point (fractions of the screen).

`ctx` in `reduce`, `draw` and `paint`: the common fields above, plus

| Field | Meaning |
|---|---|
| `ctx.params` | defaults ∪ the action's `params` |
| `ctx.d` | the action's length in seconds (a deck: the press length) |
| `ctx.box` | the screen's `{ w, h }` in px |
| `ctx.locate(state, target)` | where a mark label or `"x%,y%"` sits on the screen, as `{ x, y }` fractions, under the state's scroll and zoom |
| `ctx.metaOf(asset)` | the `media.json` of a swap target, or `null` |
| `ctx.kindOf(asset)` | `'still'`, `'sequence'` or `'page'` for a swap target |
| `ctx.islandRest` | the phone island's resting size as fractions of the screen `{ w, h }`, or `null` |
| `ctx.state` (`draw` only) | the folded state of this seek |
| `ctx.at(target)` (`draw` only) | `locate` of the folded state: where to draw, as fractions of the screen |
| `ctx.host()`, `ctx.toHost({x, y})` (`outside` only) | the overlay's size and the screen's rectangle in it; a screen fraction to overlay px |

## 3D devices

`3d/phone` and `3d/laptop` render with Three.js (vendored, `runtime/vendor/three/`) into a canvas
that overlays the slot. `device3d.js` holds what they share (see its table). The rules a 3D device
follows:

- **The render happens after the decodes.** `at()` poses the scene and calls
  `draw(c, holder, ctx)`, which registers the render with `ctx.afterSettle`; the picture is copied
  from a hidden 2D screen (`pattern.html`, driven by the screen fold) into a texture, so a seek
  stays synchronous and `settle()` resolves once the texture is current.
- **Names are seeded.** `draw` runs inside `ctx.seeded(…)`, because Three.js names programs and
  objects with `Math.random` on a first render.
- **A pose is a pure function** of `p` (the entrance) and `u` (seconds since the beat arrived):
  `turn(move, q, u, ctx)` and `cross(q, u, prm, ctx)`. A deck rest faces the viewer.
- **Readouts for tests and the gate:** `mark(c, ry, extra)` writes the turn, which face shows and the
  cutout built as `data-*` on the canvas.

## Module reference

Every export of every module in `runtime/kit/`. Pattern files import from these paths directly
(`../../../runtime/kit/count.js`); `kit.js` also re-exports `spring`, `track`, `ease`, `random`,
`fit` and `count`.

### `kit.js`: mount, seek, report

| Name | Signature | Returns | Note |
|---|---|---|---|
| `mount` | `async mount({ story, style, root = document.body, patternsBase })` | `window.mm` | builds the page and paints the initial instant; on failure sets `window.mm = { ready: false, error }` and rethrows |
| `seek` | `seek(t)` | nothing | restores every managed element, paints `t` (film seconds; deck fractional press); synchronous |
| `goto` | `goto(n)` | nothing | a deck: lands on press `n` (rounded, clamped); a film: `seek(n)` |
| `next`, `prev` | `next()` · `prev()` | nothing | a deck's press forward and back; `next` fires a cancelable `mm:press` event `{ from, to }` first, so a live host may animate the press itself |
| `settle` | `async settle()` | `Promise<void>` | resolves once every decode the last seek asked for is done and every `afterSettle` callback has run |
| `trackDecode` | `trackDecode(promise)` | the tracked promise | registers a decode `settle()` waits for; a rejection is swallowed |
| `afterSettle` | `afterSettle(fn)` | nothing | runs `fn` inside `settle()`, after the decodes; a promise it returns is awaited. Callbacks not yet run are dropped at the start of the next seek |
| `report` | `report()` | `{ t, format, elements }` | per top-level item: `{ selector, progress, box: {x,y,w,h}, fontPx, color, bg, overshoot, scene, visible }`; what the gate measures |
| `scene` | `scene(id)` | `HTMLElement \| null` | a scene's `<section>` |
| `format` | `format()` | `string` | the mounted format (`9x16`, `4x5`, `1x1`, `16x9`) |
| `composition` | `composition(style)` | `{ align, headlineScale, density, accentText }` | the brand's composition over the defaults (left, 1, airy, true) |
| `FORMATS` | `{ '9x16': { w, h, base, safe }, … }` | object | SPEC §12: viewport, base size (`ctx.unit`), safe margin in px, per film format |
| `formatSpec` | `formatSpec(kind, format)` | `{ w, h, base, safe }` | `FORMATS[format]`, except a 16x9 deck (base 128); throws on an unknown format |
| `HOOK_STEP` | `1.25` | number | the factor by which the first scene's headline is larger |
| `spring`, `track`, `ease`, `random`, `fit`, `count` | | | re-exports of the modules below |

### `schedule.js`: the timeline algebra and `schedule()`

Pure; imports in Node and in the page. A node is `{ d, f(u) }`: a duration and a function of local time.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `clip` | `clip(d, f = (u) => u)` | node | `f` of time clamped to `[0, d]` |
| `seq` | `seq(...nodes)` | node + `starts` | nodes one after another |
| `par` | `par(...nodes)` | node | all at once; lasts as long as the longest |
| `delay` | `delay(x, node)` | node | starts `x` seconds late |
| `stagger` | `stagger(each, items, { from, index, ease, cap })` | node + `offsets` | children in turn; `from`: `first`, `center`, `last` or `index`; `cap` bounds the whole spread |
| `overlap` | `overlap(a, b, o)` | node + `starts` | `b` starts `o` seconds before `a` ends |
| `transition` | `transition(a, b, pattern, d)` | node | an overlap by `d` whose `f` gives `{ a, b, pattern, p }`, `p` running 0 to 1 across the overlap |
| `schedule` | `schedule(story, style, { patterns, each })` | the schedule (see Schedule output) | `patterns` maps a ref to its module or metadata (`dur`, `spring`, `durationS`, `anchor`); `each` supplies a cascade's child count in Node |
| `selectorOf` | `selectorOf(scene, slot)` | string | `[data-scene="…"] [data-slot="…"]` |
| `forFormat` | `forFormat(story, format)` | story | the story as that format draws it (scene `variants` applied); the input is not changed |
| `resolveStory` | `resolveStory(story, style)` | story | resolves `style:<role>` and `position`; a new story, refs that are patterns pass through |
| `entranceTiming` | `entranceTiming(beat, style, meta = {}, instant = false)` | `{ d, spring, role }` | a beat's `params.spring` / `params.dur`, else the pattern's, else role `standard`; `instant` is 0 s |
| `eachParts` | `eachParts(text, sep = '\|')` | `string[]` | the parts a cascade's text splits into |
| `cutSeconds` | `cutSeconds(ref, style, meta = {})` | seconds | a cut's length; 0 for a hard cut |
| `addImplicitPlays` | `addImplicitPlays(story, metaOf)` | the same story, changed | writes a `screen/play` for a beat whose asset is a frame sequence and that has none, and fills a play's missing length; **mutates** (the kit calls it on its own copy) |
| `screenIssues` | `screenIssues(story, metaOf, style = null, patterns = {})` | `{ fail, warn }` | the static screen checks the kit and the gate share |

### `springs.js`: closed-form springs

Pure; never integrated. A spring is `{ k, c, m }` or `{ bounce, period }`.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `spring` | `spring(t, params)` | 0 → 1 (may pass 1) | position at `t` seconds; 0 for `t <= 0`, exactly 1 for `t = Infinity` |
| `spring.settle` | `spring.settle(params)` | seconds | first time after which it stays within 0.005 of 1 |
| `spring.overshoot` | `spring.overshoot(params, t = Infinity)` | number ≥ 0 | largest value above 1 up to `t`, analytically |
| `track` | `track(t, keys, params)` | number | stacked springs over `[[time, value], …]`: the first value plus one spring per change |
| `fromReactSpring` | `fromReactSpring({ tension, friction, mass })` | `{ k, c, m }` | react-spring's parameters are the same numbers (defaults 170, 26, 1) |

### `ease.js`: easing curves

| Name | Signature | Returns | Note |
|---|---|---|---|
| `ease` | `ease(name, p, style)` | number | `name` is a style role (`enter`, `exit`, `move`, resolved through `style.motion.easings`) or a CSS easing (`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `cubic-bezier(a, b, c, d)`) |
| `ease.overshoot` | `ease.overshoot(name, p, style)` | number ≥ 0 | largest eased value above 1 over `[0, p]` |
| `parseEasing` | `parseEasing(str)` | `f(p)` | a cached easing function with `f.maxUpTo(p)`; throws on an unknown easing |
| `cubicBezier` | `cubicBezier(x1, y1, x2, y2)` | `f(p)` | the curve itself, with `f.maxUpTo(p)` |

### `random.js`: seeded randomness

| Name | Signature | Returns | Note |
|---|---|---|---|
| `random` | `random(seed = 0)` | `next()` → float in `[0, 1)` | `seed` is a number or a string; the same seed gives the same sequence everywhere |
| `hash` | `hash(string)` | 32-bit unsigned int | FNV-1a, to seed from a selector or a name |

### `seeded.js`: seeded windows

The one place in the kit that replaces `Math.random`, and only while a vendored library needs it.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `seeded` | `seeded(seed, fn)` | what `fn` returns | runs `fn` with a seeded random; the real one is restored when the last window closes |
| `seededImport` | `async seededImport(href)` | the module | imports a module (and what it imports) inside a window; overlapping imports share the latest generator |

### `fit.js`: fit a headline to a width

| Name | Signature | Returns | Note |
|---|---|---|---|
| `fit` | `fit(el, targetPx = el.clientWidth, { max, min, line })` | font size in px | sets `font-size` so the widest explicit line is `targetPx` wide, clamped to `[min, max]`; `line` sets a unitless line-height. Call after `document.fonts.ready` |

### `count.js`: counted figures

| Name | Signature | Returns | Note |
|---|---|---|---|
| `count` | `count(el, from, to, p, { pad, fix, prefix, suffix, hold })` | the text written | writes the number at progress `p` (clamped to 0..1) with tabular digits; `hold: true` keeps the prefix and suffix in place but invisible until `p = 1` |
| `formatNumber` | `formatNumber(v, { pad, fix, prefix, suffix })` | string | the number as written: zero-padded integer digits, `fix` decimals, no thousands separator |

### `room.js`: how far type may scale or move

Reads layout offsets, so no transform feeds back and a bound is the same at every instant. Every
function returns `null` without a laid-out DOM; the caller then applies no bound.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `boxOf` | `boxOf(el)` | `{ x0, y0, x1, y1 } \| null` | the layout box in frame px |
| `inkOf` | `inkOf(el)` | `{ x0, y0, x1, y1 } \| null` | the extent of the element's text, untransformed; its box when it has no text |
| `safeArea` | `safeArea(el)` | `{ x0, y0, x1, y1 } \| null` | the frame inset by `--mm-safe` |
| `pivotOf` | `pivotOf(el, origin = 'center')` | `{ x, y } \| null` | the point a `transform-origin` keyword (`left center`, `right center`, `center`) names on the box |
| `maxScale` | `maxScale(el, origin = 'center')` | number ≥ 1, `Infinity` or `null` | the largest scale about the pivot that keeps the text inside the safe area (punch and slam cap their start scale with it) |
| `roomAbove` | `roomAbove(el)` | px ≥ 0 or `null` | free room above the element, down from the lowest thing above it or the safe margin (drop caps its fall with it) |

### `rough.js`: the pen stroke

Pure: no DOM, no clock; the same arguments give the same path in Node and in the page.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `shapeOf` | `shapeOf(kind, { x, y, w, h }, r = 0)` | shape | `kind`: `box`, `pill`, `circle` (the inscribed ellipse) or `line` (along the bottom) |
| `lerpBox` | `lerpBox(a, b, t)` | `{ x, y, w, h, r }` | linear between two boxes; exactly `a` at `t <= 0`, `b` at `t >= 1` |
| `planOf` | `planOf(shape, step = STEP)` | number[] | how many samples each run of the outline gets; keep the first box's plan through a morph |
| `sample` | `sample(shape, plan = planOf(shape))` | `[x, y][]` | the shape's points under a plan |
| `jitter` | `jitter(points, next, amp)` | `[x, y][]` | each point moved by up to `amp` px on each axis, two draws per point from `next` |
| `pathOf` | `pathOf(points, closed)` | SVG path `d` | smoothed through the midpoints |
| `stroke` | `stroke(shape, { seed, roughness, boil, frame, pen, plan })` | SVG path `d` | two passes, the second wilder; `boil` is the shiver in pen half-widths and `frame` which of its frames; `roughness` 0 lies exactly on the shape |
| `boilFrame` | `boilFrame(t, { period = BOIL_PERIOD, n = 3, deck = false })` | frame index | which shiver frame shows at `t`; always 0 in a deck or when `period` is 0 |
| `STEP` | 8 | px | sample spacing at a pen of 2 px |
| `BOIL_PERIOD` | 0.4 | seconds | how long a boil frame holds |
| `INK` | `{ straight, handover, lift }` | fractions | the inking contract between `entrances/sketch` and `transitions/sketch-to-ink`: the part of the cut each stage owns |

### `screen.js`: the screen fold

The pure half runs in Node; the DOM half draws one layer the kit owns. See [Screen actions](#screen-actions).

| Name | Signature | Returns | Note |
|---|---|---|---|
| `initialState` | `initialState(asset, meta)` | state | the content a beat's asset names: a still, a frame sequence or a captured page |
| `fold` | `fold(initial, timed, t, ctxOf)` | `{ state, active }` | folds the actions started by `t` over the initial state; `active` lists those still under way, each with its `p` |
| `frameIndex` | `frameIndex(state)` | 1-based frame | the sequence frame at `state.frameTime`, held at the first and last |
| `overlayY` | `overlayY(overlay, scrollY)` | css px | where a captured page's fixed or sticky overlay sits at a scroll |
| `view` | `view(zoom)` | `{ x, y, s }` | the zoom as drawn, its centre clamped to keep the view inside the screen |
| `locate` | `locate(state, target, box)` | `{ x, y }` | where a mark label or `"x%,y%"` sits on the screen, as fractions, under the state's scroll and zoom |
| `mountLayer` | `mountLayer(screenEl, initial, swaps, actions)` | the layer element | builds the layer (`data-mm-own`) inside the screen: the content, one per swap target, one overlay per action |
| `paint` | `paint(layer, state, { track, box, swaps, warn })` | nothing | draws the content, scrolled, at its frame and zoomed; `track` registers decodes, `warn(src)` names one that failed |

### `device3d.js`: what the 3D devices share

Imported by `3d/phone` and `3d/laptop`. Materials are standard (physical ones take seconds longer
to compile in software).

| Name | Signature | Returns | Note |
|---|---|---|---|
| `THREE` | | the namespace | the vendored Three.js, re-exported so a pattern imports one thing |
| `clamp01`, `smoothstep01` | `(x)` | number | clamp to 0..1; smoothstep of the clamped value |
| `SHOWCASE` | 3.2 | seconds | how long the showcase half-turn takes |
| `cssText`, `cssColour` | `(el, '--var')` | string; `THREE.Color` | a CSS variable's resolved colour, any syntax the browser knows |
| `stage` | `stage(el)` | `{ renderer, canvas, scene, env, floor, key, glow, camera, tex, tex2d }` | renderer, room light for reflections, key and rim lights, floor shadow and glow |
| `rrect` | `rrect(w, h, r)` | `THREE.Shape` | a rounded rectangle centred on the origin |
| `lightAll` | `lightAll(c)` | nothing | gives every material the studio as its own envMap |
| `slab` | `slab(w, h, d, r, b, mats)` | mesh | an extruded slab with rounded corners (`r`) and bevelled edges (`b`); `mats`: `[faces, sides]` |
| `plate` | `plate(w, h, r, mat)` | mesh | a flat rounded plate facing +z with 0..1 UVs |
| `sheen`, `sweep` | `sheen(doc, w, h, r, opacity)` · `sweep(mesh, a, rest)` | mesh · nothing | a soft slanted band of light over a glass face, and its slide as the device turns |
| `disc` | `disc(r, mat)` | mesh | a circle |
| `metal`, `aluminium`, `titanium`, `alloy`, `glass`, `glossy` | `(color, …)` | material | the materials; `alloy(kind, color, roughness)` picks aluminium or titanium; `glossy(tex)` emits a screen texture |
| `paintScreen` | `paintScreen(c, screenEl)` | frame id or `null` | copies the hidden 2D screen into the texture from its pictures' live boxes |
| `phoneBar` | `phoneBar(model, time, font, say)` | bar | the phone's status bar, drawn on the screen texture |
| `menuBar` | `menuBar(items, time, font, height, url, say)` | bar | the laptop's menu bar |
| `cross` | `cross(q, u, prm, ctx)` | turn in radians | the cross move: one smooth move with one full turn, the back to the viewer half-way |
| `turn` | `turn(move, q, u, ctx)` | turn in radians | the turn about the vertical axis for a move; a deck rest faces the viewer |
| `fitCanvas` | `fitCanvas(c, holder)` | nothing | sizes the canvas and camera to the holder |
| `mark` | `mark(c, ry, extra = {})` | nothing | writes the readouts tests and the gate read as `data-*` on the canvas |
| `draw` | `draw(c, holder, ctx)` | nothing | renders after the seek's decodes, with the screen copied for this `t` |

### `synth.js`: Web Audio voices for sound patterns

Pure in their arguments; the noise is seeded (mulberry32), so a cue renders to the same samples
every time.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `noiseBuf` | `noiseBuf(ctx, secs, seed)` | `AudioBuffer` | a mono buffer of seeded noise |
| `tone` | `tone(ctx, { type, f0, f1, at, dur, peak, atk, swell, soft, lp })` | nothing | an oscillator from `f0` to `f1` with a gain envelope, optionally low-passed (`lp` Hz) |
| `burst` | `burst(ctx, { kind, q, f0, f1, at, dur, peak, atk, swell, soft, seed })` | nothing | seeded noise through a filter sweeping `f0` to `f1`, with a gain envelope |

`swell` rises to the peak at the end; `soft` decays to 6 % of the peak and then fades linearly.
