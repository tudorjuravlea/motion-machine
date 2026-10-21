# SPEC — Motion Machine grammar (version 0.11)

An implementation (kit, CLI, patterns, skill) is correct if and only if it follows this spec and
every piece it emits passes `scripts/check.mjs` (the gate). Rule ids: **G-** = gate rule
(machine-checked, error), **W-** = gate warning (machine-checked, reported), **R-** =
release-check sweep, **H-** = heuristic (the agent applies it, the reviewer checks it at the
handover). Every G- and W- rule names the negative fixture that proves it; the rule ledger (§14)
lists one per id. A threshold marked *provisional* rests on no measurement yet and says where its
number came from. Credits for ideas taken from other projects are in `PROVENANCE.md`.

## 1. Objects

| Object | What it is | Where |
|---|---|---|
| **Piece** | One film or one deck, built from one story and one style | `pieces/<id>/` |
| **Story** | The beat sheet as data: scenes, beats, timing or presses, copy, cues | `pieces/<id>/story.json` |
| **Style** | The look as data: colour, type, scale, space, radius, composition, motion, sound, bans | `pieces/<id>/style.json` (copied in from `styles/presets/<preset>.json`, composed from `styles/brands/` and `styles/motion/`, or drafted) |
| **Pattern** | A documented, brand-neutral unit of motion vocabulary | `patterns/<group>/<name>/` |
| **Kit** | The browser runtime that turns `t` into a picture | `runtime/kit/` |
| **Gate** | The checks every piece and pattern must pass | `scripts/check.mjs`, `scripts/pattern-lint.mjs` |
| **Fixture** | A golden piece and one negative per rule | `fixtures/` |

A piece folder is self-contained (AXIOM 7): `story.json`, `style.json`, `index.html`, `piece.css`,
`piece.js`, `assets/` (fonts, images, data, audio), `out/` (generated, git-ignored). `index.html`
links the kit by relative path (`../../runtime/kit/kit.js`); `mm export` inlines it so the exported
deck folder stands alone.

## 2. Render contract

1. The page exposes `window.mm` with `seek(t: seconds): void`, `duration: number` (film) or
   `presses: number` (deck), `scenes: {id, start, end}[]`, and `goto(press: int)` (deck).
2. `seek(t)` paints frame `t` completely, from `t` alone. No state survives between calls. For a
   film `t` is seconds; for a deck `t` is a fractional press index, an integer being a rest and
   `goto(n)` being `seek(n)`.
2a. `window.mm.settle(): Promise<void>` resolves once every image or texture the last `seek` asked
   for has decoded. `seek` stays synchronous and draws the whole frame; the renderer, the
   gate, stills and the exporters await `settle()` before reading pixels; it never changes what
   `seek` drew. A page with nothing pending resolves at once.
3. In render mode (`<html data-render>`, set by the exporter, the stills command and the gate, or by
   `?render=1` on the page URL) the
   kit injects a stylesheet forcing `transition: none !important; animation: none !important` on
   every element, and the gate additionally reads computed styles: any element whose
   `transition-duration` or `animation-name` is not none fails **G-TIME**. A `transition` or
   `animation` declaration (or its `-duration`/`-delay`) whose value goes through a custom property
   fails the static half of **G-TIME** in piece and pattern CSS: render mode
   neutralises it, but `mm serve` would animate it on the wall clock.
4. Forbidden in piece and pattern code: `setTimeout`, `setInterval`, `requestAnimationFrame`, `Date`,
   `performance.now`, `Math.random`, `crypto.getRandomValues`, `crypto.randomUUID`, `<video autoplay>`,
   `<audio autoplay>`. Also forbidden, because each brings a clock of its own:
   `scheduler.postTask`, `Worker`, `SharedWorker`, `navigator.serviceWorker`, `<iframe>` and
   `<frame>`, and SVG SMIL animation (`<animate>`, `<set>`, `<animateTransform>`,
   `<animateMotion>`). Per-load entropy is forbidden too: `performance.timeOrigin`,
   `Event.timeStamp` and `URL.createObjectURL`. A `queueMicrotask` loop is allowed, since it reads
   no clock. The kit provides `random(seed)`.
   A vendored library that names objects with `Math.random` (Three.js) is evaluated, and its
   constructors and first renders run, under a seeded `Math.random` the kit restores at once
   (`ctx.seeded`); any unseeded call still fails **G-TIME**.

   The static half of **G-TIME** greps for these names in `piece.js`, `pattern.js` and inline
   scripts. It also greps for the markup in HTML, in shipped SVG files and in SVG `data:` URIs.

   The runtime half is a recorder that the gate installs before the piece loads
   (`openPiece({ trap: true })`, a Playwright init script). The recorder wraps each source on the
   object it lives on, so it catches a call however the code reaches it
   (`globalThis['set'+'Timeout']`, `Reflect.apply`, a prototype method). It also records
   `performance.timing`, performance entries and marks, `document.timeline.currentTime`,
   `AudioContext.currentTime` and a no-argument `Intl.DateTimeFormat` format.

   The recorder refuses new realms and threads. `Worker`, `SharedWorker`,
   `serviceWorker.register` and `createElement('iframe'|'frame')` throw `NotSupportedError`. An
   iframe's `contentWindow` and `contentDocument` read null. An iframe, frame or SMIL element that
   reaches the document by any other path is removed when the mutation is delivered, which also
   cancels its timers.

   G-TIME fails on any recorded call whose stack passes through a file the page served, on any
   refused realm (with or without such a stack), and on a page with a child realm
   (`window.length > 0`). The window runs from page load through every seek the gate makes.
   `mm serve` never installs the recorder. Web Crypto key bytes (`crypto.subtle.generateKey`) are
   deliberately left unrecorded, so G-DETERMINISM keeps a negative that only its backstop catches.
5. Rendering the same `t` twice in two fresh page loads yields byte-identical PNGs. **G-DETERMINISM**
   samples the first frame, the middle of the first entrance, the last rest, and one instant per
   scene: the scene's rest for a film (its middle when it has none) and the scene's last press for
   a deck. The first page renders these instants in order and the second renders them in reverse,
   so a frame that depends on what was drawn before it also fails.
6. Fonts: the kit awaits `document.fonts.ready` and the exporter waits for it before the first
   frame. All `@font-face` sources are relative paths inside the piece or the kit. Any `http(s):`
   URL in `href`, `src`, `url()` or `@import` fails **G-LOCAL**. Relative paths must
   resolve inside the piece folder or the repository's `runtime/kit/`, `runtime/vendor/`, `patterns/` or `styles/fonts/`;
   a piece under `fixtures/` may also resolve inside `fixtures/`.
7. Formats (§12): the exporter sets the viewport, `deviceScaleFactor: 1`, and
   `<html data-format="9x16|4x5|1x1|16x9">`; layout responds to the attribute, content does not change.
8. Frame rate 30 fps by default, 60 by flag. Subframes: `--sub N` renders N instants per frame and
   blends them with ffmpeg `tmix` for motion blur (default 1: blending moving text makes ghosts, so
   `--sub` above 1 asks W-SUB first),
   keeping the last frame of each group of N.
9. Live preview (`mm serve`) drives `seek` from a play clock and the keyboard; that clock lives in
   the server page, never in the piece. `?t=12.5` opens a film at an instant; `?press=4` opens a
   deck at a rest.
10. Encoding: PNG frames piped to ffmpeg, converted with an explicit `bt709` matrix and `tv` range
    and tagged on all four colour fields (an untagged conversion uses BT.601 and shifts reds),
    `libx264 -preset slow -crf 16 -tune animation -pix_fmt yuv420p +faststart`; dimensions are
    always even; audio is resampled to 48 kHz and padded or trimmed to the exact video duration.
    The exporter composites on the style's canvas colour before encoding, since H.264 has no alpha.
    Frames are captured with Playwright's `screenshot({ animations: 'disabled' })`, which
    fast-forwards a finite Web Animation and cancels an infinite one; the gate and the exporter share
    that path (`framePng`), so they agree, but the agreement is Playwright's behaviour, not a rule.
11. Every verb and the gate launch Chromium through `launchBrowser()` (`scripts/lib/browser.mjs`)
    with `LAUNCH_ARGS`: `--disable-partial-raster --disable-gpu-rasterization --disable-gpu
    --disable-zero-copy --disable-checker-imaging --run-all-compositor-stages-before-draw
    --force-color-profile=srgb --disable-lcd-text`. Rasterisation then depends on the frame alone.
    `tests/check/raster.test.mjs` renders 120 consecutive frames of a tile-entrance fixture twice
    in one page and once in a fresh page and requires byte equality (flags in, not
    reproduced on demand).
12. **Every rest is a finished picture.** At an integer deck press and at a film rest, every
    arrived element is drawn at `p = 1` exactly and `report()` gives it `progress: 1`. The kit
    compares local time to a duration with a 1e-9 tolerance, so float error never leaves an
    entrance at `spring(d) = 0.995`. A film's frame 0 and a deck's rest 0 may show the
    first scene's headline finished (§4 `params.instant`, `step: 0`; G-HOOK).

## 3. Style contract (`contracts/style.schema.json`)

A piece's `style.json` is the **composition of a brand and a motion style**. The two
halves are authored, captured and shipped separately so that any brand can wear any motion style:

| Half | Owns | Lives in | Captured from |
|---|---|---|---|
| **brand** | `color`, `type`, `scale`, `space`, `radius`, `composition`, `bans`/`allow` | `styles/brands/<name>.json` | a site (`mm brand capture --from <url>`), a Figma file, a `DESIGN.md`, or by hand |
| **motion** | `motion` (durations, easings, springs, travel), `sound`, `transitions` (preferred cut per narrative position), `entrances` (preferred vocabulary), `pacing` (hold floor, arrivals per 10 s) | `styles/motion/<name>.json` | a reference film (`mm motion capture --from <video>`: cuts and their kinds, shot lengths, arrival tempo, entrance and cut durations, energy and the headline entrance family, measured on extracted frames; §13), a preset, or by hand |

`mm style compose --brand <name|path> --motion <name|path> --out pieces/<id>/style.json` writes the
composed file with `from: { brand, motion }` recorded. The kit reads only the composed file. A
shipped brand preset is fictional (AXIOM 3); a shipped motion preset is neutral by construction.
Composed shape:

```jsonc
{
  "name": "editorial", "version": 1, "fictional": true,        // presets must be fictional (AXIOM 3)
  "from": { "brand": "styles/brands/paper.json", "motion": "styles/motion/calm.json" },
  "color": { "canvas": "#…", "ink": "#…", "muted": "#…", "surface": "#…", "line": "#…",
             "accent": "#…", "accentInk": "#…" },               // roles, exactly these seven
  "type":  { "display": {"family": "…", "weight": 700, "tracking": -0.02,
                         "files": [{"src": "assets/fonts/….woff2", "weight": 700, "unicodeRange": "…"}]},
             "text":    {"family": "…", "weight": 400, "tracking": 0, "files": [ … ]},
             "mono":    {"family": "…", "weight": 400, "tracking": 0, "files": [ … ]} },
  "scale": { "display": 1.0, "h1": 0.62, "h2": 0.42, "body": 0.27, "caption": 0.21, "micro": 0.19 },
                                                                // ratios of the format's base size (§12)
  "space": [4, 8, 16, 24, 40, 64, 104],                         // px steps, --mm-space-0…6
  "radius": [0, 4, 12, 24, 999],                                // px steps, --mm-radius-0…4
  "composition": { "align": "left", "headlineScale": 1, "density": "airy" },
                                                                // the grid and the type hierarchy
  "motion": { "durations": { "quick": 180, "standard": 360, "slow": 700, "hold": 1200 },  // ms
              "easings":   { "enter": "cubic-bezier(.2,.7,.2,1)", "exit": "cubic-bezier(.4,0,1,1)", "move": "cubic-bezier(.4,0,.2,1)" },
              "spring":    { "ui": {"k": 420, "c": 34, "m": 1}, "type": {"k": 200, "c": 28, "m": 1}, "heavy": {"k": 180, "c": 30, "m": 2} },
                                                                // or perceptual: { "bounce": 0.2, "period": 0.5 } → ζ = 1−b, k = (2π/T)², m = 1
              "travel": 1.0,                                    // multiplier on pattern travel distances
              "overshootMax": 0.15,                             // 0–0.30; a motion style may allow bouncier personalities
              "exitRatio": 0.7,                                 // exits take this fraction of their entrance's duration
              "boil": 0.4,                                      // optional: s each frame of a pen's shiver holds (ctx.boil); 0 = still; a deck never shivers
              "frameHold": 1,                                   // optional: 2 animates elements on twos (each element's local time steps every 2/30 s, counted in 1/30 s whatever the export frame rate); cuts and camera moves stay smooth
              "stagger": { "eachS": 0.05, "capS": 0.5 } },      // per-item stagger and the cap on a whole cascade
  "sound": { "palette": "soft-ui" | "percussive" | "cinematic" | "none", "bpm": 120, "loudnessLufs": -14,
             "cuesPer10s": [2, 6] },                            // W-MIX's band
  "transitions": { "opening": "transitions/hard-cut", "topic": "transitions/wipe", "related": "transitions/crossfade",
                   "climax": "transitions/zoom-through", "outro": "transitions/fade",
                   "policy": "owns-exit" | "velocity-matched" },  // §15; passed to transitions as ctx.policy
  "entrances": { "headline": "entrances/rise", "body": "entrances/fade", "figure": "entrances/count", "plate": "entrances/pop" },
  "pacing": { "holdMinS": 1.2, "arrivalsPer10s": [3, 6], "energy": "calm" | "medium" | "high" },
  "bans": ["centered-title-on-gradient", "fade-only", "corner-labels", "frame-borders", "glow-on-ui", "particle-burst"],
  "allow": []                                                   // a style may lift a ban by name
}
```

`transitions` and `entrances` are the motion style's vocabulary, and a story speaks it by role
(§4): `fx: "style:<role>"` takes `entrances.<role>`, and a scene that gives a
`position` and no `cut` takes `transitions.<position>`. A story that names a pattern overrides
the style for that beat or scene. `pacing` is read by the gate: W-PACE (arrivals per 10 s
outside the band) and W-HOLD (a rest shorter than `holdMinS`; `holdMinS` is the shortest *rest*,
not the shortest shot). A captured `pacing.energy` is read from measured quantities
against bands calibrated on labelled films (§13), never copied from a preset. The preset of that
energy then fills what frames cannot measure, and `capture-notes.md` lists each such value under
"Defaulted".

**Composition belongs to the brand.** `composition.align` is `left` or `center`,
`headlineScale` is 0.8 to 1.4, `density` is `airy` or `compact`. All three are required in a
brand half; `mm style compose` copies the block into the composed style. In a composed style the
block is optional, so a style composed without it still mounts: the kit then reads
left, 1, airy. A captured brand (`mm brand capture`) copies the block from the template brand
and lists it among the copied defaults, since a site does not reveal it. The shipped brands differ
on purpose: `paper` left, 1, airy; `signal` center, 1.2, compact; `linen` left, 1, airy; `nocturne` left, 1.3,
compact.

**Device finish.** A brand may give `devices.finish`: `ink` (the default, the look device
frames always had), `canvas` (the surface colour), `graphite` (the darkest palette role) or
`silver` (the lightest). Every finish is a palette role, so G-LITERAL holds. `mm style compose`
copies it. The kit exposes it as `--mm-device-body`, with `--mm-device-island` (the darkest role)
for the phone's cutout; device patterns read only those.

**Brand text rules.** `color.surfaceInk` (optional) is the colour of text on a surface:
cards, tiles, caption bars, callout labels, split-flap tiles, stat tiles and device screens; ink
when absent (the kit sets `--mm-color-surfaceInk` and `--mm-surface-muted`). `composition.accentText:
false` is for a brand that never colours text: every pattern that would tint text with the accent
(stat-hero and split figures, indicate, shine, karaoke, an accent handwriting stroke) reads
`--mm-accent-text`, which is then ink; accent fills (bars, rules, buttons, rings) stay accent.

**Ground.** A brand may give `ground`: `blobs` (1 to 8, each `{ color, x, y, w, h,
alpha }`, the box in shares of the frame), `blur` (a share of the frame width) and an optional
`mark` (`{ src, width, alpha }`: a picture relative to the piece page, centred, `width` a share of
the frame width, clipped by the frame above 1). The kit draws it as the first child of every scene
(`.mm-ground`, `data-chrome`, `data-keep`, `aria-hidden`), so cuts carry it. Blob colours join the
palette as `ground-<n>`; G-LITERAL's pixel half compares each frame with the same frame showing only
the ground, and passes a pixel that is the ground or a blend of the ground under it and one palette
colour. G-LOCAL checks the mark file. `mm style compose` copies `ground`.

A perceptual spring's `bounce` is below 1 (`exclusiveMaximum`; 1 never settles). The kit floors
damping at ζ = 0.01 (bounce 0.99, and the same for a `{k, c, m}` spring with a tiny `c`), so
`spring.settle` and `schedule()` always return. The scale ratios shown clear every §12
floor in every format.

Contract ids: the four schemas are identified as `urn:motion-machine:contracts:<name>`
(`brand`, `motion`, `style`, `story`); cross-file references use the same URNs. No schema names a
web domain.

The kit maps the file to CSS variables on `:root`: `--mm-color-<role>` (role names verbatim, so
`--mm-color-accentInk`), `--mm-font-<role>`, `--mm-weight-<role>`, `--mm-tracking-<role>`,
`--mm-size-<role>` (resolved to px for the active format), `--mm-space-<n>`, `--mm-radius-<n>`,
`--mm-dur-<name>`, `--mm-ease-<name>`, `--mm-travel`; from the format `--mm-frame-w`,
`--mm-frame-h` and `--mm-safe` (the §12 safe margin in px); and from the composition
`--mm-align` (`start` for left, or `center`, usable directly in `text-align`, `align-items`,
`justify-items` and `justify-content`), `--mm-headline-scale` (the number) and `--mm-density` (1
for airy, 0.6 for compact). Every layout takes its default alignment from `--mm-align`,
multiplies every headline size by `--mm-headline-scale` and multiplies the gaps between its
blocks and its side indent by `--mm-density`. A beat's `align` param (`left` or `center`, written
as `data-p-align` on its slot) or `data-align` on the layout root overrides `--mm-align` for that
scene, in either direction. Springs are read by name through `ctx.spring(t, role)` (§5). Pattern and piece CSS may use **only** these variables for colour, family,
size, space, radius, duration and easing (**G-LITERAL**, §7). The gate also samples computed
colours of every text and background at each rest and fails any not in the palette (tolerance:
exact, since the values are variables).

## 4. Story contract (`contracts/story.schema.json`)

```jsonc
{
  "id": "motion-machine-intro", "kind": "film" | "deck" | "loop", "formats": ["9x16", "1x1", "16x9"],
  "title": "…", "language": "en",
  "autoReturn": true,                                          // loop only: the kit plays the last scene's arrivals back to p = 0 before the last frame
  "facts": [ { "id": "f1", "text": "…", "source": "…" } ],     // every number on screen cites one (H-FACTS); "sample": true marks an illustrative number
  "audio": { "track": "assets/audio/track.wav" | null, "bpm": 120 | null, "beats": "assets/beats.json" | null },
  "scenes": [
    { "id": "hook", "layout": "layouts/title-stack",             // the scene's layout pattern
      "duration": 3.5,                                           // film: seconds
      "presses": 2,                                              // deck: presses inside this scene
      "cut": "transitions/hard-cut",                             // how this scene arrives (optional when position is given)
      "position": "opening",                                     // or related | topic | climax | outro: without a cut, style.transitions.<position>
      "move": "moves/push-in" | null,                            // camera over the whole scene
      "beats": [
        { "at": 0.0, "step": 1, "slot": "headline", "fx": "entrances/rise",  /* or "style:headline" */ "text": "…", "fact": "f1",
          "params": { "side": "up", "d": 40 }, "cue": "tick" },
        { "at": 1.2, "slot": "figure", "fx": "style:figure", "value": 35, "fact": "f2",
          "emphasis": "emphasis/indicate",                       // a there-and-back move after the arrival
          "out": 3.0, "exit": "exits/push-out",                  // film: leaves at that scene-local second
          "until": 3,                                            // deck: the press that removes it
          "asset": "assets/shot.png" }                           // a path under the piece's assets/
      ],
      "say": "…"                                                 // narration or speaker note
    }
  ],
  "share": "…",                                                 // optional: the caption mm export writes (≤ 280)
  "cta": { "text": "…", "url": "…" }
}
```

A scene may carry `variants`: keyed by format, each a partial scene of `layout`, `beats`,
`move`, `moveParams` and `say` that replaces the scene's own in that format. Duration, cut and id
are shared, so every format runs the same length. The kit and the gate both read the story through
`forFormat(story, format)`; with variants, piece-scope rules run per format.
A scene may carry `cutParams` and `moveParams` (scalar bags passed to its transition and move);
a beat's `params` may hold `exit` and `emphasis` sub-bags routed to those patterns, and
`each`/`stagger` for a cascade. Param values are strings, numbers or booleans; a series
travels as a string (`"values": "3,5,8"`). A beat's `params.dur` or `params.spring` wins over the
pattern module's `dur` or `spring` field, which wins over the duration role `standard`.
A beat's `asset` reaches its slot as `data-asset`, and every `<img>` or `<video>` in the slot
without a `src` gets it as a relative `src`; mount waits until each decodes.

**Screen content.** An `asset` ending in `/` names a folder: a frame sequence
(from `mm media prep`) or a captured page (from `mm capture site`), described by its `media.json` (`kind: sequence` or `kind: page`). A
beat may also carry `screen`, a list of actions `{ do: "screen/<name>", at?, d?, step?, params? }`
on the device screen it fills (the slot's `[data-screen]`). The kit draws that screen through one
layer it owns (`.mm-screen`, `data-mm-own`, declared media): at each seek it folds the actions in
start order (film: `at` seconds after the beat arrives, lasting `d` or the module's `dur`; deck:
the press `step` after the beat's, over that press), each module's `reduce(state, p, ctx)`
returning the next state, then paints the state and lets each action under way `draw` its
overlay. A later action continues from wherever the earlier ones left the screen, in any seek
order. A sequence with no `screen/play` gets one at mount (`at: 0`, lasting the clip), so the
schedule and the fold see the same motion; `screen/play` shows its `from` frame until it starts, and
past the clip's end the last frame holds. An action counts as under way for 0 < p < 1; in a deck an
action that holds (`screen/callout`) shows its finished drawing at the rest its press ends on. The
kit lifts its layer out of the slot before restoring the slot's markup and puts it back, so
patterns' DOM is undone every seek (AXIOM 1).
A screen module may also export `paint(screenEl, state, ctx)`: the kit calls it on every seek for
each module the beat names, after its own paint, to draw state that outlives its action (an open
island: `screen/island` grows any element marked `data-island`, from the size the device draws). Sequence frames are decoded inside `settle()` (§2.2a). A folder with neither file is a kit
warning.

**Roles.** A beat's `fx` may be `style:headline`, `style:body`, `style:figure` or
`style:plate`, resolved to `style.entrances.<role>`. A scene gives `cut`, or `position`
(`opening`, `related`, `topic`, `climax`, `outro`) resolved to `style.transitions.<position>`,
or both, in which case `cut` wins. The kit, `schedule()` and the gate resolve through one
function, `resolveStory(story, style)` in `runtime/kit/schedule.js`; an unknown role throws, and
G-PATTERN-REF resolves roles and positions before it checks references.

**The first frame.** `params.instant: true` gives a beat an entrance of 0 s: it is
finished from its `at`. A film whose first scene has a beat at `at: 0` with `instant: true`
opens on that beat finished. A deck beat with `step: 0` is present at the scene's first rest
(rest 0 for the first scene; for a later scene, already there as the scene cuts in), finished,
with no animation; its `at` is ignored and it cannot carry an emphasis. The first scene may carry
a gentle idle (`move: "moves/idle-breathe"`). It is a whole number of sine cycles, so the camera is
at identity at p = 0: frame 0 is exactly the finished hook, G-HOOK holds, and the first second is
not a still card.

Rules the schema cannot express are gates: film length 20 to 60 s and deck 6 to 20 presses
(**G-LENGTH**); every `fx`, `layout`, `cut`, `move` and screen action resolves to a listed pattern (**G-PATTERN-REF**);
every `fact` id resolves (**G-FACT-REF**).

A **loop** (4 to 15 s, G-LOOP) is a film whose story says `"kind": "loop"`: a short piece that ends on its
first frame so it can repeat. `mm new` scaffolds a film or a deck; scaffold a film and change its
`kind`.

## 5. Pattern contract

Groups: `entrances`, `exits`, `emphasis` (indicate, circumscribe, spotlight: there-and-back
moves that direct the eye without changing content), `transitions`, `layouts`, `moves`, `text`,
`data`, `devices`, `sound`, `3d` (Three.js patterns; a module may declare `ambient: true`, scheduled
as a move from its arrival to the scene's end), `screen` (actions on a device screen; the module exports
`reduce(state, p, ctx)` and may export `draw(el, p, ctx)` for its overlay and `paint(screenEl,
state, ctx)` for state that persists, instead of `at()`). A `moves` module may export
`afterItems: true` to run after the entrances in a film seek (it sets its slots' own styles).
Folder `patterns/<group>/<name>/` holds:

| File | Required | Content |
|---|---|---|
| `pattern.html` | layouts, text, data, devices, 3d | a fragment with `data-slot="<name>"` placeholders; no copy. The kit always instantiates a layout's; a text, data or device module's only when it exports `fragment: true`, otherwise the module builds its own markup in `at()` |
| `pattern.css` | all visual groups | styles over `--mm-*` variables only |
| `pattern.js` | entrances, exits, emphasis, transitions, moves, data, sound, screen, 3d | `export default { name, group, params, at(el, p, ctx), dur?, spring?, fragment? }`: `p` is the eased progress the kit computes from `t` (0 to 1; a spring entrance may pass 1, except on a type layer, §6) and `ctx` is listed below; sound patterns export `{ name, group, render(ctx, at, feel, opts), durationS, anchor? }`, where `anchor: "end"` places the cue to end on its beat's landing (§9) |
| `PATTERN.md` | all | the card (below) |
| `demo/story.json` | all visual groups | the smallest story that shows the pattern, used by `mm pattern stills` |

**What each pattern kind receives.** Every visual pattern is `at(el, p, ctx)`.

| Kind | `el` | `p` | `ctx` beyond the common fields | `ctx.params` |
|---|---|---|---|---|
| entrance (`entrances/`, `text/`, `data/`, `devices/`) | the beat's slot | the entrance spring or the `enter` ease | `u`, `d`, `scene` | defaults ∪ the beat's scalar `params` |
| exit | the slot | `exit` ease over `exitRatio` × one entrance | `d`, `scene` | defaults ∪ `params.exit` if given, else the beat's scalar params |
| emphasis | the slot | `move` ease over the role `slow` (or the module's `dur`) | `u`, `d`, `scene` | defaults ∪ `params.emphasis` if given, else the beat's scalar params |
| transition | the incoming scene's `<section>` | `move` ease over the cut's duration | `from`, `to` (the outgoing and incoming sections), `u`, `d`, `scene`, `policy` (= `style.transitions.policy`) | defaults ∪ the scene's `cutParams` |
| move, film | the scene's `.mm-camera` | `move` ease of seconds through the scene | `u`, `d`, `scene`, `settle` | defaults ∪ the scene's `moveParams` |
| move, deck | the scene's `.mm-camera` | `move` ease of the press position across the scene's presses | `presses`, `scene` | defaults ∪ the scene's `moveParams` |

In a deck, `ctx.u` is `Infinity` for a beat whose press has passed. `ctx.settle` (film moves) is
the number of seconds from the scene's start to its rest, or the scene's whole length when it has
none; `end: "settle"` on a move ends it there and holds the end pose.

Common fields: `ctx.style` (the composed style), `ctx.format`, `ctx.unit` (the format's base size
in px, §12), `ctx.deck` (true in a deck), `ctx.random` (`random(seed)` seeded from the element's
selector), `ctx.boil` (which frame of a pen's shiver shows now), `ctx.afterSettle(fn)` (runs `fn`
once the seek's picture decodes are done), `ctx.seeded(fn)` (runs `fn` under a seeded
`Math.random`; `runtime/kit/README.md` documents these four), `ctx.spring(t, role)` (seconds first,
then a spring role or `{k, c, m}`; with `.settle(role)`, `.overshoot(role, t)` and `.params(role)`)
and `ctx.ease(name, p)`. A distance's unit is stated by its param: px means a pixel of the page
(every format is 1080 px on its short side); a multiple of `ctx.unit` scales with the type. A
transition that needs a node outside its two sections marks it `data-mm-overlay`; the kit removes
every such node, and every `--mm-tx-*` property a transition wrote, at the start of every seek. A
transition module with `dur: 0` is a hard cut.

**Declarations for the gate.** `data-media` on a leaf element of a pattern's
markup (no child elements, no text) declares a media slot; the pixel test masks that slot's content
box, and a canvas is masked only inside one. Piece code may not declare media: `data-media` or
`dataset.media` in a piece's JS or HTML fails G-LITERAL's static half. `canvasText: true` on a
pattern module lets that pattern call `fillText`/`strokeText`, and the pattern then answers for the
text it draws; without it, canvas text fails G-LEGIBLE. No library pattern needs either today.

**Type stays legal on every frame.** An entrance that scales or moves
type bounds its travel from the layout geometry, never from the frame it happens to be drawn in:
`punch` and `slam` cap their start scale (and `slam` its drop) so the text's ink, scaled about the
pivot, stays inside `--mm-safe` on every frame; `drop` caps its fall at the free room above the
element (down from the lowest filled slot or kept element over it, or the safe margin), so a plate
never covers its headline. `runtime/kit/room.js` (`maxScale`, `roomAbove`, `inkOf`, `boxOf`,
`safeArea`) reads layout offsets, so no transform feeds back and the bound is the same at every
instant. A counted figure shows its unit only on the landed number: `entrances/count` and
`data/counter` lay out the prefix and suffix but keep them invisible until p = 1 (param
`unit: land`, the default; `always` keeps the unit visible from the first frame), through `count(…, { hold: true })`.

**Transitions never double-expose type.** `transitions/zoom-through` is two halves that
never share a frame: until the middle of the cut only the outgoing scene is drawn, growing to
1 + `depth` and dissolving to nothing; from the middle only the incoming scene is drawn, growing from
1 / (1 + `depth` / 2) to rest and fading in. The fading section drops its own canvas fill while it
fades, so no canvas-on-canvas box composites a level off.

The card has exactly these sections, in order, each non-empty: **Purpose** (one sentence), **Use
when / Do not use when**, **Params** (table: name, type, default, meaning), **Style variables
consumed**, **Legibility and rest notes** (what the pattern guarantees at `p = 1`), **Provenance**
(source, licence, what changed; or "original"), **Known limits**. `scripts/pattern-lint.mjs`
enforces the folder, the sections, the literal ban and that the demo story validates
(**G-PATTERN-CARD**, **G-PROVENANCE**); photographing the demo is `mm pattern stills`, not the
lint. An incomplete folder is not listed by `mm pattern list` (AXIOM 4), which is the lint's own `list()`.
`mm pattern lint <name>` lints one pattern (`group/name`, or a bare name unique across `patterns/`; an
ambiguous or unknown name exits 2). G-PROVENANCE matches a card's source exactly (normalised,
parenthetical notes removed) against a name in one of PROVENANCE.md's source tables, never a pattern
id from the credits table or a substring.

## 6. Kit grammar

Markup attributes the kit reads. The kit writes the beat attributes onto a slot from the story;
a layout fragment carries `data-slot`, `data-each`/`data-stagger` and the audit flags. `data-fx`
written directly in layout markup is not read: every arrival comes from a beat.

| Attribute | Means |
|---|---|
| `data-fx="<group>/<name>"` | entrance pattern (default `entrances/fade`), written by the kit from the beat (never `style:<role>`) |
| `data-at="<s>"` | start, seconds after the scene begins (film) or after its press (deck) |
| `data-step="<n>"` · `data-until="<n>"` | deck: the press that brings the element in (default 1; 0 = present at the scene's first rest) · the press that removes it |
| `data-out="<s>"` · `data-exit="<group>/<name>"` | film: removed at that scene-local second, with that exit |
| `data-dur="<role>"` | duration role from the style (`quick`, `standard`, `slow`, `hold`); a numeric literal is counted by **W-DUR-LITERAL** |
| `data-each="<fx>"` · `data-stagger="<s>"` | group entrance, children in turn; arrivals stagger, departures never do |
| `data-p-*` | pattern params (`data-p-side`, `data-p-d`); cast per the card's table |
| `data-micro` | exempt from the body floor, held to the micro floor (§12) |
| `data-over` · `data-bleed` · `data-keep` | overlap intended · may cross the frame edge · audit at rest despite no entrance |
| `data-hook` | written by the kit on the first scene's `<section>`: the hook. Inside it the kit raises `--mm-headline-scale` by one step (1.25) |
| `data-align` · `data-p-align` | on a layout root · on a slot: `left` or `center`, overriding `--mm-align` for the scene |
| `data-mm-overlay` | a node a transition added outside its scenes; removed on every seek (§5) |

Each scene is a `<section data-scene>` holding one `.mm-camera`, which holds the layout. Camera
moves run on `.mm-camera`, in films over seconds and in decks across the scene's presses. An emphasis appears in the schedule as a `move` event whose pattern is `emphasis/*`.

Functions the kit exports to `piece.js` and `pattern.js`: `spring(t, {k, c, m} | {bounce,
period})` (closed-form damped spring 0→1, under-, critically- and over-damped branches; settled
when within 0.005 of 1, and `spring.settle(params)` returns that time so layout can depend on it;
`spring.overshoot(params, t)` and `fromReactSpring({tension, friction, mass})` convert),
`track(t, keys, params)` (stacked springs over `[[time, value], …]`), `ease(name, p)`,
`random(seed)`, `fit(el)` (shrink type to its measure after fonts load), `count(el, from, to, p,
opts)`, `scene(id)`, `format()`. All are pure in `t` or in their inputs. Springs are never
integrated numerically. `spring.settle` always returns: damping is floored at ζ = 0.01
for both parameter forms. A **type layer** (a beat with `text` or `value`, or a `text/` or
`data/` pattern) never overshoots: the kit clamps its entrance progress at 1, and `report()` gives it
overshoot 0 (§15).

**Timeline algebra** (`runtime/kit/schedule.js`, pure, shared with the gate). Every node is a
measured duration `d` and a function of local time `u ∈ [0, d]`, clamped outside. Primitives:
`clip(d, f)`; `seq(a, b, …)` with cumulative starts; `par(a, b, …)` with duration `max`;
`delay(x, a)`; `stagger(each, items, {from: first|center|last|index, ease})` as a `par` of delays;
`overlap(a, b, o)` as a `seq` with a negative gap, for clips inside one scene; `transition(a, b,
pattern, d)` as `b` whose first `d` seconds also draw `a` under it, with the transition's progress
driving the pattern over both. A beat is a `par` of staggers, a scene a `seq` of beats, a film the
plain `seq` of its scenes (each transition lives inside its incoming scene and adds or removes no
time, below), a deck press a segment whose clock is a press instead of seconds. Durations are measured in a first pass (springs contribute their
settle time), then every instant is evaluated as `t = frame / fps`. Labels resolve to absolute
offsets in the measuring pass. Nothing is replayed to reach an instant.

**Film transitions.** In a film a transition plays during the first `d` seconds of the
incoming scene, over the outgoing scene, which stays drawn beneath it; scene durations therefore add up exactly to the running time, and the transition borrows those seconds from both scenes instead of adding to or shortening the film.
A hard cut takes 0 s. The transition module is called `at(incomingSection, p, ctx)` with
`ctx.from` and `ctx.to` (§5).

**Report output.** `window.mm.report()` returns `{t, format, elements}`, one element per
managed item and per `data-keep` element: `{selector, progress, box: {x, y, w, h}, fontPx, color,
bg, overshoot, scene, visible}`. A cascade reports its parent only; a kept element reports
progress 1 and overshoot 0; a type layer reports overshoot 0. The gate's DOM rules read it.

**Schedule output.** `schedule(story, style, {patterns, each})` returns, for a film,
`{kind, duration, scenes, events, rests, holds, items, timeline, warnings}` and, for a deck,
`{kind, presses, pressLengths, scenes, events, rests, items, timeline, warnings}`, where
`scenes[] = {id, start, end, cut: {pattern, d}, position, move}` and `holds[] = {scene, from, to}`.
The kit exposes the same object as `window.mm.schedule`.

**Rests.** A film scene's rest is the instant its cut, every arrival and every emphasis in
it have ended; it exists if that instant is before the scene's end (for the last scene, at or
before), and its hold runs from the rest to the scene's end. Exits do not move the rest.

**Rounding.** Every schedule time (`t`, `d`, `start`, `end`, rests, holds, a deck's `at` and
press lengths, a spring's settle time) is rounded to the millisecond; a film's `duration` equals the
sum of its scene durations exactly.

## 7. Gates (`mm check`)

Each id is one file, `scripts/check/<id>.mjs`, listed in `IDS` in
`scripts/check.mjs`; `scripts/check/_lib.mjs` (probe, text walk, boxes) and `_pixels.mjs` (ΔE and
region labelling) are shared helpers, not rules. G-PATTERN-CARD and G-PROVENANCE call
`scripts/pattern-lint.mjs` on the patterns a piece references. §14 maps every file to its test
and its negatives.

| Id | Checks | How |
|---|---|---|
| G-TIME | every frame is a function of `t` (§2.3, §2.4) | static grep (names, realm and SMIL markup, custom-property durations); runtime recorder (no call from served code, realms and threads refused, no child realm); computed styles at three instants |
| G-DETERMINISM | same `t`, same pixels (§2.5) | two page loads, one in order and one in reverse; three instants plus one per scene; PNG byte compare |
| G-LOCAL | everything travels with the piece (§2.6) | static scan of URLs and relative roots; every frame or tile a prepared asset's `media.json` names exists; `document.fonts` all `loaded`; at every rest, every visible text element (`::before`/`::after` included) is painted only by web fonts (CDP `CSS.getPlatformFontsForNode`, no `isCustomFont: false`) |
| G-LITERAL | no literal colour, family, size, space, radius, duration or easing in piece or pattern CSS; computed colours ∈ palette; computed family is a style family; rendered pixels ∈ palette | regex on CSS (`#hex`, `rgb(`, `hsl(`, `oklch(`/`oklab(`/`lab(`/`lch(`/`hwb(`, `color(`, `color-mix()` of a literal, CSS named and system colours, `font-family:` not `var(`, a family list in a custom property, `ms`, `cubic-bezier`, non-zero `px` in padding/margin/gap/border-radius) and no `data-media` in piece code; computed sampling at rests (an alpha of a role passes); the first computed family of each visible text element ∈ `style.type.*.family`; pixels at each rest: a pixel is off when it lies farther than **ΔE 2** (CIE76) from every role and every sRGB blend of two roles. FAIL when more than **0.5 %** of the stage's pixels are off, or when one **4-connected region of off pixels exceeds 256 px**. Masked: only the content box of media (`img`, `video`, `embed`, `iframe`, SVG `image`, an `object` without fallback content, and a leaf a pattern declares `data-media`; a `canvas` only inside one). Masked pixels are read from the same frame shot with that media hidden. A `background-image` never masks. Calibration: the four goldens peak at ΔE 1.13 (margin 0.87); the presets' palette sheet (`fixtures/negatives/_palette/`) peaks at 0.30 % off and a 99 px region, all antialiased ink over the highlight tint |
| G-PLACEHOLDER | no `TODO`, `lorem`, `[…]`, `XXX`, `{{` in rendered text or in a shipped SVG's text | text walk at every rest, `::before`/`::after`/`::marker` included; `<text>` and `<foreignObject>` of the piece's `.svg` files and of `data:image/svg+xml` URIs, with every entity form resolved first (predefined names, decimal and hex references, DTD-declared entities, CDATA) |
| G-LEGIBLE | at every rest, each text element's rendered size ≥ its floor (§12); `data-micro` ≥ micro floor; no text the gate cannot measure | computed size × the scale its transforms give it on screen (screen box over untransformed box, the smaller axis; SVG by its screen CTM); `::before`, `::after`, `::marker`, and `::first-letter`/`::first-line` when they restyle their host. No shadow root: static `attachShadow`/`shadowrootmode`; the recorder refuses `attachShadow`; CDP `DOM.getDocument({ pierce: true })` finds no open or closed root in the stage. No canvas text (`fillText`, `strokeText`, static and recorded) unless the drawing pattern declares `canvasText: true` (§5) |
| G-REST | deck: at every rest no element has progress strictly between 0 and 1; film: at each scene's last instant likewise | kit reports progress per element |
| G-HOOK | film: frame 0, deck: rest 0 shows the first scene's headline finished | the headline is the first scene's `headline` slot, else its earliest beat; the kit reports progress 1 (`params.instant: true` / `step: 0`) and at least 3 % of its text box differs from the colour behind it by more than ΔE 2 |
| G-EDGE | at rests, no text box crosses the safe margin (§12) unless `data-bleed`; with `story.platform` (`reels`, `tiktok`, `shorts`; 9x16 only) no text enters the bottom 500 px or the right 120 px either | DOM boxes; `::before`/`::after`/`::marker` text has its own box (CDP `DOM.getBoxModel`); a host and its own generated text, `::first-letter` and `::first-line` count as nested. SKIP when no text is present at any rest; a PASS carries `{ instants, texts }` |
| G-OVERLAP | at rests, no two text boxes intersect unless one carries `data-over` | DOM boxes; `::before`/`::after`/`::marker` text has its own box; a host and its own generated text, `::first-letter` and `::first-line` count as nested. SKIP when no text is present at any rest; a PASS carries `{ instants, texts }` |
| G-DEAD | film: no window of 4 s (*provisional*, from published motion-studio practice) without an arrival, departure, cut or move keyframe | from the schedule |
| G-QUIET | film: ≥ 2 s (*provisional*, from the author's practice) between the last arrival and the end; deck: last press introduces at most one element | from the schedule |
| G-LENGTH | film 20–60 s; loop 4–15 s; deck 6–20 presses (*provisional*) | story |
| G-LOOP | a story of kind `loop` ends on its first frame (`autoReturn: true` has the kit build the return: over the last min(1.2 s, 15 %) before the last exported frame, each beat of the last scene that arrived with an entrance plays it back to p = 0, last arrival first, never before the scene rests; instant beats stay): the frames at 0 and at the last exported instant differ in at most 0.2 % of pixels by more than 6 levels (*provisional*) | rendered pixels |
| G-END | deck: `goto(presses + 1)` changes nothing | render compare |
| G-PATTERN-REF · G-FACT-REF | every reference resolves (§4). G-PATTERN-REF also fails a screen action whose mark (`at`, or scroll `to`) the screen it acts on does not carry, naming the beat and the mark, and WARNs on any kit or schedule warning that starts `screen: ` (a play `rate` ≤ 0, a deck screen `step` past its scene, screen actions on a slot with no `[data-screen]`, a laptop menu of more than 5 items). G-FACT-REF also fails when a fact marked `sample: true` is cited by a beat visible at a rest where no visible element with `data-sample` and text has area inside the stage; a mark is looked up on the screen the kit shows when the action starts (a swap changes it at its end; `cut` at once) | story vs listing; `media.json` on disk (`screenIssues`, shared with the kit); DOM at rests, per format |
| G-PATTERN-CARD · G-PROVENANCE | §5 | pattern lint |
| G-LOUD | when audio exists: integrated −14 LUFS ± 1, true peak ≤ −1 dBTP (*provisional*, platform norms) | ffmpeg `ebur128` on the MP4s that ship; SKIP when they have no audio stream (a stale `out/mix.wav` is not measured beside them) |
| W-FADE-ONLY | more than 70 % of entrances are `fade` (ban `fade-only`) | schedule |
| W-READ | a scene's words × 0.3 s + last arrival > scene duration (*provisional*, from the author's practice); or a line settled (end of its entrance to its `out` or its scene's end) shorter than 0.8 s for 1 to 3 words, else max(1.2 s, 0.3 s × words) (*provisional*, brag); a line still arriving at its scene's end is G-REST's | story, schedule |
| W-CUE | a sound cue more than 40 ms from the nearest beat when a grid exists (*provisional*) | cues vs `beats.json`. Known limit: the gate's schedule does not load `sound/` modules, so it reads an end-anchored cue at its beat's arrival, not where the kit and the mixer place it (§9) |
| W-DUR-LITERAL | numeric `data-dur` | markup |
| W-BAN | detectable bans: first scene is one centred text block over a gradient canvas; text smaller than caption inside the four corner zones; a full-frame border element | DOM at rests |
| W-SUB | export with `--sub` > 1 while a text element travels more than 4 px per frame | every frame at the export fps in the page, the largest move of a visible text element's box between consecutive frames; `--sub 1` never warns; a deck is SKIP |
| W-CONTRAST | at rests, body text below WCAG 4.5:1 against its sampled background, or display text below 3:1 (*provisional*, WCAG AA) | computed colours at rests; `::before`/`::after` included; a colour pair it cannot parse makes a clean result SKIP (partial). A text box with no background of its own is also measured against the rendered pixels under it, shot with every text transparent (5th percentile; the lower ratio counts) |
| W-PACE · W-HOLD | arrivals per 10 s outside the motion style's band (a screen action counts as an arrival); a rest shorter than `holdMinS` (*provisional*, from the motion style) | schedule vs style; W-PACE is SKIP for a film under 5 s, where no 10 s window is judged |
| W-EMPTY | a film run of more than 6 frames (30 fps) whose ink, the pixels farther than ΔE 2 from the canvas colour, is under 0.5 % of the frame | frames at quarter scale; every third frame first, candidates frame by frame; a deck is SKIP |
| W-ENTRANCE | a visible element inside a scene with neither an entrance nor `data-keep` | DOM vs schedule |
| W-STAGGER | a `data-each` cascade longer than `stagger.capS`, or a film scene's first arrival earlier than 0.1 s after its cut settles (*provisional*, hyperframes and `emilkowalski/skills`) | schedule; the film's first scene and a scene that arrives by a hard cut are exempt; an `instant` beat at the scene's start is revealed by the cut, not an arrival, so the first arrival is the first beat that animates |
| W-AMBIENT | an idle move whose amplitude exceeds 20 % of the scene's primary travel, or text scale oscillating beyond ±5 % (*provisional*, hyperframes layers) | kit report over a rest; a moving scene with no rest, or one whose entrances do not travel, is not measured: SKIP (partial). A deck is SKIP: the gate does not measure camera moves in decks yet |
| W-CAPTION | two caption groups visible at once, or a group outside `motion.captions.wordsPerGroup` | DOM at sampled instants; without that range (not yet in the motion schema), a clean result is SKIP (partial) |
| W-OVERSHOOT | overshoot above `motion.overshootMax`; type and opacity never overshoot (§15) | declared: every `motion.spring` role (`spring.overshoot`), and the `type` role ≤ 0.1 %; reported: the kit's per-element value; measured: each entrance sampled 17 times from what its pattern writes, so text past its resting place by more than 0.5 px, text scaled past rest by more than 0.5 %, or opacity dipping more than 1 % after reaching full warns |
| W-MIX | sound: more than two cues sounding at once, a cue retriggered within 45 ms, cue peaks outside 6–8 dB above the bed, cues per 10 s outside the style's band, or a cue with no visible event (§9) | cue list vs schedule, `ebur128` on stems; a clean result with an unmeasured sub-check (no `out/cues.json`, a cue module missing, or no bed in the mix) is SKIP (partial) |
| W-ASK | the style still lists fields a capture could not measure (`ask`) | the composed style's `ask`; WARN while it lists anything, PASS when it is empty or absent |

Report: `out/check.json` `{ spec, when, piece, rules: [{ id, status: PASS|FAIL|WARN|SKIP, evidence: { instant, selector, frame } }] }`,
where `spec` is this document's version (`SPEC_VERSION` in `scripts/lib/report.mjs`)
plus a human summary that ends "N rules failed" or "All rules passed". Exit codes: `0` all G pass, `1` any G fails, `2` setup or usage error. A
gate that cannot run (no audio, no deck) reports `SKIP` with a reason (AXIOM 8). A rule that ran only
part of its measurement never reports PASS: a finding still makes it WARN or FAIL; a clean
but incomplete result is `SKIP` with `evidence.partial: true` and a reason that starts with
`partial:` and names what was not measured. A page without `.mm-stage` is a setup error (exit 2).
`mm check` resolves the story (`resolveStory`) before any rule runs; `ctx.story` is the resolved story
and `ctx.rawStory` the story as written, on which contract validation runs.

Heuristics (applied by the skill, checked by the reviewer, named in the handover): **H-HOOK**
strongest image first, never a logo; **H-ONE** one idea per press, a figure alone in its press;
**H-INFO** every movement carries information; **H-STILL** stillness after a big moment;
**H-FILL** content centred between the header row and slightly above mid-frame, never pooled low;
**H-FACTS** every number cites a story fact with a source; **H-FACES** no face without consent;
**H-LAST** the final rest is the line to remember; **H-REF** when a reference is given, take its
grammar and never its content; **H-SOUND** the largest motion event of each scene carries a cue.

## 8. CLI

`scripts/mm.mjs` is run as `node scripts/mm.mjs <verb>` or `npm run mm -- <verb>`.

| Verb | Does | Writes |
|---|---|---|
| `doctor` | verifies Node ≥ 22, Playwright Chromium, ffmpeg ≥ 6; never installs | report |
| `new --kind film\|deck --style <preset\|path> (--id <id> \| --dir <folder>)` | scaffolds `pieces/<id>/`, or `<folder>` (any new folder under the repo root; `--id` then defaults to the folder name), from `runtime/skeletons/<kind>/`, copies the style in. `piece.js` imports the kit by a relative path computed from where the piece lives | piece folder |
| `serve [piece] [--port N] [--format 16x9\|9x16\|1x1\|4x5] [--t S] [--press N]` | local preview with play clock, keyboard, `?t=`/`?press=` | URL |
| `stills [piece] [--format F]` | every rest, every mid-entrance, a 12-frame strip through each move; a contact sheet; a phone-width sheet | `out/stills/`, `out/contact.png`, `out/phone.png` |
| `check <piece> [--format F] [--sub N] [--quiet] [--json] [--progress]` | §7; the piece is required (one per run); `--sub` is the export setting W-SUB judges; `--progress` prints each format and rule as it starts, on stderr. The report names the story `version` and the `formats` it checked, and `complete: false` on exit 2; it is written whole when the run ends, so an interrupted run (exit 130, 143, 129) leaves the previous report | `out/check.json`, exit code |
| `export [piece] [--fps 30] [--sub 1] [--formats …] [--force] [--prove] [--gif] [--gif-width 540] [--workers N]` | film: MP4 per format, drawn by N pages in parallel (default half the cores, 1 to 4, at most 16) that each take the next run of up to 15 frames and hand them to one encoder strictly in order; the frames, the encoded streams and the MP4 bytes equal a one-page run (§16.6) (H.264 yuv420p CRF 16, with a silent AAC track whose handler is `silent` until `mm sound` muxes the mix; G-LOUD ignores it), a looping GIF per format with `--gif` (one palette, no dither, 15 fps at most), `poster.png`, `loop_check.mp4`; deck: standalone `out/deck/` folder, `handout.pdf` (one page per rest, set in the style's bundled faces; each scene's note once), `walkthrough.mp4` (starts on rest 0; each press plays its transition at its real length, then its rest is held 2 s); both: `share-copy.txt`, one caption: the story's `share`, else the first scene's headline, the last scene's headline (each a sentence, not repeated) and the call to action's link, with launch clichés warned in `out/export.json`. `--sub` defaults to 1; above 1 the exporter asks the gate's W-SUB hook and records a warning in `out/export.json` | `out/` |
| `beats <track.wav> [--bpm N] [--out assets/beats.json]` | beat grid: declared BPM with a measured downbeat offset, or an energy-onset estimate (*provisional* method) | `assets/beats.json` `{ bpm, beats[], downbeats[], hits[], strong[] }`; `strong[]`: every beat and onset scored 0.45 onset + 0.25 local contrast (onset minus the ±0.5 s median) + 0.20 RMS + 0.10 energy below 180 Hz, each over its 98th percentile (onset and contrast over the candidates), kept at 0.45 or more, 0.18 s apart, at most 64, in time order `{ t, intensity, kind: beat \| onset }` |
| `sound [piece] [--formats 16x9,9x16] [--patterns dir]` | renders cue presets through an OfflineAudioContext in the Playwright page, mixes with the track in ffmpeg, two-pass `loudnorm` to the style's target | `out/mix.wav`, `out/cues.json`, final MP4 muxed |
| `pattern list` · `pattern lint [<group>/<name> \| <name>] [--json]` · `pattern stills <group>/<name> [--style preset\|path\|all] [--format F] [--patterns dir]` | §5. `list` is pattern-lint's own list of complete patterns; `lint <name>` lints one pattern (`rise` or `entrances/rise`) | listing, lint report, `patterns/<…>/demo/out/` |
| `release-check [--root <dir>] [--only <sweep,…>] [--json]` | the pre-publication sweep, exit 0 clean, 1 findings, 2 setup. Sweeps: **R-BRAND** (the word lists, below), **R-SECRET** (key and token shapes, private keys, `api_key=`/`password=`, `.env`/`.pem`/`.key`/`.npmrc` files), **R-PATH** (absolute home-folder paths of macOS, Linux and Windows user folders, and home-relative paths (a tilde, then Downloads, Documents, Desktop, Library, Pictures, Movies, Music, code, `.claude`, `.config` or `.ssh`); the shared tool caches such as `.cache` and `.npm` are not flagged), **R-URL** (`http(s)` URLs in `runtime/`, `patterns/`, `pieces/`; XML namespaces and licence texts excepted), **R-LICENSE** (`LICENSE` is the Apache-2.0 text and `package.json` says Apache-2.0), **R-FONT-LICENSE** (every folder of font files holds an SIL OFL licence), **R-PATTERNS** (every pattern passes lint), **R-GOLDEN** (no `golden-*` piece's `out/check.json` in `pieces/` holds a FAIL; a piece with no report is not reported, and with no report at all the sweep is SKIP, since `out/` is never in git and a fresh copy has none), **R-STRATEGY** (no strategy file is tracked: `DECISIONS`, `LESSONS`, `PHILOSOPHY`, `CHANGELOG`, `STATUS` or `CHRONICLE` `.md` anywhere, nor anything under `docs/evals` or `docs/plans`; planning and decision records are not kept in this repository), **R-HISTORY** (public files state rules, not how they were decided. Flagged in tracked text: decision and finding ids, milestone, goal, plan and design labels, dated notes in Markdown, scripts, CSS, HTML, YAML and shell, version changelog blockquotes and spec-section-with-version citations, narratives of how a fix was reached or of lessons learned, pointers to private files or records (`docs/private/` other than `brand-words.txt`), and philosophy framing. `runtime/vendor/` and `fixtures/release/` are exempt, and `NOTICE` may carry upstream dates and wording), **R-EMAIL** (no e-mail address in tracked text except `example.com`, `example.org`, `example.net`, `*.example` and no-reply addresses; licence texts exempt), **R-DUP** (no tracked file or folder named like a Finder or iCloud duplicate: a space, then a number, `copy` or `copy N`, before the extension: `name 2.ext`, `name copy.ext`, `name copy 2.ext`, a folder `rise 2/`) | report |
| `brand capture` · `motion capture` · `style compose` · `style export-designmd` · `skill new` | the three modes (§13) | style halves, composed styles, a `DESIGN.md`, brand skills |
| `media frame <png> --name <n> [--piece <dir>] [--key]` | installs a device frame image you own (a transparent screen, or a flat screen colour with `--key`), and measures its screen hole | `<piece>/assets/frames/<n>.png`, `<n>.json` |
| `media prep <file> --name <n> [--piece <dir>] [--fps 30] [--fit phone\|laptop\|<W>x<H>] [--trim <a>-<b>] [--quality 90]` | decodes a screen recording (any container or codec ffmpeg reads; display rotation applied), resamples it to a constant rate and fits it inside the screen box it will be shown in, never upscaling (phone 660×1430, laptop 1600×1000; without `--fit` the long side is capped at 1600 px); a `--trim` that starts past the clip's end exits 2 before the old asset is touched; JPEG frames, since WebP encoders are not on every ffmpeg | `<piece>/assets/<n>/f00001.jpg…`, `media.json` (`kind: sequence`, `fps`, `frames`, `w`, `h`, `duration` = frames / fps, source name and SHA-1) |
| `capture site --url <url> --name <n> [--piece <dir>] [--device phone\|laptop\|browser] [--mark "<Label>=<selector>"]… [--hide <selector>]… [--wait <selector>] [--quality 90] [--max-height 24000]` | opens the one URL given at the device viewport (phone 390×844 at 3x, laptop 1440×900 at 2x, browser 1280×800 at 2x), hides cookie banners and `--hide` selectors, scrolls once so lazy images load, and captures the page, up to `--max-height` css px (24,000 by default, so an infinite page ends) at JPEG `--quality` 90, as JPEG tiles of at most 16,000 device px. Consent banners are hidden only when they are fixed or sticky overlays. A mark that matches nothing exits 2; a mark inside a fixed or sticky element is flagged `fixed: true` and warned about. A file:// page is recorded by its repository path (or its name), never an absolute local path. A capture is a one-time act (§13) | `<piece>/assets/<n>/page-N.jpg`, `media.json` (`kind: page`, viewport, height, tiles, marks in page css px, url, date); `overlays`: each top-level fixed element, and each sticky one with a px `top`, that is not see-through and has area in the viewport, as its own picture with `x`, `y`, `w`, `h` at scroll 0, `position` and sticky `top`. The screen layer draws them pinned (a sticky one scrolls until it reaches its `top`), and a mark inside one carries `overlay: i` and stays in viewport coordinates |
| `review [piece] [--no-stills]` | builds `out/review.html` from the rounds in `direction-log.md` and the stills, strips and last frames of each round (§11) | `out/review.html` |
| `studio <piece> [--port N] [--open]` | the studio (§16): the piece as a timeline on a local page that writes edits back to `story.json`, adds or removes formats, and exports (the gate, then `export`, then `sound` when asked); `--open` opens the page in the default browser (`open`, `xdg-open`, `start`; a failure to open is a note, never an exit); runs until stopped | URL; edits to `story.json`, `out/studio/`; Export: what `check`, `export` and `sound` write under `out/` |
| `timeline <piece> [--format F] [--json] [--plan] [--who NAME] [move\|trim\|out\|set\|apply\|undo\|check\|selection …]` | the studio's timeline and its edits for agents (§16.4); a refusal exits 2 with its hint | the model, a diff, a receipt; edits to `story.json` |

Every verb and subverb answers `--help` (or `-h`) with its usage line and exits 0. An unknown flag
prints the usage line and exits 2; a usage mistake never prints a stack. The usage lines live in
`USAGE` in `scripts/lib/cli.mjs`; the rows above follow them.

`mm --version` (or `-v`) prints the release. A usage mistake is one line, `mm: <message>`, and exit
2, never a stack; `MM_DEBUG=1` adds the stack. `stills`, `export`, `review`, `sound` and `serve`
take an optional piece (the current directory when omitted). `mm sound --formats` must name
formats the story ships. `mm beats` on a missing or undecodable input exits 2. The servers (`serve`,
`studio`) answer only to `localhost`, `127.0.0.1` and `[::1]` with their own port (any other
`Host` is 403), refuse `.git`, and send `X-Frame-Options: SAMEORIGIN` and
`frame-ancestors 'self'`; `?piece=` takes a plain repository folder path only. The network
captures (`capture site` and `brand capture` with an http(s) URL) run Chromium with its sandbox
on.

Environment variables: `MM_TIMEOUT_SCALE` (default 1) multiplies the page-ready and slow-frame
waits, for a slow or busy machine; `MM_WORKERS` caps the default number of `mm export` workers;
`MM_NO_SANDBOX=1` turns off the Chromium sandbox of the network captures, for a container that
runs as root; `MM_DEBUG=1` prints the stack of a failure.

`release-check` reads two word lists, one extended regular expression or plain word per line,
case-insensitive, `#` for comments: `contracts/brand-words.txt` (shipped, generic patterns) and
`docs/private/brand-words.txt` (git-ignored; when absent the report says so and only the shipped
patterns run). A line with no regular-expression syntax is a whole word (`zeta` does not match
`zetabyte`); a line starting `@runtime ` applies only under `runtime/`, `patterns/`, `pieces/`.
"Shipped" means `git ls-files` when `--root` is a repository top level, otherwise every
file under it; binary files are skipped; `fixtures/release/` (the sweeps' own negative corpus, one
folder per sweep) is never swept.

Export refuses to run while `check` fails, did not finish, checked another version of the story or
did not cover a format it is asked for (exit 1), unless `--force`, which stamps the MP4's metadata
comment with `UNCHECKED`. One export of a piece runs at a time: `export` and `sound` hold
`out/export.lock` (a second exits 2 with one line; a lock whose process is gone is broken), and
while it is held every write through §16.2 is refused. A story that changes during the render
leaves `out/` as it was (exit 1). The poster and loop check are frames of the story's first format,
written only when that format is in the run. Verbs that take a piece (`stills`, `export`, `review`, `serve`)
stop with exit 2 and one line when the piece's entry module imports a relative path that does not
exist (a moved piece): `piece failed to load: <file> imports "<spec>", which resolves to <repo-relative path> and is not there`.

## 9. Sound

Cue presets are sound patterns, named by the visible event they mark: `tick` (a small
arrival, 40–90 ms), `press` (a deck press or a button), `swipe` (a transition), `step` (progress
advancing), `hit` (a slam, a figure landing), `riser` (the second before a climax), `success`,
`complete` (an end card, about 0.6 s), `bed` (a quiet loop under a held rest). Each is a short
synthesis in `render(ctx, at, feel, opts)` where `feel` comes from `sound.palette` (`soft-ui`,
`percussive`, `cinematic`, `none`); a style may instead point cues at CC0 samples shipped in the
piece. A story beat may name a `cue`; the kit's schedule places it at the beat's arrival instant or,
when the sound pattern declares `anchor: "end"`, so that it ends on the beat's landing (the arrival
plus its entrance; for a cascade, its last child's) and starts `durationS` before it, never before 0. The kit reads `durationS` and `anchor` from `sound/<cue>/pattern.js`; the cue event
carries `t`, `d` and `anchor`. Cues are then snapped to the nearest grid beat when `audio.beats`
exists (W-CUE reports the drift before snapping). Rules the gate reads: at most two cues sound at once; a cue retriggers no sooner than
45 ms; cue peaks sit 6–8 dB above the bed; cues per 10 s stay within the motion style's band; a
cue marks a visible event or does not exist. A `track` is used unchanged; `bpm` may be declared
when known. Mixing is ffmpeg: `adelay` per cue, `amix` with normalisation off, bed at −6 dB
under the track, `aresample=48000`, two-pass `loudnorm` to `sound.loudnessLufs` with true peak
−1, padded or trimmed to the exact picture length. When the trial AAC encode measures more than 0.5 LU under target or peaks above −1 dBTP, a second stage runs: pre-gain, a 4× oversampled `alimiter` at −1.5 dBTP, then a measured linear gain to target, repeated with a lower ceiling while the AAC peak overshoots; every attempt is recorded in `out/cues.json` under `loudness.attempts`. Music composition is out of scope (a named gap).

Known limits: the gate's schedule does not load `sound/` modules, so
W-CUE and W-MIX read an end-anchored cue at its beat's arrival while the kit and `mm sound` play
it ending on the landing, and the mixer snaps the cue's start, not its end, to the grid. Nothing in
the story or the style decides when a `bed` is laid, `mm sound` laid none under the golden films,
and W-MIX's peak sub-check therefore stays unmeasured (SKIP, partial).

## 10. Deck mechanics

A press is the unit. `data-step` elements of the current scene arrive on their press; when a
scene's presses are exhausted, the next press cuts to the next scene with its `cut` pattern. Space,
`→`, `PageDown` and `Enter` advance; `←`, `PageUp` and `Backspace` go to the previous rest, never
to a mid-entrance. The URL hash carries the press; arriving by hash draws the rest without
replaying. Idle motion (`moves/idle-*`) is slow and bounded so a held pose lives without competing
with the voice. The handout prints one rest per page with the scene's `say` as notes.

Rest 0 is the first layout before any press, and never animates; beats with `step: 0` are on it. A press lasts as long as the longest cut, arrival, emphasis or exit it plays; a press
that plays nothing lasts 0 s (under a camera move, `mm serve` then jumps the move, a known
limit). A camera move in a deck takes its progress across the scene's presses.

Known limit: a slot that has not arrived takes no room on a deck rest, so a
press re-centres what is already there (a deck's figure moves up as its headline arrives).
Every rest is finished, but such a press is a jump, not a move.

## 11. The skill's workflow (`skill/motion-machine/SKILL.md`)

Two authorities share a production. The **director**, a person, owns taste: what the piece says, how
it looks and moves, and when it is finished. The **gate** (`mm check`, §7) owns measurement. The agent
that follows the skill owns neither. It prepares what the director needs to answer, keeps the gate
green, and writes the answers down.

A piece goes through seven rounds, always in this order. Round N closes at Gate N, and the agent
opens round N+1 only after the director has answered round N. A short piece (20 to 30 s) may take
two rounds in one reply; the log then keeps both headings and names the sharing in the second.

| Round (gate) | The agent brings | The director answers | Written to |
|---|---|---|---|
| 1 Brief | the brief restated; every fact with its source; the formats; a reference, opened and measured before anything is said about it | purpose, formats, the one thing to remember, which facts may appear | log rows 1.k |
| 2 Treatment | two or three named directions, each a paragraph with its list of beats and different in structure, not only in colour; the agent's pick in one line; the copy and the arithmetic of the durations | one direction, a mix of several, or a request for new ones | `story.json`; rows 2.k |
| 3 Style | a `style.json` (preset, composed halves, captured half; §13); the beat grid from `mm beats` or a declared tempo; where cues fall | the style and the cue plan | `style.json`, `assets/beats.json`; rows 3.k |
| 4 Style frames | `mm stills`: every rest and mid-entrance in every format, the strips, the contact sheet and the phone sheet. Nothing moves yet | each still, one at a time; no motion is built on a still that is not signed | rows 4.k |
| 5 Animatic | the whole piece at low resolution (`mm export --fps 15`): final timing, unfinished surface | pace, holds and cuts | rows 5.k |
| 6 Cut | the full gate run (`mm check`, `mm export --prove`, `mm sound`, `mm check`, `mm review`); each warning that remains, with its reason; the ledger re-walked | lock | rows 6.k |
| 7 Deliver | every format exported, with the poster, the loop check, the contact sheet, the mix and the review page; the handover | acceptance | rows 7.k; `handover.md` |

**Whose call.** A call that changes how the piece feels is the director's: the agent renders the
candidates, shows them side by side and records which one was chosen. A call that the director hands
over is logged with who made it and on what authority. A failing rule is not a taste call: the agent
fixes the cause, and the log row names the rule, the measurement against its threshold and the ways
the fix was weighed. A defect that belongs to a pattern or to the kit is logged and worked around in
the story; it is never patched inside a piece.

**The direction log**, `pieces/<id>/direction-log.md`. The title line reads
`# Direction log · <piece id>`. Each round is one section headed `## Gate N · <Title>` with N from 1
to 7. These headings are a file format: `mm review` reads every `## ` heading as a round, and the golden
tests look for the seven `Gate N` headings. The first `>` quote in a section is the director's note
for the round. Under it sits a table with the columns `#`, Call, Options shown, Director's words and
Decision, one row per call, numbered `N.k`. The words are a quotation; a call that offered nothing
says why (forced by a rule, plain arithmetic, fixed by the brief). Every warning that stands at the
cut has a row with its reason.

**The review page**, `mm review [piece]`, writes `out/review.html`: one file, no scripts, with the
images beside it. Rounds are listed newest first, ordered by the number in the heading (by position
when a heading has none). Each round shows its note, its table and, for the newest round only, a
fresh set of stills, strips, contact sheet, phone sheet and last frame, which are archived under
`out/rounds/round-NN/`; an older round keeps the images it was archived with. Because of that the
page is built at the end of every round, not only at the end of the piece. The newest round also
links the exports, and the defects ledger closes the page.

**The defects ledger**, `pieces/<id>/defects.md`. Rows `D1`, `D2`, … with the columns `#`, Where,
Note, Raised by, Status and Fix. *Where* is a time for a film, `press N` for a deck, or `all`;
*Raised by* is the director, the crew or a rule id; *Status* is `open`, `fixed`, `regressed` or
`accepted`. A row is written before the change it causes. After every cut the agent walks the whole
ledger against the new stills and `out/check.json`, turns a row that has come back into `regressed`
instead of adding a new one, and says in that round's entry that the walk happened.

**The handover**, `handover.md`, closes round 7: where the piece lives, its formats, style and
audio, the scenes, the gate result, the warnings that stand, the changes the gates forced, the
heuristics applied (§7), the named gaps and what nobody verified. A section with nothing to say
reads "none".

`tests/golden/` holds four finished pieces (a film and a deck, each in two styles) and checks that
each has its exports, its review page, a log with a call row under every `Gate N` heading and a
ledger that starts at `D1`.

## 12. Formats and thresholds (*all provisional*: from published motion-studio practice and the author's own)

| Format | Viewport | Base size (`scale` × base) | Body floor | Micro floor | Safe margin |
|---|---|---|---|---|---|
| 9x16 film | 1080×1920 | 168 px | 44 px | 28 px | 72 px |
| 1x1 film | 1080×1080 | 152 px | 40 px | 26 px | 64 px |
| 4x5 film | 1080×1350 | 160 px | 42 px | 27 px | 68 px |
| 16x9 film | 1920×1080 | 136 px | 36 px | 24 px | 64 px |
| 16x9 deck | 1920×1080 | 128 px | 34 px | 24 px | 64 px |

**Headline hierarchy.** Layout headlines come in three steps, each times
`--mm-headline-scale`: a **lead** (statement, title-stack, endcard) is the display role times
0.8 (0.64 in 1x1); a **content** headline (split, comparison, bento-3, stat-hero, list-reveal,
quote) is h1; the **hook** (the first scene's headline) is one step (1.25) above its layout's
size, so a hook in statement or title-stack is the display role itself (0.8 of it in 1x1). The
hook is therefore the largest headline of a piece in every format, by at least 1.25 over a lead
and about 1.3 over a content headline. Figures (stat-hero's and split's numbers) are data and sit
outside this ladder.

Feed and screen: 9x16 and 1x1 films are feed pieces, judged on the phone sheet; a 16x9
film is a screen piece, judged at 960 px wide. `data-micro` text may not carry a fact, the call to
action or the only instance of a line. Phone sheet: frames scaled to 360 px wide; the skill inspects it (H), the gate reads sizes at full
scale (G-LEGIBLE). Reading speed 0.3 s per word plus arrival. Dead-time window 4 s. Quiet before
the end 2 s. Deck 6–20 presses; film 20–60 s.

## 13. Capture and embed (the three modes)

Screen content is captured, not streamed: `mm capture site` reads a website once, from a URL
the user gives, into the piece's assets, and `mm media prep` turns the user's own recording into
frames. Nothing is fetched at render time (G-LOCAL), and a capture is redone only on request.

| Verb | Does | Writes |
|---|---|---|
| `mm brand capture --from <url\|index.html\|figma-export.json\|DESIGN.md> --out <path>.json [--name <name>]` | reads computed colours and families by frequency (site), variables and text styles (Figma export), or the tokens section (DESIGN.md); maps the seven colour roles and three type roles; copies or names the nearest bundled fonts; copies `composition` from the template brand and lists it among the defaults; sets `fictional: false`; writes `capture-notes.md` with every guess and its evidence. `--name` defaults to the `--out` basename. The notes carry a Warnings section that flags a muted colour below 4.5:1 on the canvas, fixed in the half before composing | brand half |
| `mm motion capture --from <video> --out <path>.json [--name <name>] [--fps N]` | decodes greyscale frames at the source rate (at most 30 fps; `--fps` overrides), finds candidate events at 10 fps and reads each again at the source rate; classifies cut kinds by their frame-pair signature: hard, fade, dip (a fade through a flat colour), push, whip-pan, wipe and iris (each with its direction where it has one) and zoom; times arrivals, and push, whip-pan, wipe and iris cuts, on their progress curves; derives `pacing` (energy from calibrated bands, arrivals per 10 s, hold floor), duration roles, preferred `transitions` and the headline entrance family; writes `capture-notes.md` with the shot list, the evidence for each value and what was defaulted. `--name` defaults to the `--out` basename. Takes the grammar of the reference, never its content (H-REF) | motion half |
| `mm style compose --brand <name\|path> --motion <name\|path> --out <path> [--name <style-name>]` | §3 | composed `style.json` |
| `mm style export-designmd --style <style.json> --out DESIGN.md` | writes a style as a `DESIGN.md`, which `mm brand capture` reads back to the same colours, faces, space and radius | `DESIGN.md` |
| `mm skill new --brand <name\|path-to-brand.json> [--motion <name\|path>] --out <dir> [--force]` | scaffolds a thin per-brand skill from `skill/templates/brand-skill/`: a `SKILL.md` that loads the engine's skill, pins the composed style, carries the brand's facts file and fonts, and lists which bans the brand lifts. The engine stays shared and brand-free; the thin skill is private to its owner. `--brand` accepts a shipped name or a captured half's path; font `src` paths in the skill's `style/*.json` are relative to the style file's own folder, and a font `src` is looked up beside its style file first, then from the repository root | a skill folder |

Captured halves belong in a piece-local or git-ignored folder, not in the shipped `styles/brands/`
and `styles/motion/`. Capture is best effort and says so: every captured value carries evidence in `capture-notes.md`,
and the director approves the composed style in round 3 before it is used.

**Motion capture, measured.** An activity event is a cut only when it
*replaces* the picture: at least half the 10×10 px cells that held content before it have changed
after it, because change size alone cannot tell a dissolve from a text arrival on a sparse title
card; any other activity is an arrival, and cuts closer than 0.4 s are one cut. Cut kinds are then
tested in this order on source-rate frame pairs: a strip or ring of change that travels at least
40 % of the picture (wipe with its direction, iris); consecutive pairs explained by one shift of the
whole picture (push with its direction; a whip-pan when the frames are blurred along the axis or
the picture clears within 0.1 s); a first pair that replaces the picture (hard); pairs explained by
growth about the centre (zoom); a fade to a flat colour that comes back after a hold of 0.1 s or
less (dip); blends of the frames either side, including a fade into a shot that is still empty
(fade). A transition of fewer than two source frames reads as hard.

Energy is read from five measured quantities: median shot length, arrivals per 10 s, median
arrival burst (10 to 90 % of its progress), share of hard cuts, and median timed cut (push,
whip-pan, wipe or iris, fitted under one reference ease-in-out). The bands are calibrated on
labelled films (the two golden films and two reference stories rendered under calm, premium and
kinetic): for each quantity, the median of each energy's films and the spread within them; at
each edge (calm|medium, medium|high) a quantity's weight is the distance between the two medians
over its spread, and 0 when that is below 1 or the medians are out of order. A film is past an
edge when its weighted votes there are positive; with no weight at the calm|medium edge, calm and
medium are not told apart and medium is kept, said in the notes. `ENERGY_CALIBRATION` in
`scripts/capture-motion.mjs` is that calibration; the tests check it against the labelled films
and leave each film out in turn.

Duration roles: each role of the energy's preset owns a basin (geometric means with its
neighbours; quick from 1/1.6 of itself, slow to 1.6 times); its value is the median of the
arrivals in its basin and of the cuts whose pattern takes that role (push, wipe, iris: standard;
whip-pan: quick). Arrivals are fitted under the preset's enter curve, or its text spring when that
fits clearly better; cuts under its move curve, their progress being the share of the picture
already carried (push, whip-pan) or the edge's position (wipe, iris).

The headline entrance family is read from the first arrival of each shot (not one that runs on
out of a gradual transition): each frame part-way through is matched against the settled ink
moved, scaled about its centre or left edge, blurred, or as it is. Families: slam or punch (lands
from above or shrinks onto its place; a drop reads here too), rise or fade, blur-fade, pop. A
family that holds three quarters of the shot openings read sets `entrances.headline` (the
preset's member of it when it has one, else the family's first); otherwise the notes say "not
distinguishable" and the preset's headline stays. Body, figure and plate entrances are defaulted.

Not measurable from frames, and said so in the notes: easing curves and spring constants (assumed
from the preset), the transition policy, travel, overshoot, exit ratio and stagger, sound,
entrance vocabulary beyond the headline family and the members inside a family, a crossfade
between two shots that both carry text against a colour-dip (the kit draws both through the
canvas; they differ by a tenth of the transition), the narrative position of a cut (topic,
related, climax are inferred from frequency and place), and the style's `hold`, which is a floor:
the rests a film shows are set by its story.

## 14. Rule ledger

Every id, its rule file, its test and its negatives (AXIOM 5). An id without a row is not yet a
rule. Rule files are `scripts/check/<id>.mjs`; negatives live under `fixtures/negatives/<id>/`
(pattern negatives under `fixtures/negatives/patterns/`, release-check negatives under
`fixtures/release/`). Folders starting with `_` are positives and shared inputs, not negatives.
`tests/docs/ledger.test.mjs` fails when a rule file has no row here, or a row names a rule file, a
test file or a negatives folder that does not exist.

| Id | Rule file | Test | Negative fixtures (`fixtures/negatives/…`) |
|---|---|---|---|
| G-TIME | `G-TIME.mjs` | `tests/check/time.test.mjs` | `G-TIME/{static,runtime,trap,realm,worker,post-task,smil,entropy,custom-duration}/`; `patterns/G-TIME/entrances/` (`tests/pattern-lint.test.mjs`) |
| G-DETERMINISM | `G-DETERMINISM.mjs` | `tests/check/determinism.test.mjs` | `G-DETERMINISM/{scene,order}/` |
| G-LOCAL | `G-LOCAL.mjs` | `tests/check/local.test.mjs` | `G-LOCAL/{url,font,glyph}/` |
| G-LITERAL | `G-LITERAL.mjs` (pixels: `_pixels.mjs`) | `tests/check/literal.test.mjs` | `G-LITERAL/{regex,named,computed,family,pixel,hue,region,mask,overlay,canvas}/`; `patterns/G-LITERAL/entrances/` (`tests/pattern-lint.test.mjs`); calibration sheet `_palette/` (a positive) |
| G-PLACEHOLDER | `G-PLACEHOLDER.mjs` | `tests/check/placeholder.test.mjs` | `G-PLACEHOLDER/{text,pseudo,svg,marker,entity}/` |
| G-LEGIBLE | `G-LEGIBLE.mjs` | `tests/check/legible.test.mjs` | `G-LEGIBLE/{size,scaled,pseudo,first-letter,shadow,canvas-text}/`; `_base/canvas-text/` (a positive: a pattern that declares `canvasText`) |
| G-REST | `G-REST.mjs` | `tests/check/rest.test.mjs` | `G-REST/` (also warns W-HOLD: the same defect) |
| G-HOOK | `G-HOOK.mjs` | `tests/check/hook.test.mjs` | `G-HOOK/{film,deck}/` |
| G-EDGE | `G-EDGE.mjs` | `tests/check/edge.test.mjs` | `G-EDGE/{box,pseudo,platform}/` |
| G-OVERLAP | `G-OVERLAP.mjs` | `tests/check/overlap.test.mjs` | `G-OVERLAP/{box,pseudo}/` |
| G-DEAD | `G-DEAD.mjs` | `tests/check/dead.test.mjs` | `G-DEAD/` |
| G-QUIET | `G-QUIET.mjs` | `tests/check/quiet.test.mjs` | `G-QUIET/{film,deck}/` |
| G-LENGTH | `G-LENGTH.mjs` | `tests/check/length.test.mjs` | `G-LENGTH/` |
| G-LOOP | `G-LOOP.mjs` | `tests/check/loop.test.mjs` | `G-LOOP/seam/` (and `G-LOOP/ok/` and `G-LOOP/auto/`, which pass) |
| G-END | `G-END.mjs` | `tests/check/end.test.mjs` | `G-END/` |
| G-PATTERN-REF | `G-PATTERN-REF.mjs` | `tests/check/refs.test.mjs`, `tests/kit/screen-actions.test.mjs` | `G-PATTERN-REF/`, `G-PATTERN-REF/mark/` |
| G-FACT-REF | `G-FACT-REF.mjs` | `tests/check/refs.test.mjs` | `G-FACT-REF/`, `G-FACT-REF/sample/` |
| G-PATTERN-CARD | `G-PATTERN-CARD.mjs` (calls `scripts/pattern-lint.mjs`) | `tests/pattern-lint.test.mjs`, `tests/contracts/pattern-card.test.mjs` | `patterns/G-PATTERN-CARD/{missing-file,missing-section,empty-section,out-of-order,demo-unused}/`; `patterns/positive/` (a positive) |
| G-PROVENANCE | `G-PROVENANCE.mjs` (calls `scripts/pattern-lint.mjs`) | `tests/pattern-lint.test.mjs` | `patterns/G-PROVENANCE/{unknown-source,pattern-credit,substring}/` |
| G-LOUD | `G-LOUD.mjs` | `tests/check/sound.test.mjs`, `tests/sound/{loudness,gate,sparse}.test.mjs` | `G-LOUD/` (tracked `out/mix.wav`, −8 LUFS) |
| W-FADE-ONLY | `W-FADE-ONLY.mjs` | `tests/check/warnings.test.mjs` | `W-FADE-ONLY/` |
| W-READ | `W-READ.mjs` | `tests/check/warnings.test.mjs` | `W-READ/` |
| W-CUE | `W-CUE.mjs` | `tests/check/sound.test.mjs`, `tests/sound/{cues,gate}.test.mjs` | `W-CUE/` |
| W-DUR-LITERAL | `W-DUR-LITERAL.mjs` | `tests/check/warnings.test.mjs` | `W-DUR-LITERAL/` |
| W-BAN | `W-BAN.mjs` | `tests/check/warnings.test.mjs` | `W-BAN/` |
| W-SUB | `W-SUB.mjs` | `tests/check/warnings.test.mjs` | `W-SUB/` (run with `--sub 4`) |
| W-CONTRAST | `W-CONTRAST.mjs` | `tests/check/warnings.test.mjs` | `W-CONTRAST/{color,pseudo,gradient}/` |
| W-PACE | `W-PACE.mjs` | `tests/check/warnings.test.mjs` | `W-PACE/` |
| W-HOLD | `W-HOLD.mjs` | `tests/check/warnings.test.mjs`, `tests/check/rest.test.mjs` | `W-HOLD/` |
| W-EMPTY | `W-EMPTY.mjs` | `tests/check/warnings.test.mjs` | `W-EMPTY/` |
| W-ENTRANCE | `W-ENTRANCE.mjs` | `tests/check/warnings.test.mjs` | `W-ENTRANCE/` |
| W-STAGGER | `W-STAGGER.mjs` | `tests/check/warnings.test.mjs` | `W-STAGGER/` |
| W-AMBIENT | `W-AMBIENT.mjs` | `tests/check/warnings.test.mjs` | `W-AMBIENT/` |
| W-CAPTION | `W-CAPTION.mjs` | `tests/check/warnings.test.mjs` | `W-CAPTION/` |
| W-OVERSHOOT | `W-OVERSHOOT.mjs` | `tests/check/warnings.test.mjs` | `W-OVERSHOOT/{declared,measured}/` |
| W-MIX | `W-MIX.mjs` | `tests/check/sound.test.mjs`, `tests/sound/{cues,gate}.test.mjs` | `W-MIX/` |
| W-ASK | `W-ASK.mjs` | `tests/check/warnings.test.mjs` | `W-ASK/` |
| every rule on clean pieces | all | `tests/check/positive.test.mjs` | `_base/{film,deck}/` (positives), `_shared/patterns/` (stub patterns the negatives mount) |
| raster flags | (`scripts/lib/browser.mjs` `LAUNCH_ARGS`) | `tests/check/raster.test.mjs` | `_raster/` (a positive) |
| release-check R-BRAND · R-SECRET · R-PATH · R-URL · R-LICENSE · R-FONT-LICENSE · R-PATTERNS · R-GOLDEN · R-STRATEGY · R-HISTORY · R-DUP | `scripts/release-check.mjs` | `tests/cli/release-check.test.mjs` | `fixtures/release/{brand-word,secret,abs-path,cdn-url,no-licence,font-no-licence,bad-pattern,golden-unchecked,finder-dup,strategy-file,history}/`; `fixtures/release/clean/` (a positive) |
| capture: brand roles; motion cut kinds, energy bands, durations, headline family | `scripts/capture-brand.mjs`, `scripts/capture-motion.mjs` | `tests/capture/*.test.mjs` | `fixtures/capture/site/`, `fixtures/capture/reference/` (incl. `pieces/{tempo-a,tempo-b,kinds}`), the golden films |
| composition, headline ladder, bounded entrances, units on landing, zoom-through, travel units | `runtime/kit/{kit,room,count}.js`, `patterns/` | `tests/contracts/composition.test.mjs`, `tests/kit/{composition,patterns-frames,count-text,travel-units}.browser.test.mjs` | `fixtures/kit-smoke/composition/` |
| kit: springs, track, ease, random, schedule, roles, hook, anchors, rests, settle moves, cascade emphasis, decode warnings, the reference in `runtime/kit/README.md`, shared sound synth, fragments | `runtime/kit/` | `tests/kit/*.test.mjs` (among them `move-settle`, `cascade-emphasis`, `seek-decode-warning`, `readme`, `synth`, `fragments`) | pure-function cases; `fixtures/kit-smoke/{roles,roles-deck}/` |

Ledger note: a G- negative is judged on every row. Its own id fails, and no other G- rule fails
or W- rule warns, unless that W- row is the same defect, which the test names.

## 15. Rulings on contested rules

The sources this grammar draws on disagree in places. These are its rulings; a motion style may move
within the stated range, never outside it.

| Question | Sources | Ruling |
|---|---|---|
| Do elements get exit animations? | hyperframes bans exits (the transition is the exit) yet teaches velocity-matched exit and entry pairs; manim and other references use explicit exits | **The transition owns the exit by default.** An explicit `data-out`/`data-exit` is for an element leaving mid-scene, for the last scene, or when the motion style's transition policy is `velocity-matched`. Exits never stagger and take `exitRatio` of their entrance. `transitions.policy` changes `transitions/crossfade` only: under `owns-exit` two text scenes fade one out and then the other in; under `velocity-matched` they dissolve together |
| Are bounce and elastic allowed? | impeccable calls them dated; motion-design and hyperframes keep them as personalities | **Allowed, bounded.** Overshoot is a motion-style number (`overshootMax`, 0 to 0.30); W-OVERSHOOT reads the measurement. Type never overshoots; opacity never overshoots |
| Is there a banned-fonts list? | hyperframes bans 19 families; frontend-slides' own presets use several | **Advice, not a gate.** Shipped presets avoid the most generic families; `mm brand capture` notes when a captured family is on the list; no rule fails on a font |
| Minimum sizes | hyperframes 60/20/16 px at 1080p; the author's practice 34/24 px for decks | **§12 floors stand** (stricter on body for films, where the viewer holds a phone); the hyperframes label floor becomes the micro floor's lower bound |
| Interaction-speed caps (sub-300 ms) | `emilkowalski/skills`, written for UI | **Not applied to film.** Durations are per-role budgets from the motion style; ease-in is legal on exits and wind-ups |
| Fades | one reference bans fade-out endings; another bans a piece in which every entrance is a fade | **Fade stays a pattern;** W-FADE-ONLY catches a piece that uses nothing else; the final rest holds rather than fading unless the style says `outro: transitions/fade` |

## 16. The studio and edit ops

The piece is the story file (§4); the studio is a lens and a pen on it. It keeps no state the story
does not hold.

**16.1 Edit ops.** An edit is a list of typed ops (`contracts/edit-ops.schema.json`), addressed to
the raw story: a scene by `id`, a beat by its index in the scene's beats (in the variant's beats when
the op's `format` names a variant that has beats). The ops are `scene.duration`,
`scene.order`, `scene.cut`, `scene.move`, `scene.say`, `beat.at`, `beat.out`, `beat.set`,
`beat.param`, `beat.add`, `beat.remove`, and `story.formats` (the formats the piece ships: a non-empty
list of distinct film formats, written in the order 9x16, 1x1, 4x5, 16x9; removing a format leaves
the scenes' `variants` for it in place, so adding it back restores them). Each is checked against the story and the beat's pattern
params (§5) before it applies; a refusal carries a code (`generated`, `deck`, `unknown-scene`,
`ambiguous-scene`, `unknown-beat`, `out-of-range`, `bad-type`, `unknown-param`, `bad-value`,
`schema`) and a hint. Times a forward op writes are rounded to 0.01 s. An accepted edit never leaves
a story the schema rejects.

**16.2 Writing.** An op compiles to an RFC 6902 patch applied to the file's text so that only the
edited bytes change; inserts copy their siblings' style; `JSON.parse` of the result equals the patch
applied to the parsed story. Every write checks the caller's version (the first 16 hex characters of
the file's SHA-256), checks the result against the story schema, takes a lock in `out/studio/`,
appends a receipt `{ id, who, at, label, edits, inverse, before, after, undoes? }` to
`out/studio/journal.jsonl`, then renames a temporary file over `story.json`. Undo applies a receipt's
inverse ops, with the exact old values, and only while the file is still that receipt's `after`.

**16.3 Read-only.** A story with `generator` (the repo-relative path of the script that writes it)
refuses every edit, with the generator named in the hint; so does a deck (§10).

**16.4 `mm timeline`.** Refs: `<scene>`, `<scene>/<slot>`, `<scene>#<n>`, `<scene>/<slot>#<n>`
(indexes from 0). Times: `4.5`, `4.5s`, `+0.5`, `-0.25`, `30f` (30 fps), `beat:<n>` and `bar:<n>`
(from 1, from the piece's beats file), `end`. `--plan` prints a unified diff and writes nothing.
After a write it prints the timing verdicts that changed, new failures first. Exit 0 done, 2 refused
or usage.

**16.5 The studio.** `mm studio` serves the repo on 127.0.0.1 and a JSON API over one piece
(`scripts/studio/server.mjs`). A request whose Host is not the studio's own, or whose Origin is
present and foreign, is refused; so is a path outside the repo or into `.git`. It writes only
`story.json` (16.2), `out/studio/`, and the gate's `out/check.json` when asked to run the gate; its
Export runs `mm check` (every format), then `mm export --formats …` (with `--force`, stamping
UNCHECKED, only when the person asks after a failing gate) and, when asked, `mm sound` and `mm check`
again on the mix, one run per piece across processes, holding the piece's export lock throughout so
the story checked is the story rendered (edits are refused meanwhile, 409 `exporting`); they write
only under the piece's `out/` (§8; an interrupted export leaves `out/` as it was);
its file server answers HTTP Range requests so the page can play and seek an MP4. The format switch
offers every film format whatever the story ships, and previewing one writes nothing; a format ticked
in Export that the story does not ship is added to `formats` (one `story.formats` edit) before the run. The
page draws the timeline from the kit's own `schedule()` (§6): one lane per slot name, scenes with
their cuts, cues, moves, the music grid, and a gate lane. The schedule-only rules (G-DEAD, G-LENGTH,
G-QUIET, W-READ, W-PACE, W-HOLD, W-CUE, W-FADE-ONLY, W-ASK) run in the page from the same rule files
`mm check` runs (`scripts/check/timing.mjs`), on the gate's schedule, and their verdicts are those of
`mm check` for the same story.

**16.6 Parallel capture.** `mm export --workers N` draws disjoint runs of frames in N pages and
feeds one encoder in order, with at most N + 1 runs drawn ahead. Proved per release by
`tests/cli/export-workers.test.mjs`: the frame hashes, the encoded stream hashes and the MP4 bytes
of a one-page and a three-page run are equal. MP4 bytes are reproducible for the same frames, ffmpeg
build and arguments; they are not claimed across ffmpeg versions. An interrupted or failed export
leaves `out/` as it was.

