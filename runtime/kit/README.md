# The kit

The browser runtime that turns `t` into a picture (SPEC §2, §6, §10). `kit.js` mounts a story over
a style; `schedule.js` is the timeline algebra, shared with the gate and importable in Node. This
page is for whoever writes stories and patterns against it: what the kit reads, what each pattern
receives, where a story's params end up, and every function the kit modules export.

- [Mount and seek](#mount-and-seek) · [Composition](#composition) · [Story shorthands](#story-shorthands-the-kit-resolves) · [Markup grammar](#markup-grammar-spec-6)
- [What each pattern kind receives](#what-each-pattern-kind-receives) · [Units of travel](#units-of-travel) · [Param routing](#param-routing) · [Cascades](#cascades-data-each--paramseach)
- [Fragments](#fragments-patternhtml-for-text-data-and-devices) · [Assets](#assets) · [Overlays](#overlays) · [Sound cues](#sound-cues) · [Schedule output](#schedule-output) · [Warnings](#warnings)
- [Screen actions](#screen-actions) · [3D devices](#3d-devices) · [Footage](#footage)
- [Module reference](#module-reference): `kit.js` · `schedule.js` · `springs.js` · `ease.js` · `random.js` · `seeded.js` · `fit.js` · `count.js` · `room.js` · `glyphs.js` · `rough.js` · `points.js` · `screen.js` · `footage.js` · `device3d.js` · `synth.js` · `rig.js`

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
| `data-footage` | layout | an `<img>` the kit points at the story's footage frame for `t` (see [Footage](#footage)); the layout also declares it `data-media` |

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
- `ctx.t`: the instant being drawn: piece seconds in a film, the press position in a deck. For a pattern that
  keeps time with the piece rather than with its own beat (a character's idle on the track's beat grid);
  `ctx.u` stays the time since the item started.
- `ctx.footage` (only when the story has footage, in a film): `{ t, fps, duration, clip, clipAt, words }`:
  the film second, the edit's frame rate and length, the index of the picture clip showing now,
  `clipAt(t)` for any instant, and the supplied words on the output clock (`[{ text, at, end }]`).
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

`moves/depth-parallax` moves a picture whose asset is the `source.png` of a layer pack (`mm media
layers`): it reads `media.json` beside it and draws the plate and parts in a canvas declared media
over the picture. `entrances/photo-wake` draws a picture as a print in ink and canvas and brings its
colours back behind an accent front. `entrances/photo-wake` draws nothing at rest, nor does `moves/depth-parallax` with `aperture: 0`,
so a rest shows the plain picture; with its default lens the depth parallax rest is the settled picture, nearest layer
sharp.
They load their files once per page; a seek that comes before they are ready draws through
`ctx.afterSettle`, so a frame stays a function of `t`. `moves/depth-parallax` is a dolly that settles:
layers start displaced by their depth relative to the focus (the nearest layer by default) and
slide home, and a lens blurs each layer by its depth gap from the focus; a depth map is cut into quantile bands by the
depth behind the parts.

## Overlays

A transition that needs a node outside its two sections marks it `data-mm-overlay`; the kit removes
every such node at the start of every seek, and the transition draws it again if the new instant is
inside the cut. Custom properties a transition writes on a section (`--mm-tx-*`) go with the
section's inline style, which every seek restores. No overlay or veil can outlive its frame.

`.mm-camera` is a stacking context (`z-index: 0`): a layout's z-index orders elements inside its
camera only, never above the scene's finish or a transition's overlay.

**Finish.** A brand's `finish` (SPEC §3) is a layer above the camera in every scene. `grain`,
`halftone`, `vignette`, `edgeFringe` and `paperEdge` each draw one child of it; `paper` adds a fibre
layer (ink noise seeded once, never re-seeded). Grain, halftone and paper together stay at or under
0.08 opacity: when their strengths add up past 1 each is scaled down in proportion. `misregister` sets
`data-misregister` on each `<section>` and, every seek, marks `[data-plate]` on the largest boxes in the
camera that hold no layer of their own (`[data-slot]`, `[data-depth]`) and writes each its own
`--mm-plate` (a hard accent `drop-shadow`), which `.mm-scene[data-misregister] > .mm-camera [data-plate]`
reads as its `filter`. The camera itself never carries a filter, so 3D camera moves keep their depth.
Beside type under display size the offset is at most 0.05 of its font size. Every emphasis kicks the
plate (`plateKick`); the offset steps every max(2, `frameHold`)/30 s.

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
- **Frame hold** (`motion.frameHold` 2 or 3): every element is drawn as it was at the last instant of
  one grid shared by the piece (every 2/30 s or 3/30 s whatever the export frame rate), and finishes at
  the start of the step it would have finished in, so rests are unchanged; `report().progress` is the
  progress of the step that is drawn. Cuts and camera moves stay smooth.

## Warnings

`window.mm.warnings` is a list of strings. The kinds that matter to a story author:

- `pattern <ref> did not load: …`: an unknown or broken pattern (G-PATTERN-REF reads this text).
- `unknown slot: layout <ref> has no slot "<name>"; appended one`: the story names a slot the
  layout does not provide.
- `screen: <file> did not decode`: a picture a seek asked for failed to decode (once per file; a
  footage frame too, and only when the picture still asks for that frame after a quick scrub).
- `footage: …`: the story's footage is missing or inconsistent, the piece is a deck, the film runs
  past the edit, footage is set but no layout shows it, or a layout shows footage the story does not name.
- `<selector>: params.stagger … is not a number of seconds >= 0`: a cascade fell back to the style's spacing.
- `<group>/<name>: …`: a note a pattern writes once when a seek draws its beat: a slot name in
  `cutParams` that matches no slot (`transitions/flood`, `transitions/iris`), a garden that grows a
  single plant or nothing (`text/garden`), a `land` value, which a point cloud does not read, or a picture it refuses because it has no transparent ground, no depth map and no flat border (`3d/point-cloud`),
  a reaction with no free place (`emphasis/emote`), a stamp or dimension beat with an entrance
  (`emphasis/stamp`, `emphasis/dimension`), a figure of zero or below (`data/unit-stack`), an SVG feature
  a one-line drawing cannot read (`entrances/one-line`). `mm export` prints these; `mm check` reads the
  list right after mount, before any seek, so it does not report them.

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

## Footage

`story.footage: { asset: "assets/<n>/" }` (film only) names a folder holding a frame sequence (`mm
media prep`) and its edit (`mm footage cut`). The edit's output clock is the film's clock: at `t`
every `<img data-footage>` a layout carries (`layouts/talking-full`) shows the source frame the
edit's picture clips map `t` to, held at either end, and the decode is awaited inside `settle()`.
The footage runs on across scene cuts and transitions. The picture sits in the layout root, not in
a slot, so a seek's restore never touches it; only scenes that are visible are painted. The cut
voice goes in `audio.track` (`assets/<n>/voice.wav`). `moves/punch` scales the footage alone on
every other clip of a scene, and `text/caption-karaoke` with `mode: words` times its groups to the
edit's words; both read `ctx.footage`. `ctx.footage` carries the recording's size (`w`, `h`), so
`moves/punch` maps its anchor through the footage's cover fit and the anchor holds in every format.

A footage picture that also carries `data-footage-matte` (`layouts/talking-cutout`) shows only the person:
at mount the kit lays an SVG `<mask>` (luminance, the picture's layout size, `preserveAspectRatio` from its
object-fit and object-position) beside it, and each seek points the mask's image at the matte frame of the
same source frame (`mm footage matte`), its decode awaited inside `settle()`. A folder with no matte for
every frame shows the whole picture, with a `footage: ` warning.

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
| `plateKick` | `plateKick(t, start, d, frameHold = 1)` | number | the misregistered plate's emphasis kick at piece time t, as a share of its full swing (1 on its first step, a damped swing past register, 0 outside it); steps every max(2, frameHold)/30 s, first step at or after the emphasis start |
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
| `cutSeconds` | `cutSeconds(ref, style, meta = {}, params = {})` | seconds | a cut's length; 0 for a hard cut; a module whose default export carries `durOf(params)` is sized by the scene's `cutParams` (`transitions/flood`'s `speed`) |
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

### `fit.js`: fit a headline to a width or to its room, and a word to its slot

| Name | Signature | Returns | Note |
|---|---|---|---|
| `fit` | `fit(el, targetPx = el.clientWidth, { max, min, line })` | font size in px | sets `font-size` so the widest explicit line is `targetPx` wide, clamped to `[min, max]`; `line` sets a unitless line-height. Call after `document.fonts.ready` |
| `fitHeadline` | `fitHeadline(scene, { max, least })` | `{ el, authored, px, broken }` or `null` | the kit calls it once per scene at mount, at the scene's rest: sizes the scene's `.mm-fit` headline from its authored size down in 4 % steps (floor 0.6) until every text box of the scene is inside the safe area and off the headline and no word of the headline is split between letters, never above `max` px; marks it `data-fit="tight"` when no size clears the other slots and the mark helps. A word still split, or wider than the safe area, at the floor keeps it shrinking down to `least` px (the kit passes the body floor); `broken` is true when even that does not hold the word. `null` without a headline or a laid-out DOM |
| `shrinkToRoom` | `shrinkToRoom(excessAt, authored, { max })` | px | the pure search behind `fitHeadline`: the first size, from `min(authored, max)` down in 4 % steps to 0.6 × authored, where `excessAt(px)` is 0; else the largest size within 0.5 px of the least excess, so an excess the headline does not cause never shrinks it |
| `fitWords` | `fitWords(el, floor)` | `{ el, authored, px, hyphenate }` or `null` | the kit calls it once per scene at mount, at the scene's rest, on each slot whose style declares `--mm-fit: word` (a stamp): sets its font size so its longest word fits the slot's room (its max-width, at most the safe area), never above the authored size and never under `floor` px; a word that would need to is broken at soft hyphens (`hyphens: manual`) into the fewest balanced parts that fit at the floor first. `hyphenate` maps a text to the same text with those soft hyphens. `null` without text or a laid-out box |
| `bodyFloor` | `bodyFloor(kind, format)` | px | the format's body floor (SPEC §12), the size G-LEGIBLE holds every rest to |
| `wantsWordFit` | `wantsWordFit(el)` | boolean | whether the element's style declares `--mm-fit: word` |

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

### `glyphs.js`: where ornament roots on a letter

Pure functions of a glyph's binary mask (one cell per letter, drawn at `EM` pixels per em, origin on the
baseline at `(ox, oy)`); no DOM. A pattern rasterises the letter itself (it declares `canvasText: true`)
and reads it here. Anchors are in em from the glyph origin, so a reflow roots them at the same places.
Imported by `text/garden` and `transitions/flood`.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `EM` | 64 | px per em | the analysis size |
| `INSET` | 0.02 | em | how far inside the ink an anchor sits |
| `maskOf` | `maskOf(rgba, w, h, threshold = 128)` | `Uint8Array` | 1 where alpha reaches the threshold |
| `distanceField` | `distanceField(mask, w, h)` | `Float32Array` | signed px to the ink edge, negative inside (chamfer 3-4) |
| `skeleton` | `skeleton(mask, w, h)` | `Uint8Array` | Zhang–Suen thinning |
| `terminals` | `terminals(skel, w, h, reach = 6)` | `[{ x, y, dx, dy }]` | stroke ends with their outward direction |
| `analyse` | `analyse({ mask, w, h, ox, oy })` | `{ sdf, skel, terminals, outline, area, box, … }` | the field, the skeleton with spurs pruned, outline normals, ink area in em² |
| `sdfAt` | `sdfAt(a, x, y)` | em | the signed distance at a point in glyph em |
| `candidates` | `candidates(a)` | `[{ x, y, nx, ny, kind, weight }]` | every anchor before the draw: `terminal`, `up`, `down` |
| `anchors` | `anchors(a, { seed, density, index, char })` | the same shape | a seeded weighted draw, 0.25 em / density apart, 1 to 5 by ink area, a stroke end first |
| `bridge` | `bridge(a, b, advance, { seed, index })` | `{ from, to, length } \| null` | the nearest facing edges of two neighbouring letters |
| `dotOf` | `dotOf({ mask, w, h, ox, oy, alpha? }, { char, em })` | `{ x, y, r, rx, ry, round } \| null` | the round mark of a letter: the tittle of an i or j (the blob wholly above the stem), or a full stop or bullet; centre, area radius and upright semi-axes in em from coverage; `round` false for a square or slanted dot. Imported by `transitions/flood` |

### `rough.js`: the pen stroke

Pure: no DOM, no clock; the same arguments give the same path in Node and in the page. The stroke has
a plain voice (seeded jitter per sample, the second pass 1.4× wilder) and opt-in voices: a coherent drift
along the length (periodic round a closed outline, so no seam), a ghost second pass with its own wander,
and an overshoot past an open stroke's ends; `PENS` bundles them as pencil, marker and charcoal. `wash`
and `hatch` fill a closed shape with drawn colour or lines in one palette role; `polyOf` makes any
polyline a shape. `roughness` 0 lies exactly on the shape in every voice.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `shapeOf` | `shapeOf(kind, { x, y, w, h }, r = 0)` | shape | `kind`: `box`, `pill`, `circle` (the inscribed ellipse) or `line` (along the bottom) |
| `polyOf` | `polyOf(points, closed = false)` | shape | any polyline, open or closed, sampled run by run (corners stay corners); takes every stroke, voice, wash and hatch |
| `lerpBox` | `lerpBox(a, b, t)` | `{ x, y, w, h, r }` | linear between two boxes; exactly `a` at `t <= 0`, `b` at `t >= 1` |
| `planOf` | `planOf(shape, step = STEP)` | number[] | how many samples each run of the outline gets; keep the first box's plan through a morph |
| `sample` | `sample(shape, plan = planOf(shape))` | `[x, y][]` | the shape's points under a plan |
| `jitter` | `jitter(points, next, amp)` | `[x, y][]` | each point moved by up to `amp` px on each axis, two draws per point from `next` |
| `pathOf` | `pathOf(points, closed)` | SVG path `d` | smoothed through the midpoints |
| `stroke` | `stroke(shape, { seed, roughness, boil, frame, pen, plan })` | SVG path `d` | two passes, the second wilder; `boil` is the shiver in pen half-widths and `frame` which of its frames; `roughness` 0 lies exactly on the shape; takes `passes()`'s voices too |
| `passes` | `passes(shape, opts)` | `[d, d]` | the stroke's two passes on their own, so a pattern can draw the second as a ghost; `stroke()` is the two joined. Opt-in voices: `coherent` (the wander drifts along the length; a closed outline has no seam), `wavelength` (pen half-widths per drift cell, 20), `ghost` (the second pass's wander against the first's, 1.4), `overshoot` (an open stroke runs past each end by this many pen half-widths). Without them the stroke is exactly the plain one; `roughness` 0 still lies on the shape |
| `wash` | `wash(shape, { seed, pen, layers = 4, bleed = 6, alpha = 0.09, offset = 0, angle, plan })` | `[{ d, alpha }]` | a watercolour wash of a closed shape: layers pushed outward by a ragged share of `bleed` (pen half-widths), fainter outward; `offset` shifts every layer off the outline like a second print plate. Fill each with one palette role |
| `hatch` | `hatch(shape, { seed, pen, angle = π/4, gap = 5, jitter = 0.4, plan })` | `{ clip, d }` | near-parallel drawn lines `gap` pen half-widths apart and the exact outline to clip them with |
| `PENS` | `{ pencil, marker, charcoal }` | presets | stroke voices: `width` (against the pattern's pen), `roughness`, `coherent`, `wavelength`, `ghost`, `ghostAlpha`, `ghostWidth`, `overshoot` |
| `boilFrame` | `boilFrame(t, { period = BOIL_PERIOD, n = 3, deck = false })` | frame index | which shiver frame shows at `t`; always 0 in a deck or when `period` is 0 |
| `STEP` | 8 | px | sample spacing at a pen of 2 px |
| `BOIL_PERIOD` | 0.4 | seconds | how long a boil frame holds |
| `INK` | `{ straight, handover, lift }` | fractions | the inking contract between `entrances/sketch` and `transitions/sketch-to-ink`: the part of the cut each stage owns |

### `points.js`: a picture as a free-floating object of points, and its reveal

Imported by `3d/point-cloud`. Pure: Node runs it as the browser does.

| Name | Signature | Returns | Note |
|---|---|---|---|
| `samplePicture` | `samplePicture(pic, { count, seed, relief, depth, depthMap, depthMin, alphaMin, jitter })` | `{ count, width, height, area, pos, rgb, face }` | seeded points on a picture's opaque pixels, each with its pixel's colour; `relief`: `flat`, `luma`, `map` (`depthMap`, white near; below `depthMin` is ground and takes no point), `extrude` (front, back, walls) or `pillow` (the cut-out inflated by its distance field: a front and a back surface round at the rim, and points inside the shell); `jitter` moves each point up to ± jitter × depth / 2; `pos` in picture px, origin at the centre, y up; the order is a seeded shuffle |
| `distanceField` | `distanceField(pic, alphaMin)` | `{ dist, max, width, height }` | each opaque pixel's exact distance to the outline, in px |
| `keyBackground` | `keyBackground(pic, { tolerance, flat })` | `{ pic, cut, flat, removed, ground }` | a cut-out comes back as it is; a flat border colour is keyed away from the border; a border that is not one flat colour is refused (`pic: null`) |
| `paletteRamp` | `paletteRamp({ canvas, muted, ink, accent }, { lo, hi })` | `(r, g, b) → [r, g, b]` | brightness onto canvas → muted → ink, ink on the side away from the canvas, the picture's range `lo..hi` stretched over it; vivid pixels blend canvas and accent; a one-tone picture is ink; always a blend of two roles |
| `flowOf` | `flowOf(x, y, z, t, out)` | `out` | a divergence-free swirl (the Arnold–Beltrami–Childress flow, phases drifting with `t`), \|v\| < 3 |
| `FLIGHT` | `{ B0, B1, SPAWN, F0, F1 }` | shares of progress | the reveal's timeline: burst B0–B1 (points spawn over SPAWN), front F0–F1, home from F1 |
| `flightOf` | `flightOf(q, hx, hy, hz, dx, dy, dz, s, j, o, out)` | `[x, y, z, landed, spawned]` | a point's place at progress `q`: the seed at `o.origin`, a swirling burst along its direction out to `o.reach × s`, a front from the origin that sends it home (nearer first, ragged by `j`); exactly home from `FLIGHT.F1` |

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

### `footage.js`: a cut recording on the film's clock

The pure half runs in Node; the DOM half points the layout's footage pictures at a frame. See [Footage](#footage).

| Name | Signature | Returns | Note |
|---|---|---|---|
| `outputFrame` | `outputFrame(edit, t)` | 0-based frame | the edit's output frame at film second `t`, held at its first and last |
| `clipAt` | `clipAt(edit, t)` | index | the picture clip that holds `t` |
| `sourceFrame` | `sourceFrame(edit, t)` | 0-based frame | the recording's frame shown at `t` |
| `frameFile` | `frameFile(base, i)` | path | the file `mm media prep` writes for source frame `i` (`f` and `i + 1` in five digits, `.jpg`) |
| `matteFile` | `matteFile(base, i)` | path | a source frame's matte, `matte/f{i+1}.png` (`mm footage matte`) |
| `matteAspect` | `matteAspect(fit, position)` | string | the SVG `preserveAspectRatio` that lays a matte over a picture drawn with that object-fit and object-position |
| `footageCtx` | `footageCtx(f, t)` | `{ t, fps, duration, clip, clipAt, words }` | what a pattern reads as `ctx.footage` |
| `mountFootage` | `async mountFootage(story, { stage, duration, kind }, warnings)` | `{ base, meta, edit, els } \| null` | reads `media.json` and `edit.json` of `story.footage.asset` and finds every `img[data-footage]` (and masks each `data-footage-matte` one with its matte); `null`, with a `footage: ` warning, when something is wrong |
| `paintFootage` | `paintFootage(f, t, track, warn)` | nothing | points every footage picture in a visible scene at the frame for `t`; `track` registers each decode for `settle()`, `warn(src)` names one that failed |

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

### `rig.js`: a brand's mascot as a puppet

Draws `style.mascot` (SPEC §3) as SVG groups filled from `--mm-color-*` only, and moves it in closed forms of
time. Used by `entrances/character` and `emphasis/act`.

- `ROLES`, `MOODS`, `EYES`, `MOUTHS`, `VIEWS`: the names the brand schema's `mascot` block accepts.
- `ACT`: the acted change's timing in seconds (`key` 0.16 into a window of `dur` 1; eyes shut for `hold` 0.05
  either side of the key, closing over `squintIn`, opening over `squintOut`; pose blend over `blend` 0.4).
- `squash(s)` → `{ sx, sy }` with `sy = 1 − s`, `sx = 1 / sy`: the area is kept exactly; `backOut(x)` (about
  10 % overshoot).
- `accent(bp, every)`: 1 on every `every`-th beat at beat position `bp`, a short rise into it and a fall to 0
  before the next. `idle(mood, t, { bpm, offset, amp })`: a mood's idle pose at piece time `t`; every squash
  accent peaks on a grid beat.
- `hop(q, { from, d, width })`: the entrance at linear progress `q` (crouch, flight, landing; exactly the rest
  pose at 1). `act(from, to, a, amt)`: the mood change at `a` seconds from its key (face, squint, blend `w`,
  take). `blink(t, seed)`.
- `DEFAULT_MASCOT` (drawn for a style with no mascot), `colorOf(part, fallback)`, `resolveMascot(style, who)`
  (defaults filled; shade toward the brand's darkest role, light and cheeks toward its lightest; it refuses
  a view whose drawing reaches more than 20 % of the box past the box, the front then taking
  `DEFAULT_MASCOT`'s figure, and lists why in `issues`; `top` and `head` are the body's reach above the
  ground and the headroom every pose is kept under; `who` picks a cast member (an unknown name draws the main
  character and is listed in `issues`); the result also carries `extras` (extra parts with their CSS colour, anchor
  and reach) and `float`; `top` counts parts and float),
  `viewOf(m, name)` (a view not drawn is made from the front), `moodOf(m, name)` (a mood or shape the brand does
  not allow falls back to its first).
- `characterPose(o)`: the whole pose at one instant (`o.dur` is the entrance's length in seconds and `o.q` may run
  past 1, time since the landing in entrance lengths; a character with extra parts gets `swing`, degrees per part);
  `markup(m, pose, { id, sheet, aspect })`: the SVG (one face group at most; `data-mood`, `data-sq`, `data-squint`,
  `data-eyes` report the pose; extra parts are `g.mm-rig__part` with `data-part` and `data-swing`; a screen face's
  plate is `rect.mm-rig__plate`); `draw(el, m, pose, opts)` replaces the rig the element shows.
