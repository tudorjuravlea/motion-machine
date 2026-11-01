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
    first scene's headline finished (§4 `params.instant`, `step: 0`; W-HOOK).

## 3. Style contract (`contracts/style.schema.json`)

A piece's `style.json` is the **composition of a brand and a motion style**. The two
halves are authored, captured and shipped separately so that any brand can wear any motion style:

| Half | Owns | Lives in | Captured from |
|---|---|---|---|
| **brand** | `color`, `type`, `scale`, `space`, `radius`, `composition`, `bans`/`allow` | `styles/brands/<name>.json` | a site (`mm brand capture --from <url>`), a Figma file, a `DESIGN.md`, or by hand |
| **motion** | `motion` (durations, easings, springs, travel), `sound`, `transitions` (preferred cut per narrative position), `entrances` (preferred vocabulary), `pacing` (hold floor, arrivals per 10 s), optional `gate` (tunes the gate's warnings, below) | `styles/motion/<name>.json` | a reference film (`mm motion capture --from <video>`: cuts and their kinds, shot lengths, arrival tempo, entrance and cut durations, energy and the headline entrance family, measured on extracted frames; §13), a preset, or by hand |

`mm style compose --brand <name|path> --motion <name|path> --out pieces/<id>/style.json` writes the
composed file with `from: { brand, motion }` recorded. The kit reads only the composed file. A
shipped brand preset is fictional (AXIOM 3); a shipped motion preset is neutral by construction.
A half may live anywhere: a half inside the repository is recorded by its repo-relative path, one
outside it by its path relative to the composed file, and a font or ground mark the half names
relative to itself is written relative to the composed file, so the style finds them wherever it
is saved (`mm brand init` makes such a half in a folder of its own, §8).
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
              "frameHold": 1,                                   // optional: 1, 2 or 3 (below)
              "reduceMotion": "user",                           // optional, decks: "user" follows the reader's prefers-reduced-motion, "always" forces it (§10)
              "stagger": { "eachS": 0.05, "capS": 0.5 } },      // per-item stagger and the cap on a whole cascade
  "sound": { "palette": "soft-ui" | "percussive" | "cinematic" | "none", "bpm": 120, "loudnessLufs": -14,
             "cuesPer10s": [2, 6],                              // W-MIX's band
             "profile": "glass",                                // optional: a sound profile (§9), a name in styles/sound/ or a path; the brand half may set it too (`"sound": { "profile": … }`) and then wins
             "licences": ["cc0", "pdm"] },                      // optional: the licences found sounds may carry (§9): cc0, pdm (public domain), by (CC BY 2.0 to 4.0); default all three; a brand narrows it once (the brand half may set it too and then wins), the story's `audio.acceptLicences` widens it
  "transitions": { "opening": "transitions/hard-cut", "topic": "transitions/wipe", "related": "transitions/crossfade",
                   "climax": "transitions/zoom-through", "outro": "transitions/fade",
                   "policy": "owns-exit" | "velocity-matched" },  // §15; passed to transitions as ctx.policy
  "entrances": { "headline": "entrances/rise", "body": "entrances/fade", "figure": "entrances/count", "plate": "entrances/pop" },
  "pacing": { "holdMinS": 1.2, "arrivalsPer10s": [3, 6], "energy": "calm" | "medium" | "high" },
  "gate": { "length": { "filmS": [20, 60], "loopS": [4, 15], "deckPresses": [6, 20] },   // optional, and so is every key: W-LENGTH's bands
            "deadS": 4, "quietS": 2,                            // W-DEAD's window, W-QUIET's tail
            "read": { "perWordS": 0.3, "labelS": 0.8, "sentenceS": 1.2 },   // W-READ's speed and line floors
            "anchor": { "earlyS": 1.8, "lateS": 0.2 },          // W-ANCHOR's window around the spoken word
            "tokens": { "strokes": 4, "sizes": 5, "radii": 3 }, // W-TOKENS's limits
            "seamPct": 5,                                       // W-SEAM's speed tolerance across a cut
            "sameBox": { "share": 0.5, "minScenes": 4, "quant": 0.05 },   // W-SAMEBOX's limits
            "liftBans": ["frame-borders"] },                    // looks W-BAN stops reporting
  "bans": ["centered-title-on-gradient", "fade-only", "corner-labels", "frame-borders", "glow-on-ui", "particle-burst"],
  "allow": []                                                   // a style may lift a ban by name
}
```

`gate` is how a studio tunes the gate for its own brand, and only the warnings: the length band
(W-LENGTH), the dead-air window (W-DEAD), the quiet tail (W-QUIET), the reading speed and line floors
(W-READ), the window of a beat around the word it names (`anchor`, W-ANCHOR), the most distinct strokes,
sizes and radii a piece may use (`tokens`, W-TOKENS), the speed tolerance across a cut (`seamPct`, W-SEAM), the share of scenes that may carry one box signature (`sameBox`, W-SAMEBOX)
and the looks W-BAN stops reporting (`liftBans`, limited to the three looks W-BAN detects;
the style's `bans` and `allow` stay as they are). The hold floor, the arrival band and the stagger caps
(W-HOLD, W-PACE, W-STAGGER) are tuned by `pacing` and `motion.stagger`. The values in the shape above
are the defaults, which apply to every key a style leaves out. Each tuned rule reports the threshold it
used in its evidence. A `gate` key that names a `G-` rule, or any key not listed here, is a contract error
(`mm check` exits 2): a hard rule is never tunable; the hint is given for a `G-` key at any depth of
the block, in any case. The console summary of `mm check` ends with "Tuned by the style's gate block:"
and the warning rules the block tunes (`tuned` in `out/check.json` too), so the person reading the
warnings sees which thresholds moved. `mm style compose` carries the motion half's `gate`
into the composed style unchanged.

`transitions` and `entrances` are the motion style's vocabulary, and a story speaks it by role
(§4): `fx: "style:<role>"` takes `entrances.<role>`, and a scene that gives a
`position` and no `cut` takes `transitions.<position>`. A story that names a pattern overrides
the style for that beat or scene. `pacing` is read by the gate: W-PACE (arrivals per 10 s
outside the band) and W-HOLD (a rest shorter than `holdMinS`; `holdMinS` is the shortest *rest*,
not the shortest shot). A captured `pacing.energy` is read from measured quantities
against bands calibrated on labelled films (§13), never copied from a preset. The preset of that
energy then fills what frames cannot measure, and `capture-notes.md` lists each such value under
"Defaulted".

**Frame hold.** `motion.frameHold` is 1, 2 or 3 (optional, 1). 2 animates elements on twos and 3 on
threes (a 10 fps stop-motion grid). Elements change only on one grid shared by the piece, every 2/30 s
or 3/30 s from t = 0, counted in 1/30 s whatever the export frame rate: each element is drawn as it was
at the last instant of the current step. An element that would finish inside a step is drawn finished
from that step, so rests are the same with or without the hold. Cuts and camera moves stay smooth.

**Shipped motion halves.** `calm`, `kinetic` and `premium` are general feels. `grid` is precise
drafting: one hard ease for every move, critically damped springs, durations as note values at its
tempo, cuts and wipes only. `stop-motion` is printed on threes (`frameHold` 3, every duration a whole
number of 100 ms steps). `proof` is short-form evidence: kinetic's quick entrances, calm's still
camera, nothing bounces, every cut hard.

**Composition belongs to the brand.** `composition.align` is `left` or `center`,
`headlineScale` is 0.8 to 1.4, `density` is `airy` or `compact`. All three are required in a
brand half; `mm style compose` copies the block into the composed style. In a composed style the
block is optional, so a style composed without it still mounts: the kit then reads
left, 1, airy. A captured brand (`mm brand capture`) copies the block from the template brand
and lists it among the copied defaults, since a site does not reveal it. The shipped brands differ
on purpose: `paper` left, 1, airy; `signal` center, 1.2, compact; `linen` left, 1, airy; `nocturne` left, 1.3,
compact; `greyfield` left, 1.15, compact; `twoplate` left, 1.1, airy; `draftline` left, 1, compact; `obsidian` left, 1.1, airy.

**Device finish.** A brand may give `devices.finish`: `ink` (the default, the look device
frames always had), `canvas` (the surface colour), `graphite` (the darkest palette role) or
`silver` (the lightest). Every finish is a palette role, so G-BRAND holds. `mm style compose`
copies it. The kit exposes it as `--mm-device-body`, with `--mm-device-island` (the darkest role)
for the phone's cutout; device patterns read only those.

**Brand text rules.** `color.surfaceInk` (optional) is the colour of text on a surface:
cards, tiles, caption bars, callout labels, split-flap tiles, stat tiles and device screens; ink
when absent (the kit sets `--mm-color-surfaceInk` and `--mm-surface-muted`). `composition.accentText:
false` is for a brand that never colours text: every pattern that would tint text with the accent
(stat-hero and split figures, indicate, shine, karaoke, an accent handwriting stroke) reads
`--mm-accent-text`, which is then ink; accent fills (bars, rules, buttons, rings) stay accent.

**Brand defaults for patterns.** A brand may set `patterns`: per pattern (`group/name`), defaults for any of
its params, as scalars. The kit reads a pattern's params as its own defaults, then the brand's, then the beat's,
so a brand can be made more on brand without touching a story. `mm style compose` copies `patterns`, and
`imagery` (style words, mood, what to avoid, reference pictures, a tone after generation), `voice` (provider and
voice id, language, delivery) and `music` (style words, what to avoid) for the generators (`mm gen`).

**Mascot.** A brand may describe its character in `mascot`: `box` (width and height in the character's own
unit, u), `ground` (the point between the feet, in the views' coordinates; SVG axes), `views` (`front`
required; `threeQuarter`, `side`, `back` optional; each a `body` silhouette path, an optional side `strip` and
`seam`, a `face` frame `{ cx, cy, gap, size, fw?, mouth?, sides? }` or null, and `limbs`: arms and legs with an
anchor, a width, a side and a layer behind or in front of the body), `parts` (each part a palette role or
`{ role, mix, share }`, an sRGB blend of two roles), `outline` (weight factor), `moods` and `faces` (what the
brand allows). Paths accept path data only, every number under 1000 and without an exponent. The rig refuses
a view whose drawing (a path, a limb or the face) reaches more than 20 % of the box past the box about `ground`:
the front then takes the rig's default figure, another view is made from the front. `runtime/kit/rig.js` draws
it with fills from `--mm-color-*` only, so G-BRAND holds by construction, and clips the drawing to its slot; a
view the brand did not draw is made from the front. `mm style compose` copies `mascot`. A style with none gets
the rig's plain default character.
A character may add **extra parts**: any name in `parts` that is not a colour is a part (`d` path data, `anchor`,
`layer` back or front, `swing` 0 to 2, `color`, optional `stroke`, `tip`, `views`), swung about its anchor with
follow-through read from the pose 0.08 s and 0.2 s earlier (pure in `t`, 0 at rest). A character with no legs may
**float** (`float` u above its ground; it bobs on the idle's grid, its shadow stays on the ground); limbs are
optional; a face may be eyes only (`faces.mouths: ["none"]`) or sit on a screen **plate** (`face.plate`, colour
`parts.plate`; eyes and mouth then default to the lightest role). A brand may carry a **cast** of further
characters (`mascot.cast.<name>`, each a whole character); the character patterns pick one with `who`.
`mm brand mascot` imports a drawing into this contract.

**Ground.** A brand may give `ground`: `blobs` (1 to 8, each `{ color, x, y, w, h,
alpha }`, the box in shares of the frame), `blur` (a share of the frame width) and an optional
`mark` (`{ src, width, alpha }`: a picture relative to the piece page, centred, `width` a share of
the frame width, clipped by the frame above 1). The kit draws it as the first child of every scene
(`.mm-ground`, `data-chrome`, `data-keep`, `aria-hidden`), so cuts carry it. Blob colours join the
palette as `ground-<n>`; G-BRAND's pixel half compares each frame with the same frame showing only
the ground, and passes a pixel that is the ground or a blend of the ground under it and one palette
colour. G-LOCAL checks the mark file. A brand's mark may be named by its repo path
(`styles/grounds/<file>`); `mm new` copies it to `assets/ground/` and rewrites `src`, as it does for
fonts. `mm style compose` copies `ground`.

**Ground kinds.** `ground.kind` is `blobs` (the default, everything above: a ground written before kinds
existed is a blobs ground and stays valid), `bloom`, `graph-paper` or `dots`; a newer kind needs no other field
and takes only its own block, each field optional (the kit reads the defaults). They are drawn only in palette
roles (`role` is one of the seven; a tint is the role at a share of its strength over transparent), with every
size a share of the frame and every speed a param, so G-BRAND holds by construction and a brand makes the ground
its own by choosing kind, role, density and strength. `bloom` (`bloom`: `role` accent, `width` 1.2 and `height`
0.75 of the frame, `strength` 0.5) is a radial light centred on the frame's bottom edge; on each scene it scales
from 0.9 to 1 with the style's `enter` easing over the scene's first beat (at least one `standard` duration), and
a deck draws it full size; it may carry a faint dot grid (`dots`: `role` line, `spacing` 0.025 of the frame
width, `size` 0.12 of the spacing, `strength` 0.6). `graph-paper` (`grid`: `role` line, `spacing` 0.02, `every`
5, `weight`, `strength`, `drift` 0.012, `cycle` 8, and an optional `scan` band `{ role, size, strength }`) is a
fine grid and a heavy line every Nth that drift out and back (a cosine) while the band sweeps from above the
frame to below it, once per `cycle`: the motion repeats exactly every `cycle` seconds, so a film whose length
is a whole number of cycles closes its loop, and a style animating on twos or threes steps it on that grid. A
deck draws a still ground. `dots` is the dot grid alone. Each frame of a ground is a function of the instant,
the scene's start and the style, so any seek order draws the same pixels (`runtime/kit/ground.js`).

**Glass surface.** A brand may give `surface`, the glass look any card-like pattern can opt into, each field
optional: `tint` (the surface role's share in a four-stop diagonal fill, 0.5), `blur` (the backdrop blur, a
share of the frame width, 0.012), `saturate` (1: above 1 moves the ground's colours off the palette), `border`
(the hairline's share of the line role, 0.8), `highlight` (an inner top edge in the lighter of ink and canvas,
0.3), `shadow` (a soft drop shadow in the darker, 0.45), `shine` (one bar in the lighter that sweeps a card once
as it arrives, 0.22; 0 for none), `angle` (its lean, 14 degrees) and `shineWidth` (0.07 of the card). The kit sets
them as `--mm-surface-*` on `<html>`. A pattern opts in with the param `surface: flat|glass` (`flat` by default;
a beat's param, or the brand's own default in `patterns`): a layout marks its cards `data-glass`, a pattern with
a script calls `glass(el, params.surface)` (`runtime/kit/surface.js`), and the kit paints the marked cards.
`data/stat-tile` and `layouts/bento-3` take it (the lead tile of a bento keeps its accent fill and takes the edge
and the shine). The shine is on a card only while it arrives, never at a rest. A glass card has no fill of its
own, so W-CONTRAST measures its text on the rendered pixels under it. `mm style compose` copies `surface`.

**Finish.** A brand may give `finish`, the surface look, each strength 0 to 1 and optional:
`grain` (film grain in ink, seeded from `t` at 12 Hz), `halftone` (a fine dot screen in ink),
`vignette` (corners toward ink, at most 0.08 inside the safe area), `edgeFringe` (an accent glow
outside the safe area), `paperEdge` (a rough surface-coloured border inside the safe margin; a frame
border for W-BAN), `paper` (a paper fibre in ink, seeded once and never re-seeded, at most 0.08) and
`misregister` (below). All are overlays above the scene except `misregister`. Grain, halftone and
paper lie over text and together stay at or under 0.08: when their strengths add up past 1 the kit
scales each down in proportion. `misregister` is a print plate off register: the scene's shapes print
again in accent under themselves, offset down and to one side (0.4 % of the frame width at 1; the side
seeded per scene). The plate lives on the largest boxes inside the camera that hold no layer of their
own, never on the camera, so 3D camera moves keep their depth. Beside type under display size the
offset is at most 0.05 of its font size. Every emphasis kicks the plate in a damped swing that
settles when the emphasis ends, before the rest. The plate steps every max(2, `frameHold`)/30 s and
never lies over text. `mm style compose` copies `finish`.

**Finishing looks.** `finish` also carries `scanlines`, `chroma`, `bloom`, `grainRate` and `look`, each
optional and all pure in `t`. `scanlines` (0 to 1) is a CRT line screen in ink, still; it lies over
text, so it joins grain, halftone and paper in the 0.08 they share (scaled down in proportion when
their strengths add up past 1). `grainRate` (0 to 60, 12 by default, the old behaviour) is how many
times a second the grain changes; 0 holds one grain still. `chroma`, `bloom` and `look` are not layers
but one SVG filter on the stage (`#mm-fx`, `runtime/kit/finish.js`), applied in that order, so a cut and
a transition carry it; nothing else in the piece changes. `chroma` (0 to 1) is a lens's colour fringe
drawn in palette roles only: two ghosts of everything that is not canvas, one pulled toward the frame's
rim and one toward its middle by a radial displacement (`runtime/kit/lens.js`), laid in two roles
(`chromaRoles`, [outer, inner], `accent` and `muted` by default) over bare canvas beside every shape;
nothing at the middle, most at the rim, where at 1 the two ghosts lie 0.4 % of the frame's short side
apart. `bloom` (0 to 1) adds a blurred glow of whatever is lighter than the canvas role, as a screen at
most 0.08, so a style whose ground is its lightest role has little to glow and the ground itself never
moves. `look` is one of `neutral`, `warm-print`, `cool-print`, `faded`, `high-contrast`, each a 33-sample
tone table per channel written from a curve (an S bend, lifted blacks, pulled whites) and a tint role:
a warm or cool print tints its shadows and highlights toward the palette role that lies most toward
warm or cool (within 45° of orange or of blue; a palette with no such role gets the curve alone, so a lime-on-black brand's warm print is matte blacks and nothing more), so no look holds a colour of its own. No table lies more than
0.08 from the identity, whatever the palette or `lookAmount` (0 to 1, 1 by default), which is the bound
a layer over text keeps. G-BRAND reads the palette through the style's own look (§7), so a declared
look is the brand and an undeclared grade still fails. W-CONTRAST holds on the four goldens with each
finish on (scanlines and grain at 0.5; at 1 an ink layer over body text may warn it, as halftone does).

**Shipped presets.** Each preset is a fictional brand worn in a motion half, written by `mm style
compose`:

| Preset | Brand × motion | The look |
|---|---|---|
| `editorial` | paper × calm | a light editorial page, calm entrances |
| `kinetic` | signal × kinetic | centred, compact and loud |
| `calm-product` | linen × premium | a quiet product page |
| `nocturne-kinetic` | nocturne × kinetic | a dark ground and a large display face |
| `spot-mono` | greyfield × proof | a neutral grey system with one saturated accent for the one subject of each frame: the payoff figure or the one keyword takes the accent, everything else stays grey |
| `print-plates` | twoplate × stop-motion | warm stock, a key plate and a spot plate off register, a static paper fibre, printed on threes |
| `obsidian-premium` | obsidian × premium | a premium dark look: a bloom ground rising from the bottom centre over a faint dot grid, and glass cards (stat tiles and bento tiles) |
| `blueprint` | draftline × grid | pale line work on a deep field over a drafting grid in the ink role, mono lettering, one hard ease on the beat, the accent the only warm colour |

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
size, space, radius, duration and easing (**W-LITERAL** warns on a literal in a piece's CSS; `mm pattern
lint` fails one in a library pattern, §5). The gate also samples computed colours of every text and
background at each rest and fails any not in the palette (**G-BRAND**, §7; tolerance: exact, since the
values are variables).

## 4. Story contract (`contracts/story.schema.json`)

```jsonc
{
  "id": "motion-machine-intro", "kind": "film" | "deck" | "loop", "formats": ["9x16", "1x1", "16x9"],
  "title": "…", "language": "en",
  "date": "YYYY-MM-DD",                                       // optional, YYYY-MM-DD: the media's creation time at export (§8); without it a file carries none, never the clock's
  "autoReturn": true,                                          // loop only: the kit plays the last scene's arrivals back to p = 0 before the last frame
  "facts": [ { "id": "f1", "text": "…", "source": "…" } ],     // every number on screen cites one (H-FACTS); "sample": true marks an illustrative number
  "audio": { "track": "assets/audio/track.wav" | null, "bpm": 120 | null, "beats": "assets/beats.json" | null,
             "acceptLicences": ["by-sa"] },                     // optional: Openverse licence codes the person accepts for found sounds beyond the free ones (§9); only a name here widens what `mm sound find` offers and `mm sound fetch` allows
  "scenes": [
    { "id": "hook", "layout": "layouts/title-stack",             // the scene's layout pattern
      "duration": 3.5,                                           // film: seconds
      "presses": 2,                                              // deck: presses inside this scene
      "cut": "transitions/hard-cut",                             // how this scene arrives (optional when position is given)
      "position": "opening",                                     // or related | topic | climax | outro: without a cut, style.transitions.<position>
      "move": "moves/push-in" | null,                            // camera over the whole scene
      "beats": [
        { "at": 0.0, "step": 1, "slot": "headline", "fx": "entrances/rise",  /* or "style:headline" */ "text": "…", "fact": "f1",
          "params": { "side": "up", "d": 40 }, "cue": "tick",
          "anchor": "the spoken word" },                         // film: the word or phrase this beat illustrates (W-ANCHOR)
        { "at": 1.2, "slot": "figure", "fx": "style:figure", "value": 35, "fact": "f2",
          "emphasis": "emphasis/indicate",                       // a there-and-back move after the arrival
          "out": 3.0, "exit": "exits/push-out",                  // film: leaves at that scene-local second
          "until": 3,                                            // deck: the press that removes it
          "asset": "assets/shot.png" }                           // a path under the piece's assets/
      ],
      "say": "…"                                                 // narration or speaker note; in a film's voice-over `[display](spoken)` sets how a word is said and `<<slot>>` puts the beat with that slot on the word it precedes (§8, *Narration*)
    }
  ],
  "loops": [ { "id": "who", "opens": "hook", "closes": "cta-scene",    // optional: a question posed in one scene and answered in a later one (W-LOOP)
               "question": "Who checks it?" } ],
  "licences": { "accepted": ["assets/photo.png", "CC-BY-SA-4.0"] },   // optional: assets (by reference) or licences the person accepted anyway (W-ASSET-LICENSE, §8)
  "share": "…",                                                 // optional: the caption mm export writes (≤ 280)
  "cta": { "text": "…", "url": "…" }
}
```

A scene may carry `variants`: keyed by format, each a partial scene of `layout`, `beats`,
`move`, `moveParams`, `frame` and `say` that replaces the scene's own in that format. Duration, cut and id
are shared, so every format runs the same length. The kit and the gate both read the story through
`forFormat(story, format)`; with variants, piece-scope rules run per format.
A scene that shows the story's footage may carry `frame`, the speaker's mode (§4); a scene may carry `cutParams` and `moveParams` (scalar bags passed to its transition and move);
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
island: `screen/island` grows any element marked `data-island`, from the size the device draws; the lean
of a device and the blur of a moving camera that `screen/zoom-to` draws: the transform of the nearest
`[data-tilt-plane]` and one SVG filter in the layer).

**A recorded session's pointer.** A recording made by `mm capture site --script` (or with a sidecar
`<name>.cursor.json` beside it for `mm media prep`) has a pointer track: its `media.json` names it in
`cursor` (`cursor.json` in the folder) and the kit reads it with the folder (`meta.track`, sanitised: samples
sorted, positions held to 0..1, an unknown cursor type an arrow). The track is version 2: `surface`
(`{ w, h }` css px of what was recorded), `samples` (`{ timeMs, cx, cy, visible, cursorType,
interactionType }`: cx and cy 0..1 of the surface, `cursorType` from the CSS `cursor` of the element under
the pointer, `interactionType` `move`, `click` or `mouseup`) and `targets` (`{ timeMs, selector, box }`: the
box of what was clicked, 0..1), its clock starting at the recording's first frame. `screen/pointer` draws the
cursor from it, and `screen/zoom-to` with `mode: auto` zooms where it clicked; both read it at the recording's
own time, the frame `screen/play` has reached, so they are functions of `t`. A screen action that reads the
track with none on the recording is a kit warning. Sequence frames are decoded inside `settle()` (§2.2a). A folder with neither file is a kit
warning.

**Footage.** `footage: { asset: "assets/<n>/" }` (film only) names a folder holding a frame sequence
(`mm media prep`) and its edit (`mm footage cut`). The edit's output clock is the film's clock: at `t`
every `<img data-footage>` a layout carries (`layouts/talking-full`) shows the source frame the edit's
picture clips map `t` to, held at either end, decoded inside `settle()`. The footage runs on across
scene cuts. Put the cut voice in `audio.track` (`assets/<n>/voice.wav`). Patterns read `ctx.footage`
(`t`, `fps`, `duration`, `clip`, `clipAt(t)`, `words`, and the recording's size `w`, `h`). A deck ignores
footage, with a warning. A layout picture that also carries `data-footage-matte` shows only the person: the
kit masks it with the matte frame of the same source frame (`mm footage matte`) as a luminance SVG mask laid
with the picture's object-fit and object-position, decoded inside `settle()`; with no full matte the whole
picture shows and the kit warns `footage: …`. `layouts/talking-cutout` uses it.

**Speaker frames and the face-safe zone.** A scene whose layout shows the footage may give `frame`: a mode
(`hero`, `side`, `inset`, `bottom`, `hidden`) or `{ mode, side: left|right, corner: tl|tr|bl|br, size }`
(`size` is the share the mode uses: the column's width, the card's width over the frame's shorter side, the
lower part's height). The footage moves from the previous footage scene's mode to this one's on the style's
`move` ease over its `standard` duration, starting 0.15 s before the scene lands, and breathes by `drift`
while held; the pose at any `t` is computed from the scene list alone (`runtime/kit/speaker.js`), so a seek
in any order draws the same frame. A scene with a `panel` beat and no `frame` takes the brand's `panelFrame`
(default `side`), any other the brand's `frame` (default `hero`). A story that names no frame and whose brand
sets none leaves the footage to its layout, as before. The talking layouts have a `panel` slot: the region of
the frame the speaker leaves (the safe area in hero, inset and hidden), holding a tile or a picture; their
headline and caption keep to the panel's columns. The brand's knobs live under
`style.patterns["layouts/talking-full"]` (and `…talking-cutout`): `frame`, `panelFrame`, `side`, `corner`,
`sideSize`, `insetSize`, `bottomSize`, `drift`, `face`.
The kit writes, on each footage scene's section, `--mm-speaker-x|y|w|h`, `--mm-panel-x|y|w|h` and
`--mm-face-x|y|w|h|cx|cy` (px of the frame), and `window.mm.faceBox()` returns the face box now. The face
box is the head from the person matte (`mm footage matte` writes `face.json`, one head box per source
frame; the kit takes the median over the shot's frames, so it is steady inside a shot and changes at a cut),
else a default centred on the format, padded by 12 % each side, measured at the widest of the drift. An
element a layout marks `data-face-safe` (headline, caption and panel tile of both talking layouts) is moved by
its own `left` and `top` to the nearest place inside the safe area that is clear of the face and of the
elements placed before it; a caption that spans a cut therefore moves to the new shot's place at the cut.
A default face (no matte) is only a guess: with no `frame` named anywhere and no matte, the variables are written but nothing is moved and `mm.faceBox()` is null, so a talking piece made without speaker frames is left as its layout draws it. W-FACE (§7) warns where text still covers the face.

**Layer packs.** A beat asset named `source.png` with a `media.json` of `kind: layers` beside it (`mm
media layers`) is a layer pack: by itself it renders as the plain picture, and `moves/depth-parallax`
reads the pack's plate, parts and depths to move it and, through its lens, to soften the layers that lie
away from the nearest one.

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
at identity at p = 0: frame 0 is exactly the finished hook, W-HOOK holds, and the first second is
not a still card.

Rules the schema cannot express are checked by the gate: film length 20 to 60 s and deck 6 to 20 presses
advise (**W-LENGTH** warns, it never blocks); every `fx`, `layout`, `cut`, `move` and screen action resolves to a listed pattern (**G-PATTERN-REF**);
every `fact` id resolves (**G-FACT-REF**).

A **loop** (4 to 15 s, G-LOOP) is a film whose story says `"kind": "loop"`: a short piece that ends on its
first frame so it can repeat. `mm new` scaffolds a film or a deck; scaffold a film and change its
`kind`.

## 5. Pattern contract

Groups: `entrances`, `exits`, `emphasis` (indicate, circumscribe, spotlight, roulette: there-and-back
moves that direct the eye without changing content; roulette's box runs along the element's sibling
slots and lands on the element), `transitions`, `layouts`, `moves`, `text`,
`data`, `devices`, `sound`, `3d` (Three.js patterns; a module may declare `ambient: true`, scheduled
as a move from its arrival to the scene's end; `3d/point-cloud` rebuilds a beat's picture (a cut-out, a
picture keyed from a flat ground, or one displaced by a depth map), an SVG mark or the slot's words as a
free-floating object of points revealed from a seed through a burst and a front, and keeps it alive at rest
(a per-point twinkle and a slow sway, closed forms of the item's seconds; still in a deck): its `colors: palette` canvas is not
declared media and paints only roles and blends of two roles, its `colors: source` canvas is), `screen` (actions on a device screen; the module exports
`reduce(state, p, ctx)` and may export `draw(el, p, ctx)` for its overlay and `paint(screenEl,
state, ctx)` for state that persists, instead of `at()`). A `moves` module may export
`afterItems: true` to run after the entrances in a film seek (it sets its slots' own styles).
Folder `patterns/<group>/<name>/` holds:

| File | Required | Content |
|---|---|---|
| `pattern.html` | layouts, text, data, devices, 3d | a fragment with `data-slot="<name>"` placeholders; no copy. The kit always instantiates a layout's; a text, data or device module's only when it exports `fragment: true`, otherwise the module builds its own markup in `at()` |
| `pattern.css` | all visual groups | styles over `--mm-*` variables only |
| `pattern.js` | entrances, exits, emphasis, transitions, moves, data, sound, screen, 3d | `export default { name, group, params, at(el, p, ctx), dur?, spring?, fragment? }`: `p` is the eased progress the kit computes from `t` (0 to 1; a spring entrance may pass 1, except on a type layer, §6) and `ctx` is listed below; sound patterns export `{ name, group, render(ctx, at, feel, opts), durationS, anchor? }`, where `anchor: "end"` places the cue to end on its beat's landing (§9); a sound pattern may instead be a `recipe.json` (a cue as data, §9) and then needs no `pattern.js` |
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
selector), `ctx.boil` (which frame of a pen's shiver shows now), `ctx.t` (the instant being drawn:
piece seconds in a film, the press position in a deck, for a pattern that keeps time with the piece
rather than with its own beat), `ctx.footage` (when the story has footage, §4), `ctx.afterSettle(fn)` (runs `fn`
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
`dataset.media` in a piece's JS or HTML fails G-BRAND. `canvasText: true` on a
pattern module lets that pattern call `fillText`/`strokeText`, and the pattern then answers for the
text it draws; without it, canvas text fails G-LEGIBLE. In the library, pictures, device screens,
footage and the 3D canvases are declared media, except a canvas that paints only roles (`3d/point-cloud`
with `colors: palette`); the 3D patterns, `entrances/assemble` and `text/garden` declare `canvasText`.

**Pictures rest as themselves, or as seen through a lens.** `entrances/photo-wake` draws in a canvas
declared media over the picture and draws nothing at rest, so a rest shows the plain picture;
`moves/depth-parallax` does the same with `aperture: 0`. With its lens (`aperture` above 0, the default
0.35) the depth parallax canvas stays through the rest and shows the settled picture, the nearest layer
sharp and the far ones discreetly soft, still and the same at every rest instant. Both load their files
(`media.json`, the pack's layers) once per page, and a seek that comes before the files are ready draws
through `ctx.afterSettle`, so a frame stays a function of `t`.

**Type keeps its own text node under ornament.** `text/garden` grows ornament in two SVG layers around
the slot's untouched text (back at z −1 under the text, front at z 1, the slot isolated). An organic
garden kind is a preset of three parts (`stem`: curve, branch, ribbon, root, none; `leaf`: round, lance,
heart, frond, broad; `bloom`: daisy, rose, tulip, bud, berry, spore, camellia, peony, lily, sweetpea),
each settable on its own; `kind: mix` combines two or three presets by seed. Front-layer
cover of glyph ink stays at most 8 % at rest, ornament stays inside `--mm-safe` (a botanical bed
excepted) and off every other filled slot, and ornament inside the slot's own box stays at most 6 % of it
(4.5 % for the kinds beyond vines, flowers, circuits and crystals); a slot that grows a single
plant or nothing is named in `mm.warnings`. The botanical kind draws filled, shaded blooms (camellia,
peony, lily, sweet pea, bud) and broad leaves: each part is its flat role under a gradient of alphas of
one other role, so every pixel is a blend of at most two roles, three under a fine ink line. With
`bed: true` the flowers grow as a bed from below the frame toward the headline: every bloom stays under
the headline's box, only tendril tips reach into its descender band, the whole bed lies under the type,
and the bed is ornament that may run off the frame's bottom and side edges (it is not bounded by
`--mm-safe`, which bounds text). Loose petals may keep floating at rest within about 1 % of the frame's
short side, a function of the piece time (`drift: float`); `drift: settle` holds them still.
With `text: type` the line is typed in reading order over the first `typeShare` of the entrance: while
it is typed its text sits in one block clipped to the characters typed so far, measured from their laid-out
glyph boxes (nothing splits the text, so every glyph stays where the plain text sets it), a caret in the
ink marks the typing position, and every plant starts once the letter it roots on is whole while every
window still ends by p = 1; from `typeShare` on the slot holds its plain text node.
`exits/wither` recedes that garden in reverse growth order, every kind and the bed (petals fly back into
their blooms, blooms close, stems sink below the frame); it passes the piece time to the garden's drawing,
so a floating petal leaves its path without a jump. With `type: keep` its last frame is the bare slot.

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
`entrances/diagonal-join` caps each half's slide by the room its own ink has (the ink box clipped to
that half-plane), and `entrances/card-flip` chooses its perspective from `maxScale`, so neither carries
type past `--mm-safe`; card-flip draws its turn in two halves (the cover turning away to 90°, then the
slot turning in from −90°), so no face is ever drawn mirrored, and the turn is exactly 180° at p = 1.

**Text that splits, and code that edits.** A pattern that animates a line by unit takes its units from the kit's splitter
(`runtime/kit/split.js`, `split.css`) and never cuts on white space: words come from the platform's word segmenter
(a dictionary for scripts written without spaces) with closing punctuation glued to the word before it and opening
punctuation to the word after, letters are whole graphemes (an accent, an emoji with a skin tone or a joined family is
one letter), and lines are read from the laid-out words after the fonts are ready (a word lower than the one before by
more than half its height that has also moved back starts a line; offsets are read, so no transform feeds back). A unit
carries `--line`, `--word` and `--char` (0-based, over the whole text), may sit in an overflow-clip box, and may have an
inert twin one box away for a slot-roll; a deck keeps the original text in a visually hidden first child and marks the
fragments `aria-hidden`. At rest a pattern puts the plain text back. `entrances/words`, `entrances/letter-cascade`,
`entrances/scatter-settle` and `entrances/line-reveal` use it; `text/scramble`, `entrances/typewriter`, `text/split-flap`
and `text/elastic` take their letters from its graphemes. `entrances/line-reveal` brings lines (or words, or letters) in
from behind their clip edge, so it follows the real wrapping at every format. `text/scramble` gives each glyph a ranked
window (`runtime/kit/scramble.js`: a direction, a settle share, a hold, a delay, a jitter, step-aligned ends); inside
its window a glyph shows noise that holds for one step (20 Hz by default) and is a hash of its place and the step, so
no state is kept between frames; with `before` the two texts' common start and end stay still and only what changed
steps ("v1.2" to "v1.3"); noise and settled glyphs take palette roles and the noise comes from a named pool or the
brand's own glyphs. `text/code` (`runtime/kit/code.js`) draws a block of code on a character grid whose steps are edits
(`edit`, `append`, `prepend`, `insert`, `remove`, `replace`, `select`, `call`, in the beat's `params.steps`): the code is lexed
once when the story's model is built, a patience diff over tokens pairs what stays with what goes, a token that stays
slides to its new place by 0.6 of the morph, the old text fades out over the first 0.4, nothing shows from 0.4 to 0.6,
the new text fades in over the last 0.4, a `select` dims the rest to 0.2 and a `call` puts a labelled box on an exact
range; every token takes one of eight roles (keyword, name, type, string, number, atom, comment, punct) that the
brand sets to a palette role or a tint of one (`style.patterns["text/code"]`), never a fixed theme. The gate counts
arrivals, not morphs, so a long code beat can draw W-DEAD, and W-READ reads its text as words.

**Impact, anticipation and the dissolve edge.** `transitions/impact` draws one scene at a time: the outgoing
scene builds toward a hit (a half punch and a rising fringe), and from the hit the incoming scene is drawn
punched in, shaking under a seeded squared decay that never exceeds its zoom margin, with the fringe at its
peak; punch, shake and fringe are zero at the cut's end. `transitions/anticipation` winds up (a brief pull back by
`pull`, over `windup` of the cut) before the push: `mode: zoom` is two halves that never share a frame, `mode: slide`
carries both scenes edge to edge, never overlapping. `transitions/dissolve-edge` reveals the incoming scene through
a seeded turbulence field (the seed is the scene's id) at a level that rises with the cut, so the area revealed is
about the cut's progress, and a band just outside the reveal burns in the palette role `glow`, kindling over the first
tenth of the cut and dying over the last. All three take their colours from palette roles, write only on the
sections and overlay nodes the kit removes on every seek, and leave the incoming scene unfiltered, unscaled and in
place at p = 1.

**Transitions never double-expose type.** `transitions/zoom-through` is two halves that
never share a frame: until the middle of the cut only the outgoing scene is drawn, growing to
1 + `depth` and dissolving to nothing; from the middle only the incoming scene is drawn, growing from
1 / (1 + `depth` / 2) to rest and fading in. The fading section drops its own canvas fill while it
fades, so no canvas-on-canvas box composites a level off. `transitions/flood` and
`transitions/brush-wipe` follow the same rule: until the middle of the cut only the outgoing scene is
drawn under the flood or the bands, from the middle only the incoming one, and the swap happens while
the frame is fully covered. Transitions that show both scenes at once (`wipe`, `iris`, `cover`,
`re-ink`) never fade either: every pixel shows one scene, because the scene on top keeps its opaque
canvas. A transition may draw a copy of a section (`transitions/re-ink`) from `ctx.afterSettle`, so the
copy carries the seek's drawn state; the copy drops `data-scene` and is marked `data-mm-overlay`. Into
a scene holding a canvas, a video, footage or a device screen, re-ink copies nothing and wipes with a
plate in a palette role instead; it reads that from the story (the markup at mount, the slots' patterns
and the scene's move), so a pattern that makes its canvas only once it runs is plated from the first frame. `.mm-camera` is a stacking context (`z-index: 0`): a layout's
z-index orders elements inside its camera only, never above the scene's finish or a transition's
overlay. With `land: dot` or `land: circle`, `transitions/flood` shrinks its disc onto a round mark
of the incoming scene: the tittle of the first i or j in the `to` slot's text, else a full stop or bullet
(read from the letter's rasterised mask with `glyphs.js` `dotOf`; the module declares `canvasText`), or
a round element. It settles on a strong ease-out onto the mark's centre and upright semi-axes within a
pixel, in the flood's own role, and fades off it over the last 0.1 s, so p = 1 shows only the real mark;
with no such mark it lands on a point and notes it in `mm.warnings`. The flood lasts 1.3 s under every
motion style, divided by `speed` (0.5 to 2, never under its phases' floors): a cut module whose default
export carries `durOf(params)` is sized by the scene's `cutParams` in `schedule()`, so the kit and the gate read the same cut.

**An emphasis may own a look.** An emphasis pattern's stylesheet may style its slot through the
`data-emphasis` attribute the kit writes, so a look that must hold at rest (a stamp, a dimension, the
answer a roulette lands on) belongs to the slot while the module animates only inside the emphasis
window. Such a beat arrives with `params.instant: true`, and the params its stylesheet reads are the
beat's own (`data-p-*`), not `params.emphasis`. `emphasis/stamp`, `emphasis/dimension` and
`emphasis/roulette` work this way. With an entrance instead, a stamp or dimension look arrives with
the entrance, the window plays only the landing (stamp) or nothing (dimension), and a note goes to
`mm.warnings`; a roulette answer with an entrance shows its mark during that entrance. An
emphasis may also hand its end state to its slot's entrance: `emphasis/act` keeps a mood through
`entrances/character`, and `emphasis/wash-bloom` keeps its wash through `entrances/sketch`; the
entrance reads `data-emphasis` and draws the kept state once the window has passed.
`emphasis/dimension` spans what it measures: the slot's own text, or the `for` slot's, from its first
glyph's ink to its last. The module measures each one once when the piece has mounted, with each scene at
its rest, and writes the geometry into a stylesheet of its own (`style[data-mm-dimension]`) that no seek
restores, so every rest draws the same line.

**Layouts are markup and style only.** A layout has no module and no clock. Layouts may place
elements with CSS anchor positioning and read numeric beat params with typed `attr()` (the renderer is
Chromium 133 or later): `layouts/label-column` places each label's point on the picture and draws its
leader that way, `layouts/shortlist` sets the result card under the pick, and `layouts/talking-cutout`
stacks its backdrop words when the backdrop's beat carries `lines: 2`. A layout state that
follows an arrival keys on the `visibility` the kit writes on a slot not yet arrived, as
`layouts/list-reveal` and `layouts/shortlist` do.

The card has exactly these sections, in order, each non-empty: **Purpose** (one sentence), **Use
when / Do not use when**, **Params** (table: name, type, default, meaning), **Style variables
consumed**, **Legibility and rest notes** (what the pattern guarantees at `p = 1`), **Provenance**
(source, licence, what changed; or "original"), **Known limits**. `scripts/pattern-lint.mjs`
enforces the folder, the sections, the literal ban and that the demo story validates
(**W-PATTERN-CARD**, **W-PROVENANCE**, **W-LITERAL**: failures in the lint, warnings when a piece's own patterns have the same fault); photographing the demo is `mm pattern stills`, not the
lint. An incomplete folder is not listed by `mm pattern list` (AXIOM 4), which is the lint's own `list()`.
`mm pattern lint <name>` lints one pattern (`group/name`, or a bare name unique across `patterns/`; an
ambiguous or unknown name exits 2). W-PROVENANCE matches a card's source exactly (normalised,
parenthetical notes removed) against a name in one of PROVENANCE.md's source tables (a table whose first
header cell is "Source"), never a pattern id or a substring.

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
| `data-decor` | on a slot: decoration text (a backdrop); it may not carry a fact or the call to action and keeps the body floor (G-LEGIBLE) |
| `data-over` · `data-bleed` · `data-keep` | overlap intended · may cross the frame edge · audit at rest despite no entrance |
| `data-fit` | written by the kit on a layout's `mm-fit` headline that no size could clear from the scene's other slots (`tight`); a layout may give it more room (split steps its figure down; list-reveal steps its items down to the body size) |
| `data-hook` | written by the kit on the first scene's `<section>`: the hook. Inside it the kit raises `--mm-headline-scale` by one step (1.25) |
| `data-align` · `data-p-align` | on a layout root · on a slot: `left` or `center`, overriding `--mm-align` for the scene |
| `data-mm-overlay` | a node a transition added outside its scenes; removed on every seek (§5) |
| `data-footage` | on an `<img>` in a layout: the kit points it at the story's footage frame for `t` (§4); the layout also declares it `data-media` |
| `data-footage-matte` | on a `data-footage` picture: masked by the story's person matte (§4) |

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

**Easing, springs, inertia, stagger.** An ease is a function of `p` whose ends are exactly 0 at `p <= 0` and 1 at `p >= 1`. A brand writes one as a string, in `style.motion.easings` (`enter`, `exit`, `move`, and any role it adds), in `style.motion.stagger.ease`, or in a beat param; the grammar (`runtime/kit/ease.js`, `curve.js`):

| Spelling | Means |
|---|---|
| `linear` · `ease` · `ease-in` · `ease-out` · `ease-in-out` · `none` · `cubic-bezier(a, b, c, d)` | the CSS curves, as before |
| `<family>.<type>(args)` | family `power(n)`, `quad`, `cubic`, `quart`, `quint`, `sine`, `circ` (input clamped to 0..1), `expo` (ends snapped), `back(overshoot = 1.70158)`, `elastic(amplitude = 1, period = 0.3)`, `bounce`; type `in`, `out`, `inOut` (`out = 1 - in(1 - p)`; `inOut(p) = in(2p)/2` then its mirror) or `outIn` (`(1 - in(1 - 2p))/2` then `(in(2p - 1) + 1)/2`); a bare family is `out`; `outBack(2)` and `inOutCubic` are read too |
| `steps(n[, start\|end])` | `n` jumps, the last frame pinned to 1 |
| `irregular(n[, randomness[, seed]])` | `n` points rising unevenly (never down) joined by lines; seeded |
| `slowMo(ratio, power)` | fast at both edges, slow in the middle (`ratio` the share of time in the middle, `power` how slow) |
| `expoScale(a, b[, ease])` | the ease for a scale from `a` to `b`: mixing by it grows the scale at a constant rate |
| `bias(ease, r)` | leans any ease, `r` in −1..1 (0 leaves it) |
| `linear(0, .25 50%, 1)` | CSS `linear()` stops, positioned as CSS reads them |
| `curve(M0,0 C…)` · `curve(x1, y1, x2, y2)` · `curve(0,0, …)` | a custom curve from SVG path data or numbers: four numbers are a cubic-bezier; a path from (0,0) to (1,1) reads as drawn (y up), any other as an editor drew it (x scaled to 0..1, y flipped, 0 at the first point and 1 at the last); made a function of x (the backward stretch dropped, a vertical step kept) |
| `anticipate` · `reverse(ease)` · `mirror(ease)` | wind back then land; the two modifiers the types are made of |

Every pre-existing spelling keeps its exact values. `ease.overshoot` works for all. `cssEasing(str)` gives the CSS easing (keywords and cubic-bezier as written, `steps()`, else a sampled `linear()`), which the kit writes to `--mm-ease-<role>`. **W-EASE** (§7) reads every ease a piece spells.

Springs take an optional `velocity` (distances per second; 0 from rest): `{k, c, m, velocity}`, `{bounce, period, velocity}`. The closed form carries it in all three regimes, over-damped as a sum of two decaying exponentials (nothing overflows), and `spring.velocity(t, params)` is the analytic speed. `soft: true` on a negative bounce keeps the arrival time of the critical spring of the same period, so the bounce changes the shape of the curve, not when it lands (without it an over-damped spring lands late, as before). `{preset: name}` or the name in `params.spring` picks one of seven feels, `spring.presets`: `beat`, `plop`, `bounce`, `swing`, `jump`, `strike`, `smooth` (a preset may overshoot more than a calm style's `overshootMax`, and `bounce` rings for 17 s; W-OVERSHOOT and W-HOLD say so). `spring.from(t, params, {from, to, velocity})` moves between any two values; `spring.settle(params, eps)`, `spring.settleFrom`, `spring.physics` and `spring.overshoot` accept a velocity. A style may name more springs than `ui`, `type` and `heavy`.

`inertia({from, velocity, power = 0.8, timeConstant = 325 (ms), min, max, snap, elastic, bounceStiffness, bounceDamping, restDelta})` (`runtime/kit/inertia.js`) is a throw in closed form: `x(t) = target − amp e^(−t/τ)`, landing on the target, on the nearest of the places `snap` lists (or a step, or a function's answer), or on a bound, which it meets at `t_b = −τ ln((target − bound)/amp)` and where a spring takes over with the friction curve's own speed. `FEELS.drag` is the slower feel (τ 750 ms).

`stagger.js` spaces n items: `staggerOffsets(n, {each | amount, from, grid, axis, ease, reverse, seed, jitter, use, total, cap, start})`. The distance of an item is its straight-line distance (or along one `axis`) from the origin `from` (`first`, `last`, `center`, `edges`, an item index, a ratio pair over the grid, or `random`, a seeded shuffle) on a row, a grid `[cols, rows]` or a block `[cols, rows, layers]`; it goes through `ease` (the last item reaches the full eased delay), `reverse`, and the shuffle; `use` ranks the items by a list of data values; `total` lays out more slots than items; `jitter` is a seeded wobble, a number of seconds or a ramp `[start, end]`. A cascade beat sets `params.stagger` to a number of seconds (the gap) or to such an object, and a brand sets `style.motion.stagger.from` and `.ease` for every cascade; `capS` still bounds the whole spread. `maths.js` holds `clamp`, `mapRange`, `wrap`, `wrapYoyo`, `snap`, `randomAt` (a float from a seed and an index), and `arcDelta` / `rotateTo` for the shortest, clockwise and counter-clockwise turn (`"-170_short"`). `mm style export-motion` (§8) writes a brand's eases and springs as CSS or JSON tokens; `mm brand sheet` plots every curve with its settle time and overshoot.

**Timeline algebra** (`runtime/kit/schedule.js`, pure, shared with the gate). Every node is a
measured duration `d` and a function of local time `u ∈ [0, d]`, clamped outside. Primitives:
`clip(d, f)`; `seq(a, b, …)` with cumulative starts; `par(a, b, …)` with duration `max`;
`delay(x, a)`; `stagger(each, items, {from, grid, axis, ease, …})` (below) as a `par` of delays;
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
region labelling) are shared helpers, not rules. W-PATTERN-CARD and W-PROVENANCE call
`scripts/pattern-lint.mjs` on the patterns a piece references. §14 maps every file to its test
and its negatives.

The prefix is the severity, with one named exception: G-PATTERN-REF also WARNs on a `screen: ` warning from the kit or the schedule (below), which is advice. A `G-` rule guards what breaks a piece (it cannot be rendered the same
twice, it plays wrongly, it is missing what it needs, it shows placeholder text, it states an
unsourced fact, its text cannot be read) or what stops it being the brand (a colour or a face the
brand does not own); a FAIL blocks `mm export`. A `W-` rule advises on a craft choice, with
evidence, and never blocks an export.

Frame-sampling rules read a film at its rests. A film scene that has no rest (its last arrival is
still running at its cut; W-SCENE-END advises on that) is also read at its last instant, so no scene
ships unread: G-BRAND, G-PLACEHOLDER, G-LEGIBLE, G-LOCAL and G-FACT-REF judge everything there, and
G-LEGIBLE, G-EDGE and G-OVERLAP leave out an element still arriving at that instant (where it sits and
how large it is are judged once it is in place).

| Id | Checks | How |
|---|---|---|
| G-TIME | every frame is a function of `t` (§2.3, §2.4) | static grep (names, realm and SMIL markup, custom-property durations); runtime recorder (no call from served code, realms and threads refused, no child realm); computed styles at three instants |
| G-DETERMINISM | same `t`, same pixels (§2.5) | two page loads, one in order and one in reverse; three instants plus one per scene; PNG byte compare |
| G-LOCAL | everything travels with the piece (§2.6) | static scan of URLs and relative roots; every frame, tile or layer a prepared asset's `media.json` names exists (a layer pack is found through a beat asset named `source.png` beside its `media.json`); a story's footage folder holds `media.json`, `edit.json` and every frame the edit's clips show; `document.fonts` all `loaded`; at every rest, every visible text element (`::before`/`::after` included) is painted only by web fonts (CDP `CSS.getPlatformFontsForNode`, no `isCustomFont: false`) |
| G-BRAND | the piece stays the brand: computed colours ∈ palette; computed family is a style family; rendered pixels ∈ the palette and its blends | computed sampling at rests (an alpha of a role passes); the first computed family of each visible text element ∈ `style.type.*.family`; no `data-media` in piece code; pixels at each rest: a pixel is off when it lies farther than **ΔE 2** (CIE76) from every role, every sRGB blend of two roles and every sRGB blend of three (a gradient through brand colours, a translucent role or a glow over one) and every `multiply` or `screen` blend of roles (two levels deep, as overlapping blended discs make), and is not the brand ground or a blend of it with a role. A black vignette fails: black is not a role, and a multiply darker than the darkest role or a screen lighter than the lightest is black or white; a vignette toward the darkest role passes. A global `contrast()` or `saturate()` grade fails: it shifts the brand's own colours; the style's `finish` (`vignette`, `grain`, `halftone`, `edgeFringe`, `paperEdge`, `scanlines`, `chroma`, `bloom`, `look`) is where brand-safe finishes live. A `finish.look` is part of the brand: the frame is read through the look's tone tables undone (`ungradeLuts`, `ungradeImage`, `runtime/kit/finish.js`), so a blend of roles is judged where it was made, before the grade bent it, and a piece that wears the look its style declares passes, and a grade the style did not declare, over it or without it, fails. Off pixels form 4-connected regions; **a region under 2 px tall or under 2 px wide is not a finding of its own** (the antialiasing row along an edge), but its pixels count toward the share. FAIL when more than **0.5 %** of the stage's pixels are off (1 px stripes, a checkerboard or a dither add up there), or when one **region exceeds 256 px**. Masked: only the content box of media (`img`, `video`, `embed`, `iframe`, SVG `image`, an `object` without fallback content, and a leaf a pattern declares `data-media`; a `canvas` only inside one). Masked pixels are read from the same frame shot with that media hidden. A `background-image` never masks. Calibration: every shipped piece in every format (43 runs) peaks at 0.000 % off and no region, where blends of two roles peaked at 0.25 % and 60 px; the presets' palette sheet (`fixtures/negatives/_palette/`) at 0 % and 0 px, where it peaked at 0.30 % and 95 px; the four goldens stay under ΔE 1.13. The weakest negative (a hue-rotated headline) measures 1.2 % and the smallest region negative 832 px, so the budget stays 0.5 % and 256 px. Blends of up to three roles and multiply and screen blends of roles together explain about 1 to 3.5 % of the sRGB cube, so an unowned hue stays unexplained |
| G-PLACEHOLDER | no `TODO`, `lorem`, `[…]`, `XXX`, `{{` in rendered text, in the story's own text (every beat `text`, every scene `say`, `cta`, `share`) or in a shipped SVG's text | text walk at every rest, `::before`/`::after`/`::marker` included; the story's text fields read statically, so a line that appears and leaves between rests is caught; `<text>` and `<foreignObject>` of the piece's `.svg` files and of `data:image/svg+xml` URIs, with every entity form resolved first (predefined names, decimal and hex references, DTD-declared entities, CDATA) |
| G-LEGIBLE | at every rest, each text element's rendered size ≥ its floor (§12); `data-micro` ≥ micro floor, and `data-micro` text may not carry a fact or the call to action (a beat that cites a fact, or text that shows a fact or the call to action, under `data-micro` fails); `data-decor` text (decoration: a layout's backdrop words) may not carry a fact or the call to action either, and is held to the body floor, not the micro floor; no text the gate cannot measure | computed size × the scale its transforms give it on screen (screen box over untransformed box, the smaller axis; SVG by its screen CTM); `::before`, `::after`, `::marker`, and `::first-letter`/`::first-line` when they restyle their host. No shadow root: static `attachShadow`/`shadowrootmode`; the recorder refuses `attachShadow`; CDP `DOM.getDocument({ pierce: true })` finds no open or closed root in the stage. No canvas text (`fillText`, `strokeText`, static and recorded) unless the drawing pattern declares `canvasText: true` (§5) |
| G-REST | deck: at every rest no element has progress strictly between 0 and 1; film: likewise at each settle rest (where a scene's last arrival has finished). A deck press drawn mid-entrance breaks the deck | kit reports progress per element; SKIP for a film whose every scene ends while something still arrives |
| G-EDGE | at rests, no text box crosses the safe margin (§12) unless `data-bleed`; with `story.platform` (`reels`, `tiktok`, `shorts`; 9x16 only) no text enters the bottom 500 px or the right 120 px either | DOM boxes; `::before`/`::after`/`::marker` text has its own box (CDP `DOM.getBoxModel`); a host and its own generated text, `::first-letter` and `::first-line` count as nested. SKIP when no text is present at any rest; a PASS carries `{ instants, texts }` |
| G-OVERLAP | at rests, no two text boxes intersect unless one carries `data-over` | DOM boxes; `::before`/`::after`/`::marker` text has its own box; a host and its own generated text, `::first-letter` and `::first-line` count as nested. SKIP when no text is present at any rest; a PASS carries `{ instants, texts }` |
| G-LOOP | a story of kind `loop` ends on its first frame (`autoReturn: true` has the kit build the return: over the last min(1.2 s, 15 %) before the last exported frame, each beat of the last scene that arrived with an entrance plays it back to p = 0, last arrival first, never before the scene rests; instant beats stay): the frames at 0 and at the last exported instant differ in at most 0.2 % of pixels by more than 6 levels (*provisional*) | rendered pixels |
| G-END | deck: `goto(presses + 1)` changes nothing | render compare |
| G-PATTERN-REF · G-FACT-REF | every reference resolves (§4); a beat's `cue` resolves to a folder of `patterns/sound/` holding `pattern.js` or `recipe.json` (the cue is an open name, not a closed list). G-PATTERN-REF also fails a screen action whose mark (`at`, or scroll `to`) the screen it acts on does not carry, naming the beat and the mark, and WARNs on any kit or schedule warning that starts `screen: ` (a play `rate` ≤ 0, a deck screen `step` past its scene, screen actions on a slot with no `[data-screen]`, a laptop menu of more than 5 items). G-FACT-REF also fails when a fact marked `sample: true` is cited by a beat visible at a rest where no visible element with `data-sample` and text has area inside the stage; a mark is looked up on the screen the kit shows when the action starts (a swap changes it at its end; `cut` at once) | story vs listing; `media.json` on disk (`screenIssues`, shared with the kit); DOM at rests, per format |
| W-PATTERN-CARD · W-PROVENANCE | §5: every referenced pattern's folder, card and demo pass the lint, and its card's sources have a row in `PROVENANCE.md`. A piece with its own patterns is warned and never blocked; `mm pattern lint` and release-check's R-PATTERNS fail the library on the same problems | pattern lint on the patterns a piece references; SKIP for fixture stubs |
| W-LITERAL | a literal colour, family, size, space, radius, duration or easing in the piece's CSS (the piece's own folder, its own patterns included); library patterns are held to the same text by `mm pattern lint`, where it fails | regex on CSS (`#hex`, `rgb(`, `hsl(`, `oklch(`/`oklab(`/`lab(`/`lch(`/`hwb(`, `color(`, `color-mix()` of a literal, CSS named and system colours, `font-family:` not `var(`, a family list in a custom property, `ms`, `cubic-bezier`, non-zero `px` in padding/margin/gap/border-radius, `font-size`). A warning because a literal that renders a colour or face the style owns is still the brand; one that does not is G-BRAND's failure. `W-DUR-LITERAL` stays its own rule: it reads the story's `params.dur` and the markup's `data-dur`, which are not CSS |
| W-LOUDNESS | when audio exists: integrated loudness −14 LUFS ± 1 (*provisional*, platform norms); platforms normalise overall loudness, so a quiet or loud mix warns | the same measurement as G-PEAK |
| W-SCENE-END | film: at each scene's last instant no element has progress strictly between 0 and 1. Motion carried into a cut is a technique (a match cut, a whip), so it warns and the scene is still read by the frame-sampling rules at that instant; a deck is SKIP | kit reports progress per element |
| G-PEAK | when audio exists: true peak ≤ −1 dBTP (*provisional*, platform norms); above it the mix clips on every platform | ffmpeg `ebur128` on the MP4s that ship; SKIP when they have no audio stream (a stale `out/mix.wav` is not measured beside them) |
| W-HOOK | film: frame 0, deck: rest 0 shows the first scene's headline finished | the headline is the first scene's `headline` slot, else its earliest beat; the kit reports progress 1 (`params.instant: true` / `step: 0`) and at least 3 % of its text box differs from the colour behind it by more than ΔE 2 |
| W-DEAD | film: no window of 4 s (*provisional*, from published motion-studio practice) without an arrival, departure, cut or move keyframe | from the schedule |
| W-QUIET | film: ≥ 2 s (*provisional*, from the author's practice) between the last arrival and the end; deck: last press introduces at most one element | from the schedule |
| W-LENGTH | film 20–60 s; loop 4–15 s; deck 6–20 presses (*provisional*) | story |
| W-FADE-ONLY | more than 70 % of entrances are `fade` (ban `fade-only`) | schedule |
| W-READ | a scene's words × 0.3 s + last arrival > scene duration (*provisional*, from the author's practice); or a line settled (end of its entrance to its `out` or its scene's end) shorter than 0.8 s for 1 to 3 words, else max(1.2 s, 0.3 s × words) (*provisional*, brag); a line still arriving at its scene's end is W-SCENE-END's | story, schedule |
| W-CUE | a sound cue more than 40 ms from the nearest beat when a usable grid exists, or a rendered cue off its picture event (*provisional*): a sound leading its picture by more than 45 ms (early), a struck peak more than 75 ms after it (late), a whoosh apex more than 45 ms from its cut, a riser ending outside 250 ms before to 30 ms after its hit, or ringing on more than 30 ms past its peak. A deviation that one role offset of 30 ms or more explains is deliberate and named in the evidence; a beat's `params.cue.soundOk: "reason"` acknowledges one | cues vs `beats.json` (a grid with `usable: false` is not snapped to) and vs the sync lock in `out/cues.json` that `mm sound` wrote (the measured onset, peak, apex and end of the rendered cue against its picture event, an end-anchored cue at its landing); with no usable grid and no lock: SKIP |
| W-DUR-LITERAL | numeric `data-dur` | markup |
| W-BAN | detectable bans: first scene is one centred text block over a gradient canvas; text smaller than caption inside the four corner zones; a full-frame border element | DOM at rests |
| W-SUB | export with `--sub` > 1 while a text element travels more than 4 px per frame | every frame at the export fps in the page, the largest move of a visible text element's box between consecutive frames; `--sub 1` never warns; a deck is SKIP |
| W-CONTRAST | at rests, body text below WCAG 4.5:1 against its sampled background, or display text below 3:1 (*provisional*, WCAG AA) | computed colours at rests; the text colour is read as painted, faded by the element's own opacity times its ancestors' (a ghosted line warns with its effective contrast and the opacity); `::before`/`::after` included; a colour pair it cannot parse makes a clean result SKIP (partial). A text box with no background of its own is also measured against the rendered pixels under it, shot with every text transparent (5th percentile; the lower ratio counts) |
| W-PACE · W-HOLD | arrivals per 10 s outside the motion style's band (a screen action counts as an arrival); a rest shorter than `holdMinS` (*provisional*, from the motion style) | schedule vs style; W-PACE is SKIP for a film under 5 s, where no 10 s window is judged |
| W-EMPTY | a film run of more than 6 frames (30 fps) whose ink, the pixels farther than ΔE 2 from the canvas colour, is under 0.5 % of the frame | frames at quarter scale; every third frame first, candidates frame by frame; a deck is SKIP |
| W-ENTRANCE | a visible element inside a scene with neither an entrance nor `data-keep` | DOM vs schedule |
| W-STAGGER | a `data-each` cascade longer than `stagger.capS`, or a film scene's first arrival earlier than 0.1 s after its cut settles (*provisional*, hyperframes and `emilkowalski/skills`) | schedule; the film's first scene and a scene that arrives by a hard cut are exempt; an `instant` beat at the scene's start is revealed by the cut, not an arrival, so the first arrival is the first beat that animates |
| W-AMBIENT | an idle move whose amplitude exceeds 20 % of the scene's primary travel, or text scale oscillating beyond ±5 % (*provisional*, hyperframes layers) | kit report over a rest; a moving scene with no rest, or one whose entrances do not travel, is not measured: SKIP (partial). A deck is SKIP: the gate does not measure camera moves in decks yet |
| W-CAPTION | two caption groups visible at once, or a group outside `motion.captions.wordsPerGroup` | DOM at sampled instants; without that range (not yet in the motion schema), a clean result is SKIP (partial) |
| W-OVERSHOOT | overshoot above `motion.overshootMax`; type and opacity never overshoot (§15) | declared: every `motion.spring` role (`spring.overshoot`), and the `type` role ≤ 0.1 %; reported: the kit's per-element value; measured: each entrance sampled 17 times from what its pattern writes, so text past its resting place by more than 0.5 px, text scaled past rest by more than 0.5 %, or opacity dipping more than 1 % after reaching full warns |
| W-MIX | sound: more than two cues sounding at once, a cue retriggered within 45 ms, cue peaks outside 6–8 dB above the bed (a cue with no bed in the second before it, marked `bedFallback` in `out/cues.json`, plays at the profile's fixed level and is not held to it), cues per 10 s outside the style's band, a cue with no visible event, or a stereo mix that leans more than 0.5 dB to one side (left minus right, K-weighted energy, recorded by `mm sound` in `out/cues.json`; a `cues.json` from before it was recorded is not judged for it) (§9) | cue list vs schedule, `ebur128` on stems; a clean result with an unmeasured sub-check (no `out/cues.json`, a cue module missing, or no bed in the mix) is SKIP (partial) |
| W-ASK | the style still lists fields a capture could not measure (`ask`) | the composed style's `ask`; WARN while it lists anything, PASS when it is empty or absent |
| W-FACE | text whose box covers more than 10 % of the speaker's face box (`mm.faceBox()`: the matte's head, else a default, padded); a text with a plate of its own is measured by the plate; decoration (`data-decor`) and device chrome are not counted (§4) | DOM at the rests, every scene's last instant and its middle (at most 24 instants); SKIP for a deck, a story with no footage, or when the speaker is never on screen (`hidden`) |
| W-GEN-BRAND | a generated asset the story uses (a picture, clip, music, sound effect or voice made with `mm gen`, §8) was made before the brand changed, or with `--brand off` | each asset the story names (a file under `assets/gen/`, or a prepared folder `assets/<name>/`) with a record `assets/gen/<name>.gen.json`: the record's `brandHash` against the hash of the same style fields now (§8); a record of work that was never steered (a transcript, an import) is skipped; an asset with no record is not read |
| W-ANCHOR | a beat that names the spoken word it illustrates (`anchor`, film only) arrives from 1.8 s before to 0.2 s after the first word of that phrase (*provisional*, from edit practice; a style's `gate.anchor` `{ earlyS, lateS }` sets its own). Statuses per beat: `late`, `early`, `anchor-miss` (the phrase is not in the words), `no-words` (an anchor and no words to check). The fix it names: arrive at the word minus 0.5 s (`suggestedAt`, a scene-local `at`) | schedule vs words: the footage edit's `words` (`footage.asset`, on the film's clock), else the voice's `<audio.track basename>.words.json` beside the track (`[{text,start,end}]`, `{words}` or WhisperX, as `mm footage cut --words` reads). A phrase is its words in a row, case, punctuation and accents folded; said twice, it is matched at the occurrence nearest the beat. Any late, early or anchor-miss warns; an anchor with no words is SKIP (partial), never PASS; no anchor in the story, or a deck, is SKIP |
| W-POP | a single frame that differs from both neighbours by at least 0.2 % of the picture while the neighbours differ from each other by at most 30 % of that is a pop: one wrong frame inside a motion (*provisional*) | frames at 30 fps, quarter scale, as brightness (a pixel counts when it moves more than 12 levels), read densely across each entrance, exit and move (not a device screen's motion, not an ambient one; a move over 1.5 s is read at its first second and its last half second); a cut's span and the frame before it are left out; at most 600 frames a format, then SKIP (partial) when nothing was found; a deck is SKIP |
| W-DEADSTOP | a dead stop or front-loaded ease: one frame step carries at least 60 % of a motion's whole change and the steps after it each stay under 5 % of that jump for at least three frames and a third of the motion; a stitch: one element's motion ends abruptly (its last moving step at least 35 % of its peak), at most two frames stand still, and a different motion of the same element starts abruptly (*provisional*). The fix it names: one gesture, eased through | the same frames as W-POP (read once, cached); a deck is SKIP |
| W-FOCUS | at a rest, two or more beats carry the accent role at full strength (text painted in it, or a fill of it, at an effective opacity of 95 % or more) compete for the eye; a finished text left between 5 % and 50 % effective opacity (its own opacity times its ancestors' times its colour's alpha) is a leftover: retire it to 0 or keep it at full (*provisional*) | DOM at rests, grouped by the beat that brought the element; `data-decor` and `data-chrome` elements, an element still arriving, and (for the leftover) `data-keep` are left out. The luma tiers of ink and muted are not counted: a scene reads in ink |
| W-TOKENS | across a format's rests, more than 4 distinct stroke widths (a painted border, an outline, an SVG stroke), 5 font sizes or 3 corner radii (*provisional*; a style's `gate.tokens` `{ strokes, sizes, radii }` sets its own): the machine signature of a new value for every element | computed styles of every visible element at the rests, as drawn on screen (scale included) and rounded to a whole pixel, so 17 and 18 are two values; a radius of half the box or more is one value, "round"; a transparent border draws nothing and is not counted |
| W-SEAM | across a cut, an element that exits (`out`) and the first element of the next scene to arrive within 0.5 s of the exit's end or the cut travel in opposed directions, or at speeds more than 5 % apart (*provisional*; a style's `gate.seamPct` sets the percentage) | the direction the patterns declare (`side`, `direction` or `dir`, from the beat's params, the exit's own bag first, else the pattern's default), else the one measured from the element's box between 15 % and 85 % of its motion; the speed is the measured travel over the motion's duration, else the durations alone; an element that does not travel (under 0.5 % of the frame width) is not a seam; no such pair, or a deck, is SKIP |
| W-ASSET-LICENSE | an asset the story uses that MM did not draw (a still, a recording, a captured page, imported or generated media, a sample; a media file or a frame-sequence folder, not a words or beats file) has no licence record `assets/<name>.licence.json`, a record that cannot be read, or a licence outside the allowlist (`own`, `generated`, `CC0`, `CC-BY-<version>`, `public domain`; share-alike, non-commercial and no-derivatives variants and "third-party, ask" are outside it) unless the story's `licences.accepted` lists the asset or the licence (§8) | story vs `assets/`: each referenced media asset that is on disk, its record found beside it (`assets/<name>.licence.json`, for a file in a folder the folder's, for a generated asset `assets/gen/<name>.licence.json`); an asset that is not on disk is not read; no media asset is PASS |
| W-LOOP | a story's declared open loops (`loops`: `id`, `opens`, `closes`, `question`): more than two open at once (one main, one secondary), a loop that never closes (no `closes`, a scene the story lacks, or one before the scene that opens it), a loop that closes after the scene that shows the call to action | story; a loop is open from its opening scene up to, not including, its closing one; the call-to-action scene is the last scene whose beats carry `cta.text` or `cta.url`, else the last `outro`, else the last scene; no `loops` is SKIP |
| W-SAMEBOX | the anti-template check. At each scene's rest (a film's settle rest, a deck's last rest of the scene) the boxes of the content the viewer reads (text, and anything painted: a card, a picture, a device), as a share of the frame and snapped to 5 %, sorted, are the scene's box signature. More than half of the scenes of a piece of 4 or more scenes carry one signature (cardification: every scene the same card), or two scenes that follow each other use one layout and one signature (they differ in text only) (*provisional*; a style's `gate.sameBox` `{ share, minScenes, quant }` sets its own). A scene of fewer than 3 boxes is a title, not a card, and counts in neither test | the probe at the rests: elements of the scene with text or paint, not still arriving, not `data-decor`, `data-chrome` or `data-caption`, not over 90 % of the frame (scenery) nor under 0.5 % (a hairline), by layout box; fewer than 4 scenes at a rest, or no scene of 3 boxes, is SKIP |
| W-PALETTE | when the style sets a sound profile (`sound.profile`, §9), a cue the piece plays is off it: **register** (the spectral centroid above the profile's `register.maxCentreHz`, or more than 2 % of the power under three quarters of `register.minHz`), **attack** (a struck note, one that rises in 10 ms or less, slower than the profile's `envelope.attackS` upper end plus 3 ms for the measurer's window; a slower onset is a swell and has no band), **length** (the time the cue rings, until it is last within 40 dB of its peak, longer than the ladder step of its family (input 0.06 s, surface 0.3 s, outcome 0.65 s) plus two thirds of the profile's room, or shorter than a third of the step under it; the family is the cue's own declared length, a sample's trimmed length, else the measured ring times 1.5; a swell has no band), **level** (the loudest 100 ms, K-weighted, outside `loudness.cueLufs100ms` ± `tolDb`, twice that for an arrangement other than `normal`) or **peak** (over `loudness.peakDbfs`). One warning per miss, naming the cue, the measure and the band (*provisional*) | the cues the schedule plays, each drawn as `mm sound` will play it (a recipe voiced by the profile at the beat's `emphasis`, `gain` and `seed`, a sample trimmed and matched, a library code cue in the style's palette) and measured with `scripts/lib/audio-measure.mjs`; no profile, no cues or palette `none` is SKIP, and a code cue outside the repository's `patterns/sound/` is named unmeasured, which makes a clean result SKIP with `partial: true` |
| W-SAMPLE-LICENSE | a sound file mapped to a cue (`sound.samples` of the style, `audio.samples` of the story, §9) is missing, has no record beside it (`assets/sounds/x.json` for `x.wav`), or has a record that is not JSON or lacks `source`, `licence` or `author` (`contracts/sound-sample.schema.json`); a record of a sound found on Openverse (`source: "openverse"`, written by `mm sound fetch`) also warns when its licence is outside what the piece offers (CC0, public domain and CC BY 2.0 to 4.0, narrowed by the style's `sound.licences`, widened by the story's `audio.acceptLicences`), when its `sha1` is no longer the file's, or when one recording (`openverseId`) carries two licences across the records beside the samples | the mapped files and their records on disk, the file's sha1, the records of the folders the samples sit in; nothing mapped is SKIP |
| W-AUDIBLE | a cue that cannot be heard or is heard badly (*provisional*), from the margins `mm sound` measures in the finished mix and records per cue: the third-octave margin of the cue over the music (the bed, and the track unless it is the voice) and the voice, in the bands within 30 dB of the cue's peak, over its loudest 60 ms and its first 20 ms (6 dB or more clear, 3–6 ok, 0–3 barely, under 0 masked); warns for a masked cue, a silent one (peaking under −70 dBFS), a cue over speech with ducking off, and a cue whose 2–6 kHz 5 ms level is more than 6 dB over the music's loudest (harsh). Barely is listed as information. A beat's `params.cue.soundOk` acknowledges a cue; each warning names the rule that placed the cue | `out/cues.json` `audible` per cue (and `rule`); no `out/cues.json`, one from before the margins, palette `none`, a deck or no cues is SKIP |
| W-SOUND-SHAPE | the shape of a film's sound (*provisional*, §9), from its cue list and the stems: **hook**, no cue in the first 0.6 s (or within 0.35 s of the first arrival, move or departure when that comes later; a film under 3 s is exempt); **hierarchy**, from six cues, the cues' loudest 100 ms (K-weighted, from `out/stems/cues.wav`, else the cue peaks in `out/cues.json`) spread less than 8 dB from P10 to P90; **machine-gun**, five or more of one cue in a row at gaps of 0.35 s or less voiced with two seeds or fewer (a `key` run whose gaps vary by a tenth of their mean or more is typing). Its evidence carries `listen`: the five places to listen first (the opening, the loudest and quietest cue, the densest two seconds, a gap of 3 s or more, the ending, the first of each cue), at least 1.5 s apart, each a question for the ear | the schedule's cues and the stems; no cues, a deck, or `sound.palette` of `none` is SKIP; with six cues or more and no levels measured (`mm sound` has not run) a clean result is SKIP with `partial: true`, never PASS |
| W-SOUND-ARTIFACT | a cue the piece plays has a defect that synthesis or a sample can carry (*provisional*; no sound profile is needed): a **click** (a 1 ms frame of the second difference more than 18 dB over both neighbourhoods, which agree within 8 dB, with 60 % of its energy in 2 samples; or a first or last sample within 40 dB of the peak), a **DC offset** (the mean within 40 dB of the peak), **clipping** (a flat run of three equal samples at the peak, or a sample over full scale), a **truncated tail** (still decaying faster than 20 dB/s, or a final fade much faster than the decay before it, above −40 dB under the peak; a sound that ends on its loudest moment, a riser, is not cut), a **comb ring** (a cepstral peak at 2 to 40 ms more than 15 robust deviations over the rest of the tail's log spectrum; not judged for a tail whose power lies within 2 kHz, nor when the delay is the sound's own pitch), a **tail that rises again** (after falling 20 dB the 10 ms level climbs 6 dB or more above its running minimum and stays 18 dB or more under the peak), **stacked attacks** (a hit only, by `CUE_ROLE`: two peaks within 6 dB of the loudest in a 25 ms level with 10 dB of dip between them, or on 5 ms frames a second onset, a rise of 8 dB over the two frames before it within 30 dB of the peak, 40 ms or more after the first, or over 100 ms of build before the hit) or a **rising glide** (a tonal sound whose strongest partial climbs more than 4 semitones over 50 ms or more; a riser climbs by design) | each cue drawn as W-PALETTE draws it (a recipe voiced by the style's profile, when it has one, at the beat's emphasis, gain and seed; a sample as `mm sound` places it; a code cue as the library draws it in the style's palette), mono mix, by `scripts/lib/sound-artifacts.mjs`; one warning per finding naming the cue, the defect and its measure; a deck, no cues, or `sound.palette` "none" is SKIP, and a code cue outside the library's `patterns/sound/` is named as not measured (SKIP with `partial: true`, never PASS) |
| W-SAY | a film's voice-over (a scene's `say`) holds a word a voice may get wrong that nothing marks (*provisional*): an acronym (`API`, `US`, `OK`), a camelCase or PascalCase name, an identifier with underscores, a file name, a web address or email, a number with a unit, a version, a date or a ratio, and, when the brand keeps a `voice.lexicon`, a capitalised word in mid-sentence the lexicon does not know. A `[display](spoken)` marker or a lexicon entry clears a word; a `<<slot>>` cue marker that names no beat of its scene, or sits inside a word, warns too. W-ANCHOR reads a cue marker as the anchor of its beat: the word it precedes and the two after | the story's `say` texts and the style's `voice.lexicon` (`scripts/lib/say.mjs`) | SKIP for a deck (its `say` is a note for the presenter) and for a film with no `say`; PASS names how many scenes it read |
| W-EASE | an ease the piece spells that the kit would not draw as written (*provisional*, §6): read through the kit's own parser, every ease in `style.motion.easings` (the three roles and any a brand added), `style.motion.stagger.ease`, `style.patterns`, and every beat param named `ease` or ending in `Ease` (also in `params.exit`, `params.emphasis`, `params.stagger`, `cutParams`, `moveParams`, screen actions and format variants). **unknown**: the name or arguments do not parse, so what asked for it falls back to its default (a style easing stops the kit); **curve**: a `curve(...)` whose path runs backwards in x (not a function of x) or ends at the height it starts; **steps**: `steps(n)` with an n that is not a whole number, so the last step is partial; **ends**: `linear(...)` stops that do not run from 0 to 1 (the kit pins both). Nothing spelled: SKIP | one warning per finding: the place, the ease and what is wrong |
| W-DECK-STEP | a deck beat is stepped but no press reaches it, or two steps share an id (*provisional*; a deck only, a film is SKIP): **step**, a beat's `step` is past its scene's `presses` (the kit plays it on the last press, which is not the press the story says); **exit**, a beat's `until` is at or before the press it arrives on, or past the scene's presses, so its exit never shows; **screen**, a screen action's `step` (counted from the beat's) lands past the scene's presses; **id**, two beats of one scene drive the same slot, which is one id and one element, so the later beat overwrites the earlier. The id of a step is its scene and slot. Reads the story, no page; the evidence lists each problem and WARN names the first | story |

**Footage and the gate.** Footage (§4) is drawn in an `<img data-footage data-media>` a layout
declares, so G-BRAND masks it as media and reads the plates and type over it. Footage plays through
rests: a rest is where no element is arriving; the footage picture changes with `t`, and the rest rules
read the text and graphics over it. W-DEAD reads the schedule only, so neither the edit's picture cuts
nor speech count as activity, and a footage piece warns more, never less. G-LOCAL's static half reads
the footage folder: both manifests and every source frame the edit's clips show must be there (frames
the edit never shows need not travel). It does not read a matte folder: a `data-footage-matte` picture
with no full matte shows whole, and only the kit's warning says so.
The kit's `footage: ` warnings are listed in `window.mm.warnings`, and no rule reads them. W-CAPTION
counts a group's words from the beat's text, which `text/caption-karaoke` in `mode: words` does not show.

Report: `out/check.json` `{ spec, when, piece, version, journal, formats, complete, rules: [{ id, status: PASS|FAIL|WARN|SKIP, evidence: { instant, selector, frame } }] }`,
where `spec` is this document's version (`SPEC_VERSION` in `scripts/lib/report.mjs`), `version` the story version checked (§16.2) and
`journal` the id of the last receipt of the story's edit journal the check saw (`null` when the story was never edited through
the journal; verify after edit, §16.2)
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
| `doctor` | verifies Node ≥ 22, Playwright Chromium, ffmpeg ≥ 6 (on `PATH`, or the binaries `MM_FFMPEG` and `MM_FFPROBE` name, which every verb then uses); never installs; a keys file (`$HOME/.config/motion-machine/keys.env`) that the group or others can read is a `WARNING` row naming the `chmod 600` that closes it (exit stays 0), and doctor never changes the mode or prints the file | report |
| `new --kind film\|deck --style <preset\|path> (--id <id> \| --dir <folder>)` | scaffolds `pieces/<id>/`, or `<folder>` (any new folder under the repo root; `--id` then defaults to the folder name), from `runtime/skeletons/<kind>/`, copies the style in, with its font files and a ground mark named by its repo path copied into `assets/` and their `src` rewritten. `piece.js` imports the kit by a relative path computed from where the piece lives | piece folder |
| `serve [piece] [--port N] [--format 16x9\|9x16\|1x1\|4x5] [--t S] [--press N]` | local preview with play clock, keyboard, `?t=`/`?press=` | URL |
| `stills [piece] [--format F]` | every rest, every mid-entrance, a 12-frame strip through each move; a contact sheet; a phone-width sheet | `out/stills/`, `out/contact.png`, `out/phone.png` |
| `check <piece> [--format F] [--sub N] [--quiet] [--json] [--progress]` | §7; the piece is required (one per run); `--sub` is the export setting W-SUB judges; `--progress` prints each format and rule as it starts, on stderr. The report names the story `version`, the `journal` head (the last edit it saw; `mm export` refuses a report older than the last edit, §16.2) and the `formats` it checked, and `complete: false` on exit 2; it is written whole when the run ends, so an interrupted run (exit 130, 143, 129) leaves the previous report | `out/check.json`, exit code |
| `export [piece] [--fps 30] [--sub 1] [--formats …] [--force] [--prove] [--gif] [--gif-width 540] [--workers N] [--encoder auto\|software\|videotoolbox] [--sprite wav\|mp3\|aac] [--alpha] [--alpha-mov]` | film: MP4 per format, drawn by N pages in parallel (default half the cores, 1 to 4, at most 16) that each take the next run of up to 15 frames and hand them to one encoder strictly in order; the frames, the encoded streams and the MP4 bytes equal a one-page run (§16.6) (H.264 yuv420p CRF 16, with a silent AAC track whose handler is `silent` until `mm sound` muxes the mix; G-PEAK and W-LOUDNESS ignore it), a looping GIF per format with `--gif` (one palette, no dither, 15 fps at most), `poster.png`, `loop_check.mp4`; deck: standalone `out/deck/` folder (the deck's cues embedded as one sprite when the story names any, `--sprite` picks its codec), `handout.pdf` (one page per rest, set in the style's bundled faces; each scene's note once), `walkthrough.mp4` (starts on rest 0; each press plays its transition at its real length, then its rest is held 2 s); both: `share-copy.txt`, one caption: the story's `share`, else the first scene's headline, the last scene's headline (each a sentence, not repeated) and the call to action's link, with launch clichés warned in `out/export.json`. `--sub` defaults to 1; above 1 the exporter asks the gate's W-SUB hook and records a warning in `out/export.json`. `--encoder software` (the default) is the x264 encode the proof is about; `auto` and `videotoolbox` use the Mac's hardware H.264 encoder when `ffmpeg -encoders` lists it and fall back to software when not, and never with `--prove` (§16.7). Once the files are in place the exporter reads each MP4 back (§16.7): `out/export-qa.json`, the seam sheets `out/export-qa-seams-<format>.png`, `qa` in `out/export.json`, and a failed check exits 1 (and `--prove` then does not say proved). `--alpha` (films, software encoder, no `--gif`) draws with a transparent canvas (the page, stage and scenes paint no canvas colour; a ground, finish or pattern that fills the frame still does) and writes `<id>-<format>.webm`, VP9 with an alpha channel (yuva420p, CRF 24, one thread, bitexact container), in place of the MP4; `--alpha-mov` also writes `<id>-<format>.mov`, ProRes 4444 for editors; neither has a sound track, a poster, a loop check or a GIF, and the read-back checks QA-ALPHA. The file's tags come from the story, never the clock: `title`, a `description` (`Motion Machine <version>; piece <id>; generated: provider/model (kind); …` from `assets/gen/*.gen.json`) and, when the story has a `date`, that date as `creation_time`; `comment` stays the gate's `UNCHECKED` stamp. `--fps` takes 23.976, 29.97 and 59.94 as 24000/1001, 30000/1001 and 60000/1001, to the encoder and to the read-back | `out/` |
| `verify-export <mp4> [--piece <dir>]` | the checks of §16.7 on one finished MP4, or a transparent `.webm` or `.mov` (a video stream; the story's duration, the exact decoded frame count, the size, the frame rate by name, a sane bitrate and a frame decoded from the file against the same frame drawn cold; sound where the piece has sound; no black frames; no freeze while the schedule moves; no long silence; true peak and loudness of the encoded file against the style; no black, duplicated or offset frame at a cut); the piece is the folder above the MP4's `out/` unless `--piece` names it, and without one only what the file alone can say is checked, the rest SKIP. Exit 0 all pass or skipped, 1 a check failed, 2 usage | `out/export-qa.json` (the other files' rows kept), `out/export-qa-seams-<format>.png`, verdict on stdout |
| `say-lint [piece] [--text "…" \| --script <file>] [--scene <id>] [--json]` | reads a film's voice-over (each scene's `say`, or one text) for the words a voice may get wrong before a paid voice reads it (*Narration*, below): acronyms, camelCase names, identifiers, file names, web addresses, numbers with units, and product words the brand's `voice.lexicon` does not know; a `[display](spoken)` marker or a lexicon entry clears a word; each `<<slot>>` cue must name a beat of its scene. Exit 0 nothing flagged, 1 a word or a cue flagged, 2 usage | verdict on stdout (`--json`: the findings) |
| `beats <track.wav> [--bpm N] [--out assets/beats.json]` | beat grid: declared BPM with a measured downbeat offset, or an energy-onset estimate (*provisional* method) | `assets/beats.json` `{ bpm, usable, kickCheck, snapMs, beats[], downbeats[], hits[], strong[] }`; the grid is moved onto the measured attacks (a 23 ms-window spectral flux folded over the beats, searched within ± min(100 ms, 0.3 beat); `snapMs` is the shift), and `kickCheck` is the share of its beats within 40 ms of a kick (a rise of the 31–125 Hz band): under 50 %, or no kick at all, writes `usable: false`, and `mm sound` and W-CUE do not snap to that grid (edit it to `true` to override); `strong[]`: every beat and onset scored 0.45 onset + 0.25 local contrast (onset minus the ±0.5 s median) + 0.20 RMS + 0.10 energy below 180 Hz, each over its 98th percentile (onset and contrast over the candidates), kept at 0.45 or more, 0.18 s apart, at most 64, in time order `{ t, intensity, kind: beat \| onset }` |
| `sound [piece] [--formats 16x9,9x16] [--patterns dir] [--trace] [--sprite wav\|mp3\|aac]` | renders cue presets through an OfflineAudioContext in the Playwright page, places each on its picture event by its role (§9), mixes with the track in ffmpeg (stop-down, voice ducking, tonal fit), two-pass `loudnorm` to the style's target; `--trace` also logs every add and gain curve with the rule that placed it; a deck has no picture clock to mix against, so its cues become one sprite instead (§10; `--sprite` picks `wav`, the default, `mp3` or `aac`, encoded by the ffmpeg already needed) | `out/mix.wav`, `out/cues.json` (with each cue's sync lock and audibility), `out/sound-trace.json` with `--trace`, final MP4 muxed; a deck: `out/deck-sound.wav` (or `.mp3`, `.m4a`) and `out/deck-sound.json` |
| `sound mine <folder-or-file> --out <dir> [--name <profile>] [--licence <terms>] [--own] [--source <text>] [--author <name>]` | cuts a folder of audio or video (or one file) into its sounds (§9), measures each with `scripts/lib/audio-measure.mjs`, and fits a sound profile to the set. `--licence` is required unless `--own` says the recordings are yours; a file with a record beside it (`x.json`: `source`, `licence`, `author`) keeps its own. Exit 2 for a missing licence or `--out` (nothing is written), 1 when no sound is found | `<dir>/records/<id>.json` (one per sound: its source, licence and author, and duration, length, family, peak, loudest-100 ms and integrated level, attack, T60, centroid, roll-off, flatness, side/mid, pitch and partial ratios if tonal, material, room tail), `<dir>/sounds/<id>.wav`, `<dir>/<name>.profile.json`, `<dir>/mine.html` |
| `sound clone --profile <profile> --cue <name> --meaning "<text>" [--like <sound>] [--family input\|surface\|outcome] [--variants <n>] [--out <patterns-dir>] [--force]` | makes a recipe in a profile's style by analysis-by-synthesis (§9); `--profile` is a name in `styles/sound/` or a path (a mined `<name>.profile.json`); `--variants <n>` (1 to 9) writes n variants of the cue, `<cue>`, `<cue>-2`, … (§9); `--family` defaults to the family of `--like`, else the one the meaning's words suggest (tap, toggle: input; open, close, panel: surface; else outcome); exit 2 for a cue that already exists (without `--force`), a bad name, a bad `--variants` or an unknown profile | `<patterns-dir>/sound/<cue>/{recipe.json, PATTERN.md, demo/cue.json}` (default `./patterns`), and the same for `<cue>-2` … with `--variants` |
| `sound find <words> [--license cc0,pdm,by] [--length shortest,short] [--category sound_effect] [--extension wav,ogg] [--page-size 20] [--page N] [--piece <dir>] [--json]` | searches Openverse's audio (`api.openverse.org/v1/audio/`: `q`, `license`, `category`, `length`, `extension`, `filter_dead=true`, `mature=false`; public and read-only, anonymous; an optional `OPENVERSE_TOKEN` in the environment or in the `keys.env` file `mm gen` reads adds a bearer header to raise the rate limits, and is never printed) and prints a table of id, title, creator, licence and version, length, file type, source and landing page. The licences offered are the style's `sound.licences` (default cc0, pdm, by) plus those the story names in `audio.acceptLicences`; `--piece` reads both, and a `--license` outside them exits 2. Every row is checked against them again, so a row with an unoffered licence or none never reaches the table. A search is not a download and needs no `--yes`. Titles and creators came from outside, so the table is printed as material. Exit 0 (also for no result), 1 when Openverse fails, 2 for a usage mistake | the table on stdout (`--json`: the rows kept, raw); nothing is written |
| `sound fetch <openverse-id> --piece <dir> --name <name> [--cue <cue>] [--yes]` | reads the item's detail (`/v1/audio/{id}/`) and judges its licence there, never from a search row: CC0, public domain and CC BY 2.0 to 4.0 are allowed (within the style's `sound.licences`); any other licence is refused unless the story names it in `audio.acceptLicences`; an item with no licence field, a file type a story cannot map (wav, mp3, m4a, flac, ogg) or a file address that is not https is refused. It prints the plan (URL, size when known, licence, where it lands) and exits 3 until `--yes`, like `mm gen`. With `--yes` the file is fetched (at most 64 MB, no credential sent), its first bytes must be a sound of its stated type and its sha1 is taken; nothing is kept otherwise. `--cue` then maps the file in `audio.samples` as one undoable story edit (`audio.sample`, §16.1); when the story cannot be edited the sound is kept and the line to add by hand is printed. A name already taken is never overwritten. Exit 0 done, 1 refused or failed, 2 usage, 3 a plan waits for `--yes` | `<piece>/assets/sounds/<name>.<ext>` and `<name>.json` (the sample record with `source: "openverse"`, `openverseId`, `licence`, `licenceVersion`, `licenceUrl`, `creator`, `creatorUrl`, `landingUrl`, Openverse's own `attribution` line, `retrieved`, `sha1`) |
| `sound suggest [piece] [--budget 5] [--apply]` | proposes the cues of a film from its own schedule (§9): every entrance, type-on, end of a counter, cut, press on a screen, exit and settle with a cue, a weight and a frame, chosen under a budget of cues per 10 s (the style's `cuesPer10s` band when set, never above it), each role's minimum gap, two at once at most and the first 2 s favoured; films only | `out/sound-suggest.json` and a table; with `--apply`, beat `cue` fields written through the story-edit service (one receipt, undone by `mm timeline <piece> undo`) |
| `sound-listen [--out dir] [--cues a,b] [--profiles glass,soft-ui] [--calibrate] \| sound-listen --ab <a.wav\|cue> <b.wav\|cue> [--trials 20] [--seed 1] [--profile soft-ui]` | renders every recipe cue (§9) offline in stereo under each sound profile and at each emphasis, measures the samples it plays (length, attack, T60, loudest-100 ms K-weighted level, integrated level, sample peak, spectral centroid and roll-off, flatness, left/right lean, side/mid, strongest spectral peaks) and writes a listen page with a player and the numbers for each, the profile's bands marked ok or miss; `--calibrate` first rewrites each recipe's `masterGain` so its loudest 100 ms rendered as written lands on −30 LUFS; `--ab` builds the blind A/B page of two sounds instead (§9) and refuses, with the reason (exit 1), a pair that cannot be compared fairly | `<out>/listen.html`, `<out>/wav/*.wav`, `<out>/numbers.json` (default `out/sound-listen/`); with `--ab`, `<out>/ab.html`, `s1.wav`, `s2.wav`, `ab-facts.json` (default `out/sound-ab/`) |
| `pattern list` · `pattern lint [<group>/<name> \| <name>] [--json]` · `pattern stills <group>/<name> [--style preset\|path\|all] [--format F] [--patterns dir]` | §5. `list` is pattern-lint's own list of complete patterns; `lint <name>` lints one pattern (`rise` or `entrances/rise`) | listing, lint report, `patterns/<…>/demo/out/` |
| `release-check [--root <dir>] [--only <sweep,…>] [--json]` | the pre-publication sweep, exit 0 clean, 1 findings, 2 setup. Sweeps: **R-BRAND** (the word lists, below), **R-SECRET** (key and token shapes, private keys, `api_key=`/`password=`, `.env`/`.pem`/`.key`/`.npmrc` files), **R-PATH** (absolute home-folder paths of macOS, Linux and Windows user folders, and home-relative paths (a tilde, then Downloads, Documents, Desktop, Library, Pictures, Movies, Music, code, `.claude`, `.config` or `.ssh`); the shared tool caches such as `.cache` and `.npm` are not flagged), **R-URL** (`http(s)` URLs in `runtime/`, `patterns/`, `pieces/`; XML namespaces and licence texts excepted), **R-LICENSE** (`LICENSE` is the Apache-2.0 text and `package.json` says Apache-2.0), **R-FONT-LICENSE** (every folder of font files holds an SIL OFL licence), **R-PATTERNS** (every pattern passes lint), **R-GOLDEN** (no `golden-*` piece's `out/check.json` in `pieces/` holds a FAIL; a piece with no report is not reported, and with no report at all the sweep is SKIP, since `out/` is never in git and a fresh copy has none), **R-STRATEGY** (no strategy file is tracked: `DECISIONS`, `LESSONS`, `PHILOSOPHY`, `CHANGELOG`, `STATUS` or `CHRONICLE` `.md` anywhere, nor anything under `docs/evals` or `docs/plans`; planning and decision records are not kept in this repository), **R-HISTORY** (public files state rules, not how they were decided. Flagged in tracked text: decision and finding ids, milestone, goal, plan and design labels, dated notes in Markdown, scripts, CSS, HTML, YAML and shell, version changelog blockquotes and spec-section-with-version citations, narratives of how a fix was reached or of lessons learned, pointers to private files or records (`docs/private/` other than `brand-words.txt`), and philosophy framing. `runtime/vendor/` and `fixtures/release/` are exempt, and `NOTICE` may carry upstream dates and wording), **R-EMAIL** (no e-mail address in tracked text except `example.com`, `example.org`, `example.net`, `*.example` and no-reply addresses; licence texts exempt), **R-DUP** (no tracked file or folder named like a Finder or iCloud duplicate: a space, then a number, `copy` or `copy N`, before the extension: `name 2.ext`, `name copy.ext`, `name copy 2.ext`, a folder `rise 2/`) | report |
| `brand init <folder> [--from <shipped-brand-name\|path-to-brand.json>] [--name <name>]` | makes a brand's own folder at any path (new or empty, else exit 2): `brand.json` (a copy of `--from`, or the bundled `paper` half; `fictional: false`; `name` from `--name` or the folder name), `fonts/<family>/` with every font file the half names and its `LICENSE.txt` (each `src` rewritten to `fonts/<family>/<file>`, relative to `brand.json`), `ground/` with the ground mark when there is one, `logo/` and `sources/` with a one-line `README.md`, `notes.md`, `facts.md` and `projects/`. `--from` takes a shipped name, a captured half in the git-ignored private brands folder, or a path. The engine reads such a folder by path (§3: `mm style compose` and `mm new` accept halves and styles outside the repository); real brands live in folders like this one, outside the engine, and the shipped halves in `styles/brands/` stay fictional | a brand folder |
| `brand onboard <folder> --from <source> [--from <source>…] [--color role=#hex]…` | brings a brand into its folder (made as `brand init` makes it, from `paper`, when the folder is missing or empty; a folder with other content and no `brand.json` exits 2). Each `--from` is read in process as `brand capture` reads it: a URL, an `.html` file or a folder with an `index.html` is a *site*; a Figma export `.json` is *tokens*; a `DESIGN.md` is *designmd*; a folder of pictures is *stills*. Roles are merged by trust (tokens and designmd 3, site 2, stills 1): per role the highest-trust source that did not derive the value wins, else the highest-trust derived one; confidence is `exact` (a token name mapped it), `measured` (a site or stills value), `guess` (derived) or `set` (`--color`, which always wins and is never changed). The role rules of `scripts/lib/brand-roles.mjs` run over the merge: they fix a muted colour under 4.5:1 and the text colour on the accent when those are not named or typed, derive `surfaceInk` and `composition.accentText`, warn about a wrong-looking role, and leave questions, each option with a `mm brand set` command; the other readings of a role join the options. The merged faces map to the nearest bundled families (copied into `fonts/`; recorded as `stand-in`; a font added with `brand font` is kept). Everything is checked against `contracts/brand.schema.json` before anything is written. Writes `brand.json`, `sources/onboard.json` (version, brand, sources, roles, accentText, pairs, warnings, notes, ask, fonts, logo) and appends a section to `notes.md` (sources, role table, fixes, warnings, questions); a second run replaces `onboard.json` and appends another section | a brand folder |
| `brand sheet <folder> [--motion <name\|path>]` | renders the folder's review sheet in one browser session into `<folder>/sheets/` (rebuilt on every run): `review.html` (one self-contained page, every font copied to `assets/fonts/` and referenced relatively, no network reference), `review.png` (full page, 1440 px wide) and `frames/` (`look-title`, `look-statement`, `look-stat`, `tempo-0` to `tempo-7` and, with a logo, `logo-canvas`, `logo-accent`, `logo-ink`, all drawn in the brand composed with the motion half, `calm` by default). The page shows the palette with each role's evidence and confidence, the contrast of every text pair, the three type faces with their licences, the look, the motion's durations and tempo, and the open questions with the command that answers each. The data is `sources/onboard.json` when it exists, else `brand.json` run through the role rules; a bad folder or motion exits 2 | `sheets/review.html`, `review.png`, `frames/` |
| `brand set <folder> <role>=#hex [<role>=#hex…]` | sets roles (the seven and `surfaceInk`) with confidence `set`, runs the role rules again over every role (from `sources/onboard.json`, or from `brand.json` with every role `measured` when the folder was never onboarded), rewrites `brand.json` and `sources/onboard.json` and appends the change to `notes.md`; a value that is not a hex colour, or an unknown role, exits 2 and writes nothing. Says to run `brand sheet` when `sheets/review.html` exists | the updated folder |
| `brand font <folder> <file> --family "<Name>" --role display\|text\|mono\|both [--weight 400] [--license <file>]` | takes a `.woff2`, `.woff`, `.ttf` or `.otf` whose first bytes match its type and whose family is a safe name (exit 2 otherwise, nothing written) into `fonts/<family>/<file>` with the licence beside it as `LICENSE.txt`; SIL OFL is recognised as `SIL OFL 1.1`, Apache as `Apache 2.0`, anything else or none as `private-use`; sets `type.<role>` in `brand.json` (`both` is display and text) and the role's font entry in `sources/onboard.json` to `source: brand` | the updated folder |
| `brand logo <folder> <file.svg>` | keeps `logo/logo.svg`, cleaned (no `<script>` or `<foreignObject>`, no `on*` attribute, no `href` that does not start `#`, no `url()` other than `url(#…)`, no external `@import`; a `viewBox` made from width and height when missing, and the fixed size dropped; colours kept) and `logo/logo-mono.svg` (every fill and stroke `currentColor`); records in `sources/onboard.json` which role each colour is nearest (the mascot importer's snapping) and warns in `notes.md` about a colour farther than ΔE 12 from every role; a file that is not an SVG exits 2 | the updated folder |
| `project new <folder> --brand <brand-folder> --kind film\|deck [--motion <name\|path>] [--formats a,b]` | makes a project at any path (a bare name goes under `<brand-folder>/projects/`; the folder must be new or empty, else exit 2): `project.json` (`id` from the folder name, `kind`, the brand folder as an absolute path, `motion` as a name or an absolute path, default `calm`, `formats`, `created`), the skeleton `story.json` for the kind with that id and the formats (a deck keeps one), `assets/` (pictures, recordings and audio the story uses), `inputs/sources.md` and `out/`. Needs no browser | a project folder |
| `project make <folder> [--to <dir>] [--check-only]` | renders a project through a hidden work piece, `projects-work/<id>-<8 hex of sha1 of the project's real path>` in the engine's git-ignored private folder (so two projects named alike never collide). Every make composes `brand.json` with the motion half into that piece's style (an edit to the brand folder reaches the next render), refreshes its fonts, ground mark, `story.json` and `assets/` (mirrored: a file deleted from the project's `assets/` disappears; the engine's own `assets/fonts` and `assets/ground` stay), runs `check` and prints its warnings and verdict (a FAIL stops with the gate's exit code and names `check.json`; `--check-only` stops there), runs `export`, and copies the results into `<folder>/out/`: a film `<id>-<format>.mp4`, `poster.png` and any `.gif`; a deck `slides/` (the standalone deck), `handout.pdf` and `walkthrough.mp4`; always `check.json`. `--to` also copies the deliverables to `<dir>` as `<id>-<format>.mp4`, `<id>-slides/`, `<id>-handout.pdf` and `<id>-walkthrough.mp4`. The work folder holds nothing the project and brand folders do not: delete it and `make` rebuilds the same output | `<folder>/out/` |
| `project path <folder>` | prints the work folder of a project, which `studio` and `serve` can open | the path |
| `brand capture` · `brand mascot` · `motion capture` · `style compose` · `style export-designmd` · `style export-motion` · `skill new` | the three modes (§13) | style halves, composed styles, a `DESIGN.md`, motion tokens, brand skills |
| `media frame <png> --name <n> [--piece <dir>] [--key]` | installs a device frame image you own (a transparent screen, or a flat screen colour with `--key`), and measures its screen hole | `<piece>/assets/frames/<n>.png`, `<n>.json` |
| `media layers <picture> --name <n> [--piece <dir>] [--mask <name>=<png>]… [--poly <json>]… [--key <#rrggbb\|auto>] [--min-area <px>] [--plate <png>] [--depth <png>] [--depths <d,d,…>]` | takes one still picture apart, offline: parts from grey or RGBA masks, polygons (`{ "parts": [{ "name", "points": [[x, y], …], "depth"? }] }`) or a colour key against a flat background (`auto`: the median of the outer ring), split into connected pieces in reading order; a key finds pieces on the picture averaged over 5 × 5, drops pieces under `--min-area` pixels (a thousandth of the picture by default, at least 16) and exits 2 on a backdrop that is not flat (an edge more than 25 % off the key colour, or a piece touching all four edges); the plate's holes (every part pixel, grown 1 px) filled by a push-pull pyramid plus seeded grain; each part's soft edge unmixed so plate + parts recompose the source; depth from a map (near = white), constants, or the stacking order; when every pixel is under a part the plate is a softened copy of the picture (`plate.fill: "soft-copy"`, with a warning). Stacking plate + parts gives the source back with at most 0.1 % of pixels further than ΔE 10 (CIE76); past that, exit 1 and the pack is written with `recompose-off.png`, a grey error map. On one machine the same inputs write the same bytes; a JPEG input decoded on another CPU can differ by a level | `<piece>/assets/<n>/source.png`, `plate.png`, `part-<name>.png`, `depth.png` (the plate's depth), `media.json` (`kind: layers`, `w`, `h`, every file with its SHA-1, parts `{ name, file, x, y, w, h, z, depth }`, `plate.depth`, `depthFrom`, `recompose` with `unit: "ΔE76"`) |
| `media prep <file> --name <n> [--piece <dir>] [--fps 30] [--fit phone\|laptop\|<W>x<H>] [--trim <a>-<b>] [--quality 90]` | decodes a screen recording (any container or codec ffmpeg reads; display rotation applied), resamples it to a constant rate and fits it inside the screen box it will be shown in, never upscaling (phone 660×1430, laptop 1600×1000; without `--fit` the long side is capped at 1600 px); a `--trim` that starts past the clip's end exits 2 before the old asset is touched; JPEG frames, since WebP encoders are not on every ffmpeg | `<piece>/assets/<n>/f00001.jpg…`, `media.json` (`kind: sequence`, `fps`, `frames`, `w`, `h`, `duration` = frames / fps, source name and SHA-1) |
| `footage cut <video> --name <n> [--piece <dir>] [--words <words.json>] [--fillers] [--max-pause 0.5] [--cuts <cuts.approved.json>] [--scenes <scenes.json>]` | a talking-head recording already prepared with `media prep --name <n>` (same file, no `--trim`) is cut by measurement: loudness in 25 ms windows every 10 ms; the room is the level under the quietest 2 % of windows, the voice the mean power of windows 10 dB over it; quiet is below room + 40 % of the gap. Cuts need the voice 12 dB over the room; under that the cut is refused when the take holds quiet stretches longer than `--max-pause`, and otherwise the edit is one clip. A take whose loudness never moves 3 dB is "no speech found", one under −90 dBFS is silent. Quiet runs longer than `--max-pause` are removed except 250 ms after the last sound and 100 ms before the next; ranges snap to whole frames without drift; the voice is joined with 30 ms equal-power crossfades and given one static gain toward the piece's `sound.loudnessLufs` (−14 LUFS by default) under a −1 dBFS sample peak; `--words` (`[{text,start,end}]`, `{words}` or WhisperX output: `word_segments` or `segments[].words`, in seconds of the sound, moved onto the picture's clock when the sound starts late; there is no transcriber) is never cut through and is mapped onto the output clock; `--fillers` (with `--words`) also cuts every stretch between words longer than `--max-pause`, whatever sound it holds, and bounds the take by the words (a lead before the first, a tail after the last); `settings.fillers` records it. An edit with no cut carries `note` (no pause longer than `--max-pause`: nothing to cut). `--cuts` (the director's file, from `footage review`) replaces the pause finder: the edit is the recording minus exactly the cuts marked `approved: true`, in source seconds as the words file counts them (moved onto the picture's clock like the words); an empty list is the identity edit (the whole take, one clip, with a `note`); a cut outside the recording exits 2 naming it; it cannot be combined with `--fillers` or `--max-pause`; the edit's words come from the cut map, so a word that starts inside a removed span is dropped and the source and output clocks are never mixed; `settings.cuts` records the file and how many cuts applied. `--scenes` (from `footage scenes`, seconds of the picture; it combines with every other flag) moves a join that would leave a sliver of the other shot onto the scene change: an edge of a cut with a scene change within 0.25 s past it, on the side that stays, moves onto the scene change (the cut grows by those frames) unless a word lies between the edge and the scene change, or the move would shorten a kept stretch under 0.1 s; `settings.scenes` records the file, what moved (`snapped`) and what was held (`held`, naming the word), and the command prints each. Every footage command that reads words first checks them: more than 20 % of the tokens being music marks (♪, `[Music]`) or replacement characters exits 2 with the count, hesitations (um, uh, hm, Romanian ăă) shorter than 0.1 s and the marks are dropped, words shorter than 0.05 s are marked `unreliable`, and a transcript whose declared language differs from the story's `language` (or that reads as English in a story that is not) is warned about, since an English-only model translates other languages. On one machine, the same recording writes the same bytes; another machine's ffmpeg can decode compressed sound a few samples differently, which changes `voice.wav` but not the cuts. Every join of the edit is then drawn (§16.7): `seams.png` and `seams.json` beside `edit.json`, checked for a black frame, a frame shown twice or a clip that does not continue where the one before it ends (exit 1, the files written) | `<piece>/assets/<n>/edit.json` (`fps`, `frames`, `picture: [{start, from, length}]`, `cuts`, `levels`, `onSound`, `voice`, `words`, `note`?), `voice.wav` (48 kHz mono) |
| `footage review <words.json> [--out <dir>] [--piece <dir>] [--language <code>] [--max-pause 0.5] [--audio <video|audio>] [--scenes <scenes.json>]` | a transcript (the words of `footage cut`) becomes proposed cuts, nothing cut. Words are folded (case, punctuation and diacritics, so Romanian matches with or without them); segments split at a gap over 0.85 s, at a sentence end after 7.5 s and at 16 s. A *stutter* is the same word again within 0.5 s (the last is kept; a repeat with no gap, or across a sentence end, is emphasis and is left); a *retake* is a segment with a later one within 9 segments and 75 s whose words overlap (Jaccard) by 0.34, or 0.24 when the first two words match (the last take stays); a *false-start* is a first take under 6 s restarted within 12 s (or one the restart begins with); a *filler* is a transcribed um, uh or ăă; a *long-pause* is a stretch between words longer than `--max-pause` that `footage cut --fillers` cuts, with 0.24 s kept after a pause of 2 s or more, 0.20 s after a sentence end, 0.14 s otherwise, and 0.1 s before the next word. A cut ends 60 ms before the word that stays; a stutter, hesitation or pause inside a retaken take is not listed twice. The report also lists sentence gaps under a tenth of this speaker's median ("sounds like a stutter"; at least 5 gaps) and the head and tail pads of the cut (0.1 s, 0.25 s) next to the reference (0.22 s, 0.34 s), which it does not change. `--audio` (the recording the words were transcribed from; its first audio stream, decoded by ffmpeg at 16 kHz) adds the sound: every 10 ms is *silence* (under a gate of the clip's speech level (the level 5 % of its frames reach) minus 20 dB, clamped between −40 and −22 dBFS), *noise* (over it, with a flat spectrum: spectral flatness over 100 Hz to 4 kHz, after a first-difference pre-emphasis, of 0.12 or more) or *speech* (over it, with a peaked one); a stop or breath of up to 0.12 s between speech is speech, speech under 0.06 s is a click. A long pause is then proposed only where the transcript has no word *and* the sound is not speech: the non-speech part of the stretch, at least 0.5 s (or `--max-pause` when larger), with 0.15 s left at either end (the breath after the last word where larger), each cut carrying `sound` (`silence`, `noise` or `silence and noise`) and confidence 0.95; a voiced sound the transcript missed is never cut into. The proposal's `sound` entry classes the clip: *speech* (at least 0.5 s of speech), *noise* (sound over the gate but not speech), *silent*, or *no-audio* (no audio stream: the pauses are judged by the words alone, with a warning); a *silent* or *noise* clip proposes no cut at all, with a warning, since a transcriber invents words over silence and noise. `--scenes` (from `footage scenes`) moves a cut edge that would leave a sliver of the other shot onto the scene change, by the rule of `footage cut --scenes`, in the sound's clock (the file's `offset` removed); the cut then carries `scene: { snapped, held }` and says so in its reason | `<dir>/cuts.proposed.json` (`kind: cuts`, `status: proposed`, `language`, `duration`, `cuts: [{ id, kind, start, end, words, reason, confidence, sound?, scene? }]`, `gaps`, `sound`?, `warnings`?); the director copies it to `cuts.approved.json`, sets `approved` true or false on each cut (and an optional `note`) |
| `footage scenes <video> [--out <dir>] [--spike 1.8] [--min-scene 0.5]` | the scene cuts of a recording from its picture alone: every frame (at most 30 a second) is scaled to 64 x 64, taken to hue, saturation and value, and compared with the one before (the mean over the pixels of (hue distance x the lesser saturation + saturation distance + value distance) / 3); a cut is a frame whose difference is at least `--spike` times the largest difference among the 4 frames either side and at least 0.04, so a handheld shake, where every frame differs a little, is no cut; of two cuts closer than `--min-scene` seconds the stronger stays, and no scene starts or ends in less. A dissolve has no spike and is not found | `<dir>/scenes.json` (`kind: scenes`, `source`, `fps`, `duration`, `offset` (the sound's start minus the picture's), `params`, `cuts: [{ at, frame, strength, ratio }]`, `scenes: [{ start, end }]`) |
| `footage audit <dir> [--source <video>] [--edit <video>] [--style <style.json>]` | writes the audit page from `cuts.approved.json` (else `cuts.proposed.json`): one timeline of kept time (canvas) and cut time (accent) over the source with the edit's joins under it, the source and the edit side by side, a click on a cut playing the removed span with a second either side and moving the edit to the join, declined cuts outlined, and the 20 largest removals with their reasons. Self-contained: no network, the videos linked by relative path and never copied, every string from the cuts file escaped; `--style` takes a style's palette roles | `<dir>/audit.html` |
| `footage verify <edit.mp4> --words <edit.json> [--heard <words.json>] [--out <dir>]` | the round trip: the plan's words (the `words` and `cuts` of an `edit.json`, on the output clock) against the words heard in the finished edit (`--heard`, from the tool the piece used; `mm gen transcribe` when a build has it, else `--heard` is required). Per cut it checks the 3 planned words either side by folded text within 0.6 s: a word of which only a piece is heard is *clipped*, one not heard is *missing*, one heard there that the plan removed is *leftover* (a note); exit 0 when no cut has a clipped or missing word, 1 otherwise | `<dir>/verify.json`, `strip-NN.png` (10 frames either side of cut NN, 160 px wide, two rows of ten); default `<dir>` is `verify/` beside the edit |
| `footage matte --name <n> [--piece <dir>] [--masks <dir>] [--quality accurate\|balanced] [--feather 3]` | a footage asset already prepared with `media prep --name <n>` gets a person matte: by default the macOS Vision framework segments every frame on the device (macOS 12+ with swiftc; `scripts/lib/segment.swift` is compiled into `<piece>/out/` on first use, named by its source hash); elsewhere, or with `--masks`, any tool's masks named as the frames (`.png` or `.jpg`) are used, and without either it exits 2 saying so; every mask then takes a 3-frame temporal median and a `--feather` px soft edge (two box passes each way); on one machine the same input writes the same bytes | `<piece>/assets/<n>/matte/f00001.png …` (8-bit grey, frame size, white = person), `face.json` (`{ frames, boxes }`: the head's box of every source frame as shares of the recording, `[x0, y0, x1, y1]` or null, read from the smoothed mask: the rows from the top of the person to the first empty row or the first row 1.5 times wider than the head so far, at least 5 % of the frame's height and at most 60 % of the person's); `media.json` `matte: { dir, frames, from, quality?, median, feather, face }` |
| `capture site --url <url> --name <n> [--piece <dir>] [--device phone\|laptop\|browser] [--mark "<Label>=<selector>"]… [--hide <selector>]… [--wait <selector>] [--quality 90] [--max-height 24000] [--script <steps.json>]` | opens the one URL given at the device viewport (phone 390×844 at 3x, laptop 1440×900 at 2x, browser 1280×800 at 2x), hides cookie banners and `--hide` selectors, scrolls once so lazy images load, and captures the page, up to `--max-height` css px (24,000 by default, so an infinite page ends) at JPEG `--quality` 90, as JPEG tiles of at most 16,000 device px. Consent banners are hidden only when they are fixed or sticky overlays. A mark that matches nothing exits 2; a mark inside a fixed or sticky element is flagged `fixed: true` and warned about. A file:// page is recorded by its repository path (or its name), never an absolute local path. With `--script <steps.json>` the page is played, not photographed: the steps (`wait`, `move`, `click`, `hover`, `type`, `scroll`, `goto`, each named by `do`; a step that names a selector the page lacks exits 2 and writes nothing, `goto` stays on the site the capture opened, and `--mark` is refused) run in a Chromium that records a video at the viewport's css size. The page flashes red five times before the script starts, and the video's own clock is found from when each flash reaches it (the recorder may start late), so the track is aligned to the video's first frame to within a frame; the recording is cut from the moment the flashes end. The pointer's journey is written beside the video as the pointer track (§4, screen content). The duration of the recording is read from its video packets (the container's is used only when it is positive and within 1.5 s of them) and the command says whether the first frame is black (luma largest value 24 or below and mean 4 or below). A capture is a one-time act (§13) | `<piece>/assets/<n>/page-N.jpg`, `media.json` (`kind: page`, viewport, height, tiles, marks in page css px, url, date), and `wire`: up to 800 shapes `{ k, x, y, w, h, r }` in document order and page css px (`k` is `box`, `dot` or `text`, one per visible box, small round dot or line of text; `r` is the corner radius, 0 for text; `fixed` and `overlay` as on a mark), with `wireCut: true` when the cap was hit; `overlays`: each top-level fixed element, and each sticky one with a px `top`, that is not see-through and has area in the viewport, as its own picture with `x`, `y`, `w`, `h` at scroll 0, `position` and sticky `top`. The screen layer draws them pinned (a sticky one scrolls until it reaches its `top`), and a mark inside one carries `overlay: i` and stays in viewport coordinates. With `--script`: `<piece>/assets/<n>.webm` (the recording), `<n>.cursor.json` (the pointer track, with `sync`: how the clock was set), `<n>/` (frames, `media.json` with `cursor`, `cursor.json` cut to the frames) and `<n>.licence.json` |
| `gen <kind> --piece <dir> --name <asset-name> [--provider kie\|elevenlabs\|higgsfield] [--model <id>] [--prompt "…"] [--ref <img>]… [--image <img>] [--video <clip>] [--audio <file>] [--character <img>] [--aspect 16:9] [--duration <s>] [--instrumental on\|off] [--text "…"] [--script <file>] [--scene <id>] [--say-ok] [--voice <id>] [--language <code>] [--file <path>] [--url <https-url>] [--job <id>] [--brand on\|off] [--again <name>] [--raw] [--fresh] [--plan] [--yes] [--json]` | generates a picture, clip, music, sound effect, narration or transcript through Kie.ai, ElevenLabs or Higgsfield, steered by the style's brand, into `<piece>/assets/gen/` with a record; the same request twice is one call (`--fresh` sends again); `<kind>` and the rest are in **Generating assets** below | `<piece>/assets/gen/<name>.png\|.mp4\|.mp3\|.wav`, `<name>.words.json`, `<name>.gen.json`, `<name>.licence.json`; a video also `<piece>/assets/<name>/` (frames and `media.json`, as `media prep`) |
| `share [piece] [--out <dir>] [--format F] [--url <https://…>] [--index]` | a watch folder for a finished film or deck, ready for any static host; **it uploads nothing** (publishing is a step a person takes, with a static host of their choice). It reads the export (`mm export` first: a film's `out/<id>-<format>.mp4` and `out/poster.png`, a deck's `out/deck/`) and writes `index.html` (plays the MP4, or embeds the standalone deck in a frame; the poster; title and description from the story's `title` and `share` caption, else its hook, closing headline and link; Open Graph and Twitter card tags; `?t=<seconds>` opens a film at that second and `?press=<n>` a deck at that rest; a chapter list from the scenes, each a button that seeks; a transcript; the credits; a note on how to publish; a CSP that allows only the folder's own files, so a page that asked for anything else would show it), `transcript.json` (each scene's start, title, what is said and what is shown), `context.md` (the story's facts with their sources, its scenes and credits, headed as material and not instructions, so a person or an agent can answer questions about the piece), `captions.vtt` (WebVTT of every `text/caption-karaoke` beat, one group at a time as the pattern shows it, wired as a `<track>`; only when the film has one), `share-block.md` (a poster image that links to the page, the link and the credits, between `<!-- mm-share -->` and `<!-- /mm-share -->` so a second paste replaces it) and `mm-share.json` (each file's size and sha-256). `--url` is the address the folder will have: Open Graph and the share block need an absolute address and leave it out rather than guess. The page is styled with the style's palette roles and fonts (copied with their licence). Only regular files inside the piece are copied, never through a symbolic link (a link is named and skipped). The page is unlisted (`noindex`) unless `--index`, which is refused while a used asset has no free licence on record. `--out` defaults to `<piece>/out/share/` and must be new, empty or a folder an earlier run made; any other exits 2 | the folder |
| `showcase <file> [--device phone\|tablet\|laptop\|browser] [--look hero\|turntable\|still\|showcase\|cross\|drawn] [--zoom] [--duration N] [--fps N] [--format F] [--style <preset\|path>] [--background #hex] [--contained] [--html] [--stills N\|s1,s2] [--audio <file>] [--piece <dir>] [--out <file>] [--check]` | one command from a screen recording or a still to a finished device film. It plans from the file: the device from the content's shape (portrait on `3d/phone`, landscape on `3d/laptop`; `3d/tablet` in either orientation; `browser` is `devices/browser`), the look is the device's own move (default `hero`), the length the whole recording held to 6 to 120 s (a still: 10 s), the format the one nearest the device's screen. It writes a generated piece (`pieces/showcase-<name>/` or `--piece`; `story.json` stamped `generator: scripts/showcase.mjs`; a second run writes it again, a folder it did not write is refused): the style (`--style`, default `calm-product`; `--background` sets its canvas role), the recording prepared (`media prep`, an HDR source made SDR) or the still copied, a licence record of your own recording, one scene in `layouts/stage` (`layouts/caption-bar` with `--contained`, the device inside the safe margin). Nothing zooms unless `--zoom`: then `screen/zoom-to` mode `auto` zooms on the clicks and taps of the recording's pointer track, or, with no track, on `regions` measured where the recording moves (`scripts/lib/activity.mjs`). Then the gate and the export. `--check` prints the resolved plan and writes nothing; `--stills` renders the instants (a count spread evenly, or seconds) into a contact sheet instead of the film; `--audio` lays a finished track under the MP4 (video copied, the sound padded or trimmed and faded out over 0.8 s); `--html` also writes a hero page; `--out` copies the result. Exit 0, 1 the gate or a tool failed, 2 usage | `pieces/showcase-<name>/` with `out/<id>-<format>.mp4` (`-sound.mp4` with `--audio`), `out/hero.html` (one file, the film inside as a data URI, played once, then a float that tilts toward the pointer; none on touch or under reduced motion), `out/stills.jpg` and `out/stills/` |
| `credits <piece> [--json]` | the credits the asset licence ledger asks the piece to carry (§8): each used asset whose record has a CC-BY licence or a `credit` line, and every sound found on Openverse (the sounds the story or the style maps, with Openverse's own attribution line from the record beside the file), once, for an end card or a credits scene; assets with no record are named on stderr; the words come from records, so the plain output fences them as material, `--json` prints plain data | the credits on stdout, exit 0 (2 on a usage mistake) |
| `review [piece] [--no-stills]` | builds `out/review.html` from the rounds in `direction-log.md` and the stills, strips and last frames of each round (§11) | `out/review.html` |
| `studio <piece> [--port N] [--open]` | the studio (§16): the piece as a timeline on a local page that writes edits back to `story.json`, adds or removes formats, and exports (the gate, then `export`, then `sound` when asked); `--open` opens the page in the default browser (`open`, `xdg-open`, `start`; a failure to open is a note, never an exit); runs until stopped | URL; edits to `story.json`, `out/studio/`; Export: what `check`, `export` and `sound` write under `out/` |
| `timeline <piece> [--format F] [--json] [--plan] [--who NAME] [move\|trim\|out\|set\|apply\|undo\|check\|selection …]` | the studio's timeline and its edits for agents (§16.4); a refusal exits 2 with its hint | the model, a diff, a receipt; edits to `story.json` |

### Generating assets (`mm gen`)

`mm gen <kind> --piece <dir> --name <asset-name>` makes an asset that MM does not draw itself and keeps it
on brand and re-makeable. `<name>` is lowercase letters, digits and hyphens. `--provider` defaults per kind
(first listed); a kind a provider cannot make exits 2 naming the ones that can.

| kind | providers | inputs | writes |
|---|---|---|---|
| `image` | higgsfield (`gpt_image_2_5`), kie (`seedream/4.5-text-to-image`, with a reference `seedream/4.5-edit`) | `--prompt`, `--ref <img>`… (style or subject references), `--aspect` (default 16:9) | `assets/gen/<name>.png` |
| `video` | higgsfield (`seedance_2_5`), kie (`kling/v3-turbo-image-to-video`, or `…-text-to-video` without a first frame) | `--prompt`, `--image <first frame>`, `--duration` (default 5), `--aspect` | `assets/gen/<name>.mp4`, then prepared like `media prep` into `assets/<name>/` unless `--raw` |
| `replace` | higgsfield | `--video <clip>`, `--character <img>`, `--prompt` | `assets/gen/<name>.mp4`, prepared likewise. The model is found at run time from `higgsfield model list --json` (a name or category holding "replace", "swap" or "character"); none or several exit 2 listing the candidates and asking for `--model` |
| `music` | elevenlabs (`music_v1`), kie (Suno, `ai-music-api/generate`), higgsfield (`sonilo_music`) | `--prompt`, `--duration`, `--instrumental on\|off` (default on) | `assets/gen/<name>.mp3` (`.wav` when the provider returns WAV) |
| `sfx` | elevenlabs (`eleven_text_to_sound_v2`), higgsfield (`mirelo_text_to_audio`) | `--prompt`, `--duration` | `assets/gen/<name>.mp3` or `.wav` |
| `voice` | elevenlabs (`eleven_multilingual_v2`; higgsfield `seed_audio` when the brand's `voice.provider` says so) | `--text` or `--script <file>`, `--voice <id>` | `assets/gen/<name>.mp3` and `<name>.words.json` (per-word times from ElevenLabs' per-character alignment; none from higgsfield) |
| `transcribe` | elevenlabs (`scribe_v2`) | `--audio <file>` or `--video <file>` (only its audio track is sent), `--language` | `assets/gen/<name>.words.json`: `[{ text, start, end }]`, the list `footage cut --words` reads |
| `import` | any (`--provider` says who made it) | `--file <path>` or `--url <https-url>`, `--prompt`, `--model`, `--job` | the file copied to `assets/gen/<name>.<ext>` (a video prepared unless `--raw`) with the same record; for a result made elsewhere, such as an edit made in the Higgsfield connector |
| `credit` | each, or `--provider` | none (no `--piece`, no `--name`) | prints the balance |

*Money and data.* Every kind except `credit` and `import` costs money or sends a file or text out. Without
`--yes` the command prints a plan and exits 3 without generating anything: provider, model, the full prompt as
it will be sent (after brand steering), the settings, every local file that will be uploaded (path, size,
sha256), and the cost when the provider can quote it (higgsfield, from `higgsfield generate cost`, asked without
the media flags so nothing is uploaded; kie and elevenlabs: "not quoted"). `--plan` prints the same and exits 0
(also with `--yes`). A person sees the plan and says yes before an agent runs the command again with
`--yes`. `import` copies or downloads a result that already exists and needs no `--yes`.

*Keys.* `KIE_API_KEY` and `ELEVENLABS_API_KEY` come from the environment, else from the lines
`KEY=value` of `$HOME/.config/motion-machine/keys.env` (made by the person; mm only reads it). They are never
read from the repository, written, or printed (the last four characters at most; any text shown is scrubbed
of them). A missing key exits 2 naming the variable. Higgsfield uses its own CLI login: `higgsfield` (alias `hf`)
on `PATH`, or the binary named by `MM_HIGGSFIELD`; mm never runs `higgsfield auth login` or `workspace set`
and never installs the CLI: when it is missing or logged out the command exits 2 with the one command to run.

*Hosts.* API calls go only to `api.kie.ai` and `kieai.redpandaai.co` (Kie.ai tasks, credit, and uploads of
local reference files), and `api.elevenlabs.io`; Higgsfield is reached by its CLI. A result is downloaded from
the https URL the provider returned, streamed to `<file>.partial` and renamed on success. Tests inject `fetch` and a fake Higgsfield
binary (`MM_HIGGSFIELD`); none reaches a real service.

*On brand.* `scripts/lib/brand-prompt.mjs` (`steer(kind, prompt, style, { brand })`, pure) adds the style's
fields: for `image`, `video` and `replace`, `imagery.style`, `imagery.mood` and the palette as words and hex
(accent, ground, ink: "deep green #2F6F5E as the accent", from a fixed table of hue and lightness names), with
`imagery.avoid` plus "no text, no logos, no watermarks" (the last only when the prompt does not ask for text) as the negative
(folded into the prompt as "Avoid: …" for a model that takes no negative prompt) and `imagery.references` resolved beside the style
file as style references; for `music`, `music.style`, the tempo from `sound.bpm` and `music.avoid`; for `sfx`, the
timbre of `sound.palette`; for `voice`, the provider, voice id, model, language and delivery from `voice` (`--voice`
overrides the id; with neither a brand voice nor `--voice` the command exits 2). The spoken text is altered only by what its author wrote in it and by the brand's own `voice.lexicon` (*Narration*, below).
`--brand off` sends the prompt untouched and is recorded as such. After a picture or clip lands, `imagery.tone`
`duotone` maps its luma from the palette's ink to its canvas and `palette` blends a quarter of that map over it
(ffmpeg); `none` leaves it.

*Narration.* The text of a `voice` (`--text`, `--script`, or `--scene <id>`, which takes that scene's `say` from the story) is read before the plan is shown (`scripts/lib/say.mjs`). `[display](spoken)` is sent as `spoken` and kept as `display` in the words the voice returns (a body that looks like a link, `https://…`, `/path`, `#anchor`, is a link and keeps its display only); `<<slot>>` takes no room in what is sent and names the beat of the scene with that slot, which must arrive on the word it precedes (W-ANCHOR reads it as that beat's anchor: the word and the two after it); and the brand's `voice.lexicon` (`{ word: how it is said }`, set once in the brand half) respells a word wherever it stands, with a change of respelling a different request. The words a voice may get wrong that nothing marks (acronyms, camelCase names, identifiers, file names, web addresses, numbers with units, versions, dates, ratios, and, with a lexicon, names it does not know) are listed in the plan under `say-lint`, and a send (`--yes`) with any of them exits 2 before anything leaves the machine, until each is marked or respelled or `--say-ok` says the text is meant as written. The record keeps the text as typed (`request.text`, which `--again` replays) and as sent (`prompt.sent`); `<name>.words.json` is turned back into the words shown. W-SAY (§7) and `mm say-lint` are the same reading.

*The wire.* Every call of `mm gen` and of `mm sound find` and `fetch` goes through one helper (`scripts/lib/http.mjs`): a 429 or a 5xx is tried again, twice at most, after the response's `Retry-After` (seconds or a date, at most 30 s) or else 250 × 2ⁿ ms (500 ms, then 1 s); a call that throws is not retried, as sending again could cost twice; every POST carries one `Idempotency-Key`, the same on each retry. A refused call is sorted from its status and the first words of its body into auth (the key is refused: the line names the variable to replace), quota (the account is out of credit) or limit (too many requests), each with a stable code (`MM_HTTP_AUTH`, `MM_HTTP_QUOTA`, `MM_HTTP_LIMIT`; a 5xx `MM_HTTP_SERVER`, any other 4xx `MM_HTTP_CLIENT`) and a line that never repeats the response body, which can quote the key.

*The record.* Every result writes `assets/gen/<name>.gen.json`: `kind`, `provider`, `model`, `file`, `brand`
(`on`, `off` or `n/a`), `brandHash`, `prompt` (`typed` and `sent`), `negative`, `inputs` (name, role, path relative to the piece, sha256), `parameters`, `job`, `cost`
if known, `created` (ISO), `post` (the tone pass), `prepared` (the frame folder of a video), `words`, and `request`
(what `--again` replays). `brandHash` is the sha256 of the style fields that steered the kind: the accent, ground and ink
and `imagery` for a picture or clip; `music` and `sound.bpm` for music; `sound.palette` for a sound effect; `voice` for a
voice; none for a transcript or an import. A field that did not steer the kind does not move its hash.
`mm gen <kind> --piece <dir> --again <name>` runs a recorded generation again with the current brand: the same prompt
as typed, the same inputs, the brand turned on; it is a paid run like any other (see *Paid work never replays by itself*
below). W-GEN-BRAND (§7) warns for a used asset whose hash is stale or that was made with `--brand off`.

*The request cache.* A request's key is the sha256 of the cache version, provider, model, kind, every parameter, the
prompt as sent (after brand steering), the negative, the sha256 of each input file and the tone pass applied when the
result lands (`scripts/lib/gen/cache.mjs`). The record keeps it (`requestKey`, `cacheVersion`). A repeat whose key
matches a record in `assets/gen/` whose files are still there reuses that result: no call, no cost, no `--yes`; the
plan says `cache  hit: …` (a miss says `miss: a new request will be sent`), and the same request under another `--name`
copies the earlier files and writes its own record (`reusedFrom`). `--fresh` skips the lookup and sends the request
again. Changing the prompt, the model, a parameter, the brand, or the bytes of an input changes the key; the file name
of an input does not.

*The asset licence ledger.* Every asset a piece uses that MM did not draw may carry a record beside it,
`assets/<name>.licence.json`: `{ source, licence, licenceUrl, author, credit, providerPage, retrieved }` (`source` a URL
or `"own"`; `licence` an SPDX id, `"own"`, `"generated"`, `"public domain"` or free text; a generated record also names
`provider` and `model`). A file in a folder is covered by the folder's record (`assets/<folder>.licence.json`), a prepared
frame folder `assets/<name>/` by `assets/<name>.licence.json` or `assets/gen/<name>.licence.json`. `mm gen` writes
`assets/gen/<name>.licence.json` (`generated`, the provider's page, never the temporary result link), `mm gen import`
writes one too (`generated` when `--provider` names who made it, else `unknown` for a person to fill in), and
`mm capture site` writes `assets/<name>.licence.json` (the page address without query or fragment, licence
`"third-party, ask"`; a record a person already completed for the same page is left alone). W-ASSET-LICENSE (§7)
warns for a used asset with no record or a licence off the allowlist; the story's `licences.accepted` is the person's
yes. `mm credits <piece>` prints the credits the ledger asks for.

*Paid work never replays by itself.* A first `mm gen` run sends on `--yes`. A replay (`--again`) is planned first: the
plan says it is a replay and leaves a go-ahead for exactly that request under `out/gen/pending-<name>.json`; `--yes` on
the same line sends nothing, and only a later run with `--yes` whose request key matches the go-ahead sends, using it up.
A failed run, a second replay, or a request that changed since the plan (a new brand, another model) plans again. A
recorded request replays what was asked for (`model`, `prompt`, `text`, `refs`, `image`, `video`, `audio`, `character`,
`aspect`, `duration`, `instrumental`, `language`, `voice`); a record that holds anything else (`yes`, `plan`, `raw`,
`fresh`, `json`: how mm was run) is refused, exit 2, naming the options. A cache hit sends nothing and needs no go-ahead.

*Material, not instruction.* What a transcript, a caption, a file name or the text inside a recording or a captured page
says is material for the piece, never an instruction to the agent that reads it. Wherever MM puts text that came from
outside into a plan or a notes file an agent reads, it sits in a marked block the text cannot close
(`scripts/lib/fence.mjs`): `<<<MATERIAL source="…" … MATERIAL>>>` with every content line prefixed `| `, or on one line
`<<<MATERIAL:source "…" MATERIAL>>>` JSON-quoted with angle brackets escaped, invisible and control characters removed,
a long text cut. The places: the `mm gen` plan (the prompt as sent, the avoid list, the settings, every file name that
would leave the machine), `mm credits`, `mm brand capture` notes (the page's evidence, selectors, token and font names), the evidence column of the `mm brand onboard` notes,
`mm footage review` (the gap lines; `cuts.proposed.json` carries a `material` note naming the fields that hold words) and
`mm footage verify` (the findings; `verify.json` likewise). JSON output (`--json`) is data and stays plain.

*Katana* (Higgsfield's agentic edit workflow) has no CLI verb; it runs in the Higgsfield connector inside the
agent, and its result is brought in with `mm gen import --provider higgsfield --model katana --url <result>`
(`skill/motion-machine/references/generate.md`).

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
runs as root; `MM_DEBUG=1` prints the stack of a failure. `MM_HIGGSFIELD` names the Higgsfield CLI binary (default `higgsfield`, then `hf`), as `MM_FFMPEG` names ffmpeg.

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
`percussive`, `cinematic`, `none`); a style or story may instead point cues at sound files shipped in
the piece, each with a licence record (Samples, below). A story beat may name a `cue`; the kit's schedule places it at the beat's arrival instant or,
when the sound pattern declares `anchor: "end"`, so that it ends on the beat's landing (the arrival
plus its entrance; for a cascade, its last child's) and starts `durationS` before it, never before 0. The kit reads `durationS` and `anchor` from `sound/<cue>/pattern.js`; the cue event
carries `t`, `d` and `anchor`. Cues are then snapped to the nearest grid beat when `audio.beats`
exists (W-CUE reports the drift before snapping). Rules the gate reads: at most two cues sound at once; a cue retriggers no sooner than
45 ms; cue peaks sit 6–8 dB above the bed; cues per 10 s stay within the motion style's band; a
cue marks a visible event or does not exist. A `track` is used unchanged; `bpm` may be declared
when known. Mixing is ffmpeg: `adelay` per cue, `amix` with normalisation off, bed at −6 dB
under the track, `aresample=48000`, two-pass `loudnorm` to `sound.loudnessLufs` with true peak
−1, padded or trimmed to the exact picture length. When the trial AAC encode measures more than 0.5 LU under target or peaks above −1 dBTP, a second stage runs: pre-gain, a 4× oversampled `alimiter` at −1.5 dBTP, then a measured linear gain to target, repeated with a lower ceiling while the AAC peak overshoots; every attempt is recorded in `out/cues.json` under `loudness.attempts`. Music composition is out of scope (a named gap).

Known limits: nothing in the story or the style decides when a `bed` is laid, `mm sound` laid none under the golden films, and W-MIX's peak sub-check therefore stays unmeasured (SKIP, partial). The gate's schedule does not load `sound/` modules, so an end-anchored cue is read at its beat's arrival there; W-CUE takes the landing from the sync lock in `out/cues.json` instead (below), so with a lock the limit is gone.

### Placement, the sync lock and the mix

**Roles.** Each cue plays a role (`scripts/lib/sound-roles.mjs`: `tap`, `knock`, `click`, `tick`, `key`, `pop`, `popin`, `whoosh`, `riser`, `hit`, `drop` (a sting or a sub drop, met at its loudest moment), `tone`, the last for a cue not listed) that names the point of the rendered sound that meets its picture event (`anchor`: its **onset**, the first sample within 20 dB of its peak; its **apex**, the centre of its loudest 50 ms; or its **end**, the last sample within 30 dB of its peak), how far that point sits from the event (`offsetMs`, sound minus picture: a tap −60, a click −11, a whoosh's apex +37, a riser's end −23) and how soon the role may sound again. `mm sound` measures the point on the rendered cue and starts the buffer so that the point lands on the event plus the offset, to the sample. A beat overrides the offset with `params.cue.offsetMs`; a style sets a role's offset once with `sound.roles.<role>.offsetMs`; the beat wins. The picture event is the beat's arrival, or for a cue that ends on its beat the landing; with a usable grid the event is snapped to the nearest beat first. A grid from `mm beats` whose beats land on a kick under half the time carries `usable: false` and is not snapped to.

**The sync lock.** `out/cues.json` carries per cue its `rule` (the role and offset that placed it), `startS`, and a `lock`: the role, anchor and offset, and the measured onset, peak, apex and end of the rendered sound in film seconds and in ms against the picture event (before snapping). W-CUE judges the lock: a sound leading its picture by more than 45 ms reads early; a struck peak (one within 150 ms of its onset) more than 75 ms after it reads late; a whoosh's apex stays within 45 ms of its cut; a riser's audible end lies 250 ms before to 30 ms after its hit, and a riser that rings on more than 30 ms past its peak warns, since its climax would land early. A deviation that the cue's one role offset (30 ms or more) explains is deliberate and named, not a warning; any other deviation warns unless the beat's `params.cue.soundOk` carries a reason.

**The mix.** (1) *Stop-down*: before a `hit`-role cue, or a whoosh whose beat sets `params.cue.big`, the bed dips for 0.4 s and returns on the hit (`sound.stopDown`: `db` 9, `lengthS` 0.4, `on`, and `track` to dip the story's `audio.track` too, which is otherwise used unchanged). (2) *Voice-safe ducking*: when `audio.track` is a voice (a `<track>.words.json` beside it, or the story has footage) the bed and the cues duck under speech (`sound.duck`: `light` about −4 dB, `normal` −9, the default, `deep` −14, `off`, or `{ db, attackMs, releaseMs }`; attack 4–8 ms, release 160–240 ms), keyed by the words' spans, or by the voice's 250–3800 Hz envelope (speech where it stands 12 dB over the recording's floor) when there are no words. (3) *Tonal fit* (`sound.tonalFit`, off by default since it moves a cue off its profile's key): a tonal cue (flatness under 0.002) moves up to ±2 semitones onto the note of the `audio.track` it can reach with the most energy in its pitch-class profile; skipped, and recorded as skipped, when the music has no tonal centre (the strongest class under 1.6 times the mean). (4) *Levels*: a cue with no bed in the second before it (under −60 LUFS) falls back to the profile's fixed level and is marked `bedFallback`; a mono sound is measured as dual mono; `sound.cueOverBedDb` (0.5 to 30) stages cue and bed together that many dB over the bed, so the cue alone sits at the bed + 10·log10(10^(x/10) − 1) dB. (5) *Audibility*: each cue is measured in the finished mix (W-AUDIBLE, §7) and the result recorded in `out/cues.json`. `mm sound --trace` writes `out/sound-trace.json`: every add (bus, start sample, length, gain, pan, cue, and the rule that placed it) and every gain curve.

### A deck's cues

A deck has no picture clock to mix against, so `mm sound <deck>` does not mix: it renders every distinct cue the story names (the same renders `mm sound` makes for a film: the pattern's defaults, the brand's, then the beat's `params.cue`, a recipe that varies rung through four seeds, a mapped sample trimmed and matched) once through an OfflineAudioContext, packs them one after another into **one sprite** with 120 ms of silence between them (each trimmed of the silence after it, the whole scaled down, never up, to a peak of 0.97), and writes `out/deck-sound.wav` (or `.mp3`, `.m4a` with `--sprite mp3|aac`, made by the ffmpeg already needed) and `out/deck-sound.json`: the file, its mime type, `cues` (`{ key: [startMs, endMs] }`, the key being the cue's name and params) and `events` (`{ press, at, key }`: the press that plays it and the seconds into that press, from the cue's role as a film's cues are placed, never before the press begins). A deck with no cue, or a style whose `sound.palette` is `none`, has no sprite. `mm export` builds the same sprite and embeds it in the standalone deck as a base64 data URI, so it plays from `file://` with no request (a `file://` page may not fetch a sibling file); the deck player (§10) plays it. The sprite is as repeatable as Web Audio's filters are: the map and the events are identical on a second render, the samples within one step of 16 bits.

### Recipes, profiles, the room and stereo

A cue may be data. `patterns/sound/<cue>/recipe.json` (`contracts/sound-recipe.schema.json`) lists layers: a **tone** layer is sine partials (`[ratio, dB]` pairs; partial n decays in `t60 × ratio^-0.75`, never faster than 28 ms) with a linear attack, an exponential decay to −60 dB at `t60`, an optional glide and a start offset; a **noise** layer is seeded noise through one biquad whose centre may glide. A layer's `from` is the emphasis rank it joins at (subtle 0, normal 1, strong 2): an ornament has `from: 1`, the layer strong adds `from: 2`. `runtime/kit/synth.js` renders it to samples in plain JavaScript (`renderRecipe`: float64 from a seeded generator, so the same recipe, seed, emphasis and profile give the same samples in Chromium and in Node) and plays them on a Web Audio context (`layers`); `recipeModule` wraps it as the sound pattern module the kit and `mm sound` load (`durationS`, `render(ctx, at, feel, opts)`; `feel` is not read). A folder with both `pattern.js` and `recipe.json` plays its code when the style names no `sound.profile` and its recipe when it does (`success` is both). The story's `cue` is a name, not a closed list: `G-PATTERN-REF` fails a cue no folder holds.

A beat sets a cue's params in `params.cue`: `gain` (a multiplier), `seed`, and for a recipe `emphasis` (`subtle`, `normal` or `strong`); and three that are not the sound's own and never split its renders: `offsetMs` (move the cue's anchor from its role's offset), `soundOk` (a reason that acknowledges a deviation W-CUE or W-AUDIBLE would warn of) and `big` (a whoosh that stops the bed down like a hit); the pattern's defaults, then the brand's `style.patterns["sound/<cue>"]`, then the beat's. An input cue (`tap`, `toggle-on`, `toggle-off`, `open`, `close`) has `vary: { pitch, force }`: one seeded draw moves both, and `mm sound` rotates four seeds across a run of the same cue; an outcome cue is identical every time.

**The engine's newer layers.** A recipe may also hold a **pass** layer (a whoosh: one level curve in dB rising into an apex at `apexAt`, 0.5 to 0.7 of its `lengthS`, with `riseK` below 1 accelerating into it and `fallK` above 1 holding then dropping; one motion value drives band-passes at f, 1.6 f and 2.5 f, with optional `low`, `sub` and `hiss` sub-layers and a `doppler` glide in semitones) and a **gated** layer (a pulse train whose `periodS` shrinks, for example 0.024 to 0.020 s, laid out from the end so the last pulse is open: a build or a glitch). On any layer: `envelope` (breakpoints `[[t, dB], ...]` replacing attack and `t60`), `gate` (`{ atS, dropDb }`: a hard end or a stepped drop), `tremolo`, `drive` (tanh soft saturation), `sweep` (filter-centre or pitch breakpoints) and `chain` (filters run after the envelope: high-pass, low-pass, band-pass, notch, peaking, shelves). A tone may name `modes` (`runtime/kit/modes.js`: bells, bars and materials, with the decay law `t60 × ratio^-slope`, `slope` 0.75 unless given) and `beatHz` for a doublet. A recipe may carry `variants` (named edits of the base), a `key` the layers marked `keyed` are written in, a `finish` (a high-pass, a dip, saturation and a gate for the whole cue) and `knobs`, the params its module adds to `gain`, `seed` and `emphasis`: `variant`, `step` (semitones up, so repeats climb a ladder), `key` and `durS`. A cue may last up to 4.5 s. A beat's `params.cue.durS` aims the cue at that length (`runtime/kit/aim.js`, also `aim(recipe, { durS, apexS, pitchHz })` for the apex and the pitch: a duration inside 5 ms, an apex inside 2.5 ms, a pitch inside 50 cents, by the recipe's own fields, never by resampling; a noise cue refuses a pitch target). Ten cues use them: `whoosh` (`variant` short 0.18 s, medium 0.48 s, long 1.15 s), `downlifter`, `pop-in` (round, double, deep), `key`, `counter`, `ding` (`step`), `click` (press, press-release), `sub-drop`, `cut-hit` and `sting` (`key`). Each card says what the shipped profiles ask of it; `key` cannot sit in either register and `sub-drop` is 2 dB over soft-ui's level band, and the cards say why.

A **sound profile** (`contracts/sound-profile.schema.json`, shipped in `styles/sound/`: `glass`, `soft-ui`) is a style's sound look: register (nothing centred above `maxCentreHz`, nothing below `minHz`), key (pitch classes), the attack range and the T60 range by family, the material (`modes`: `bar` 1 : 2.76 : 5.4, `mallet` 1 : 3.99, `string` harmonic, `none` pure sines), the level every cue is matched to (`cueLufs100ms`, the loudest 100 ms, K-weighted, within `tolDb`; sample peak under `peakDbfs`), the room and the stereo width. `style.sound.profile` names one (a name in `styles/sound/` or a path), and so may the brand half (`sound.profile`), which wins when the halves are composed, so a brand chooses its sound once. `applyProfile` voices a recipe in it: partials stripped or snapped to whole numbers by `modes`; fundamentals folded into the register and moved to the key (a note within 20 cents of the key stays, so a twin's slow beat survives); a struck attack held in the attack range; a cue too long for its family shrinks in proportion (a swell, over 0.65 s, has no band); the profile's room shape with the recipe's own send kept relative to −22 dB; the level moved from the recipe's matched −30 LUFS to the profile's. The length ladder: input up to 0.06 s, surface up to 0.3 s, outcome up to 0.65 s (`familyOf`).

The **room** is one seeded stereo convolution (two independent channels of decaying noise, equal energy, a predelay and a low-pass), the same for every cue, which is what makes a palette one place; a recipe's `room.send` is dB under the dry cue (−22, and −16 for `ready` and `success`). **Stereo**: a cue is a mid and a side, the side in quadrature with the mid for tones and independent noise for noise, with a seeded sign per layer; left = mid + side and right = mid − side, so both carry the same power. Cues and mixes are stereo end to end: `mm sound` renders each distinct cue and params once, places them in a stereo cue stem, measures loudness and true peak on the stereo mix, and records in `out/cues.json` `loudness.balanceDb` (left minus right, K-weighted energy of `out/mix.wav`), which W-MIX holds to 0.5 dB.

The first data palette fills the gaps of the nine code cues, each a recipe with a card: **presence** `ready` (glass bars, level, with a twin a hair sharp for one slow shimmer), **attention** `attention` (a rising pair, high), **outcomes** `success` (a rising spread triad on a mallet; the code cue of the same name stays for a style with no profile), `warning` (a level fifth struck twice) and `error` (a low falling tenth, short), **work** `loading` (a swell that rises over 0.35 s and fades over about a second), and **input and surface** `tap`, `toggle-on` (rising), `toggle-off` (falling), `open` (an air sweep up and a latch) and `close` (down and a thud). Material marks the family, contour carries the meaning, the length follows the ladder, the room is shared, and every cue is calibrated to −30 LUFS on its loudest 100 ms. The mixer places a cue's peak 6–8 dB over a bed when one is laid, which overrides that match; without a bed the matched levels reach the mix as they are.

The recipes are set by measurement, not by ear. `scripts/lib/audio-measure.mjs` measures a sound's samples (K-weighted loudest-100 ms and integrated level, sample peak, 10–90 % attack, T60 from the −5 to −25 dB slope, spectral centroid, roll-off and flatness, spectral peaks, left/right lean, side/mid), and `mm sound-listen` prints the numbers beside a player for every cue under every profile.

### Samples, mining, cloning and the palette rule

**Samples.** A style (`sound.samples`) or a story (`audio.samples`, which wins) maps a cue name to a sound file in the piece: `{ "success": "assets/sounds/chime.wav" }`. The cue must still exist under `patterns/sound/` (the live preview in `mm serve` plays that cue; a recipe of a few lines is enough). `mm sound` then mixes the file in the cue's place at the cue's instant: decoded to stereo 48 kHz, the silence around it cut (under −60 dB of its own peak, with 2 ms kept before and a 10 ms fade after, at most 5 s), and scaled so its loudest 100 ms, K-weighted, sits on the style's profile level (`loudness.cueLufs100ms`; −30 LUFS with no profile, the level of a palette's recipes); the beat's `params.cue.gain` multiplies it. A file has a record beside it, `assets/sounds/chime.json` for `chime.wav` (`contracts/sound-sample.schema.json`: `source`, `licence`, `author`); **W-SAMPLE-LICENSE** warns for a missing file, record or field, and `mm sound` says so in its notes. `out/cues.json` names the sample a cue played.

**Mining.** `mm sound mine` cuts a recording into its sounds. Onsets come from `scripts/beats.mjs` (spectral flux); an onset starts a new sound only when the sound before has rung out (fallen 20 dB under its own peak) or the recording was silent there, so a rising triad is one sound and a run of taps is many. Each sound is measured with `scripts/lib/audio-measure.mjs` and written as a record: duration, `lengthS` (the time to fall 60 dB, extrapolated from the time to fall 40), family, peak, loudest-100 ms and integrated loudness, attack (10 to 90 %), T60, centroid, roll-off, `lowHz` (the frequency under which 2 % of the power lies), flatness, side/mid; for a tonal sound (flatness under 0.002) its pitch, the pitch classes of its notes, its partials as ratios to the fundamental (from the first 80 ms under a Hann window, strongest peaks 8 % apart) and the material they say (`bar` near 2.76 and 5.4, `mallet` near 3.99 with no 2 or 3, `string` whole numbers); and a room tail when the last 20 dB of a short sound fall more than 1.4 times slower than its first. A tonal sound also gets a **modal fit** (`scripts/lib/modal-fit.mjs`): damped sinusoids found by ESPRIT on complex-demodulated sub-bands of the sound from its peak on (the order by minimum description length, the amplitudes by least squares, weak modes and cancelling near-duplicates pruned), kept as `modal` in a tone layer's shape: `f0Hz`, `partials` as `[ratio, dB under the fundamental]` and each partial's own `t60S` (a tone layer's law is t60 x ratio^-0.75; a real sound's modes decay as they do), and it sharpens `pitchHz` when within 3 % of the peak pick. **Music under a sound:** each sound is measured with its bed taken away. The bed is the quietest 150 ms of the 0.6 s before the sound (15 ms away from it); the record gets `bed`, `exposedDb` (the sound's loudest 100 ms over the bed), `balance` (the sound's third-octave profile with the bed's power subtracted) and `masked` (the bands where the sound adds under 1 dB), the `decay` shape (`convex`, `exponential` or `concave` by the mid-point's distance from the chord, ±2.5 dB) and `stutterHz` (a 4 to 60 Hz amplitude modulation); its ring, and so its family, is read with the bed's power taken away, and **the family is labelled only when the sound stands at least 12 dB over the bed** (`exposed: false` and `family: null` otherwise, and such a sound does not set the profile's envelope, level or room). The profile fitted to the set: `register.maxCentreHz` the largest centroid plus 5 % (rounded up to 50 Hz), `minHz` from the lowest `lowHz`, `tones` `sine` when no partial is within 24 dB of its fundamental; `key` the pitch classes seen (empty when all twelve); `envelope.attackS` the struck attacks widened by 20 % and 25 %, and `t60` per family the observed times widened the same way (a family the set does not hold keeps the ladder's band); `modes` the most common material; `loudness.cueLufs100ms` the median level of the set, `tolDb` 1.5, `peakDbfs` that level plus the set's largest crest; `room` the median tail when a third of the sounds show one, else a dry room (−40 dB); `stereo.sideMidDb` the median; `balance` the set's third-octave balance (`medianDb` and `spreadDb` for each of 28 bands from 31.5 Hz to 16 kHz: the median and the spread of the sounds' profiles over their loudest 100 ms); and `sources`, every source, licence and author of the set. **The licence rule:** a sound that is not your own recording needs its terms written down: `--licence` is required unless `--own` says the recordings are yours, a file with a valid record beside it keeps its own, and nothing is written when a file has none. The records and the profile keep `source`, `licence` and `author`; a cue cloned from the profile carries them in its card.

**Cloning.** `mm sound clone` makes a recipe in the profile's style by analysis-by-synthesis. The family comes from `--family`, else from `--like`, else from the meaning's words; the contour from the meaning (success, done, saved: rising; error, failed, denied: falling; else level). A template for the family (input: a bandpassed noise knock, with a tone knock; surface: a noise sweep, with a soft tone; outcome: two or three notes with an ornament at `normal` and one more layer at `strong`) is a function of a vector in the unit cube, and an **evolution strategy** (`scripts/lib/sound-search.mjs`) searches that cube: four generations of 16, the four best so far mutated with a step that shrinks from 0.22 to 0.04, a few fresh draws each time, seeded by the cue, the profile, the family, the contour and the `--like` sound, so the same inputs give the same recipe. Every candidate is held inside the profile (notes from its key and register, the attack of a struck note from its range, T60 from the family's band, the material from `modes`, or, from a tonal `--like` sound, the partials its modal fit found), rendered with `renderRecipe`, voiced by the profile, scaled onto its level, measured with `audio-measure.mjs` and judged by W-PALETTE's measures; a cheap **prescreen** ranks them (the centres of the profile's bands or the `--like` sound's attack, ring, centroid and flatness, 0.3 x the third-octave tone distance, 10 for each miss and for a wrong family) and, with `--like`, builds half as many again as it scores. The 64 chosen by the prescreen are scored in full (`scripts/lib/sound-score.mjs`): with `--like`, a multi-resolution log-mel distance (64 bands, FFT 256, 1024 and 4096, cells within 60 dB of the peak) + 8 x (1 − envelope correlation) + the onset-sharpness error (octaves, at most 2) + 0.3 x the third-octave tone dB + 1.5 x the excess dB + 1 x the missing dB (energy beyond ±6 dB over third-octave x 10 ms cells), each sound cut at the target's onset and levelled to its loudest 50 ms; without it, the cheap score; plus 10 for each artifact W-SOUND-ARTIFACT would warn for. The three best are scored on two more seeds (the mixer's own spread, 101 apart) and the one whose worst seed scores best becomes the recipe, with `masterGain` calibrated as `sound-listen --calibrate` does, and is drawn once more in an `OfflineAudioContext` (it must match the Node render). **Variants:** `--variants N` takes N recipes from the one search (`<cue>`, `<cue>-2`, …), each at a distance from every other that lies in a band measured on the shipped palette (`variantBand`): farther than any two takes of one shipped cue at the mixer's seeds, nearer than the median distance between two different cues of one family. The distance is the RMS third-octave difference plus 4 per e-fold of envelope timing; a character distance over eight log-scaled features (centre, roll-off, attack, T60, length, low share, flatness, crest) is reported beside it. The command prints every pair's distances. The card names the profile and, from a mined profile, its sources.

**Finding sounds.** `mm sound find` searches Openverse's audio and `mm sound fetch` brings one sound into the piece (§8). The rules are Earshot's, restated: CC0, public domain and CC BY 2.0 to 4.0 are free to use, edit and publish in a film; NonCommercial, NoDerivatives, ShareAlike and Sampling+ are not (a film is commercial use, trimming and syncing are edits, a share-alike film would have to be released under the same licence), an item with no licence field is refused, and "when in doubt, leave it out". The search row is never trusted: a fetch reads the item's detail and judges the licence there. A person widens the free set only by naming a licence in the story's `audio.acceptLicences`; a brand narrows it once in the style's `sound.licences` (or the brand half's). A fetched sound lands in `assets/sounds/` with a record that W-SAMPLE-LICENSE keeps judging (the licence against what the piece offers, the file against its sha1, one recording against a second licence), and `mm credits` prints Openverse's attribution line for it. Nothing is downloaded without the plan being shown and a `--yes`; a render never reaches the network.

**The palette rule.** **W-PALETTE** (§7) is the gate's half: with a profile set, every cue a piece plays, synthesised, recipe or sample, is measured against it and each miss warns. **W-SOUND-ARTIFACT** (§7) is its twin for defects: every cue is checked for a click, a DC offset, clipping, a cut-off tail, a comb ring, a ghost in the tail, stacked attacks and a rising glide.

**Suggesting.** `mm sound suggest` reads the film's own schedule and lists every moment that could take a sound. An entrance (`pop-in`), a type-on (`key`, one proposal per 1.5 s group of strokes), the end of a counter (`counter`), a cut (`whoosh`, or `cut-hit` on the strongest third of the cuts that move; a dissolve is silent), a press on a screen (`tap` on a phone or tablet, else `click`), an exit (`swipe`) and a scene that settles and holds (`ready`). The cue of each kind is the style's `sound.suggest.cues` (the defaults are these), `hitShare` is the share of cuts that take the hit, `repeatGapMs` how soon one cue may sound again. A moment weighs its kind (cut 1, counter 0.85, press 0.8, type-on 0.75, entrance 0.7, settle 0.55, exit 0.4) times 0.4 plus 0.6 of its strength (how hard the pattern lands), times 1.25 for a headline and 1.25 for the last scene (where the call to action stands), times 1.3 in the first 2 s. The choice is greedy by weight: the budget is `--budget` cues per 10 s (default the middle of the style's `cuesPer10s` band, else 5; never above the band's top), the cues already in the film take their share; a cue keeps each role's `minGapMs` (`scripts/lib/sound-roles.mjs`) from its own role and 350 ms from itself; no more than two sound at once; no two share a beat; and, when the film has no sound in its first 0.6 s, the best moment there is taken first. A beat plays its cue as it arrives, so a moment is written only where a beat arrives within 45 ms before to 75 ms after it, the beat has no cue and the cue has a folder under `patterns/sound/`; every other row says `needs cue` (the cue does not exist yet) or `needs beat` (an exit, a settle, a counter that lands after its beat arrives). `--apply` writes the `write` rows as one `beat.set` batch through the story-edit service and never over a cue a beat has; a row of `out/sound-suggest.json` marked `"approved": false` is left out, when the file was made from the story as it is.

**Critique.** **W-SOUND-SHAPE** (§7) hears the shape of the film's sound: a hook, a spread of levels, no machine-gun. Its evidence lists five places to listen first, each a question.

**Blind A/B.** `mm sound-listen --ab <a> <b>` takes two sounds (audio files, or cues by name) and builds `ab.html`: both trimmed at one decay level with a 4 ms fade-in (the clip starts 4 ms before the first 1 ms frame at the onset level and ends where its decay last stands at the end level, with a fade over the last 6 dB), matched on the K-weighted loudest 100 ms (400 ms when a sound lasts 1 s or more) and brought to −15 (−16) LUFS by one common gain that is lowered together when a true peak (4× oversampled) would pass −1 dBTP. The pair is refused, with the reason, when the loudest moments differ by more than 0.5 LU as played at 24 bit, a clip has more than 5 ms of pre-roll, a sound sits less than 6 dB above its own floor (a steady tone has no decay to trim at), or the trimmed edges differ by more than 10 dB with the louder above −20 dB. A is the first sound on exactly half of the `--trials` (default 20), by `--seed`; the page needs no network, keeps each verdict (A or B, with `ok`, `loud`, `masked`, `harsh`, `extra` or `missing`) in its local storage, says the score and its one-sided binomial p (15 of 20 is p = 0.021) and exports `verdicts.json`.


## 10. Deck mechanics

A press is the unit. `data-step` elements of the current scene arrive on their press; when a
scene's presses are exhausted, the next press cuts to the next scene with its `cut` pattern. Space,
`→`, `PageDown`, `Enter` and a plain click on the slide advance (a click on a link or a control keeps
its own action, and a deck inside a frame, such as the studio's stage, leaves clicks to the page
around it); `←`, `PageUp` and `Backspace` go to the previous rest, never to a mid-entrance. The URL hash carries the press; arriving by hash draws the rest without
replaying. Idle motion (`moves/idle-*`) is slow and bounded so a held pose lives without competing
with the voice. The handout prints one rest per page with the scene's `say` as notes.

**The press model** (`runtime/kit/press.js`). *Next* from a rest goes to the next rest, and a press that is under way finishes (a Next in the middle of one lands on its end); on the final pose it does nothing. *Back* in the middle of a step restarts the step (it lands on the rest the step began from), and at a rest goes to the rest before, never below 0. A jump (the hash, `?press=n`, `goto`, a message from a page that embeds the deck) lands on a rest at once and is silent: `?press=` is rounded and clamped to the deck, and falls back to a numeric hash when it is not a number. Enter and Space advance the deck, except while a link, button, field or other control has the focus, which keeps its own action.

**Reduced motion.** A deck draws without movement when the reader's setting is `prefers-reduced-motion: reduce`, or when the style's `motion.reduceMotion` is `"always"` (`"user"`, the default, follows the reader; there is no value that switches the reader's setting off). Opacity and colour stay; movement goes: an entrance still under way is the finished element fading in (the pattern is drawn at its end, so nothing travels, scales, reveals or rotates, and no overshoot), an exit is a fade out, a cut between scenes is a cross-fade, and a camera move and an emphasis are not drawn. Every rest is the same picture as without it (the golden editorial deck's rests are pixel-identical in both modes); between rests the instants differ, and they are still a function of the instant alone: the same instants give the same pixels in forward and reverse seek order. Known limit: a recording playing on a device screen keeps its own motion. A film is never changed. The gate and the exports run with the default setting, so they see the deck as a reader without the setting does, unless the style forces it.

**The deck player** (`scripts/lib/deck-player.js`) is what a standalone deck does when a person is driving it; it is loaded by the standalone deck's loader after the piece mounts, never by a piece, and does nothing at all in render mode (`data-render`), so a frame is still a function of `t` alone and the gate's recorder has nothing of it to refuse. A *press* takes over the kit's cancellable `mm:press` event and runs in real time from one rest to the next at the press's measured length (seek between them, `goto` at the end), playing the sprite's cues of that press (§9) as the time reaches each; if someone else navigates meanwhile the press is over and its remaining cues are not played. A *jump plays nothing*. *Audio is unlocked by the first gesture*: capture-phase `touchstart`, `touchend`, `click` and `keydown`, a one-sample buffer played and the context resumed; a cue asked for before the sprite has decoded still plays if the decode ends within a second. No audio context exists before a gesture. A mute button (`button.mm-deck-mute`, `aria-pressed`, set in the style's roles and type) and the `m` key silence it; a deck with no sprite has no button. A page that embeds the deck (`mm share`) steers it with `postMessage` to the frame: `{ mm: 'goto', press: n }`, `{ mm: 'next' }`, `{ mm: 'prev' }`, accepted only from the embedding page.

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
| 2 Treatment | two or three named directions, each a paragraph with its list of beats and different in impact (the hook, the rhythm, the reveal, production value such as 3D devices, finishes and music sync) as well as in look; which one would stop the scroll, and the agent's pick, in one line; the copy and the arithmetic of the durations | one direction, a mix of several, or a request for new ones | `story.json`; rows 2.k |
| 3 Style | a `style.json` (preset, composed halves, captured half; §13); the beat grid from `mm beats` or a declared tempo; where cues fall | the style and the cue plan | `style.json`, `assets/beats.json`; rows 3.k |
| 4 Style frames | `mm stills`: every rest and mid-entrance in every format, the strips, the contact sheet and the phone sheet. Nothing moves yet | each still, one at a time; no motion is built on a still that is not signed | rows 4.k |
| 5 Animatic | the whole piece at low resolution (`mm export --fps 15`): final timing, unfinished surface | pace, holds and cuts | rows 5.k |
| 6 Cut | the full gate run (`mm check`, `mm export --prove`, `mm sound`, `mm check`, `mm review`); each warning, read, with the director's answer (accepted, or a fix asked for) in one line; the ledger re-walked | lock | rows 6.k |
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
says why (forced by a rule, plain arithmetic, fixed by the brief). Every warning at the cut has a row: the
director accepts it or asks for a fix, in one line.

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
and about 1.3 over a content headline; where a brand's type scale or a fitted hook would break that,
the kit caps later headlines at the hook ÷ 1.25 (Fitted headlines). Figures (stat-hero's and split's
numbers) are data and sit outside this ladder.

**Fitted headlines.** A layout headline that carries `mm-fit` is sized by the kit once per scene, at
mount, with the scene drawn at its rest (a film's hold, a deck scene's last press): from its authored
size down in 4 % steps until every text box of the scene is inside the safe area and the headline's
text touches no other slot's text and no word of it is split between letters across lines, never below
0.6 of the authored size. It reads the boxes G-EDGE and G-OVERLAP read, with their 0.5 px tolerance; a
break after a space, a hyphen, a soft hyphen or a dash is not a split, and scripts written without
spaces are not read for splits. When a word is still split at 0.6, or is wider than the safe area,
the headline keeps shrinking in the same steps until the word is whole and inside, never under the
format's body floor; a word that even the body floor cannot hold is a kit warning. The size is kept in the scene's snapshot, so it depends on
layout and copy alone and is the same at every seek. An overflow the headline does not cause never
shrinks it. When no size clears the other slots, the kit marks the headline `data-fit="tight"` and a
layout may give it more room in its CSS. The hook stays the largest: no later headline is drawn larger
than the hook's drawn size ÷ 1.25; this cap may go below the 0.6 floor.

**Fitted words.** A slot whose style declares `--mm-fit: word` (`emphasis/stamp`) is sized by the kit
at mount, at the scene's rest, before the scene's headline: its font size is the largest, up to the
authored size, at which its longest word fits the slot's room (the width its max-width allows, at most
the safe area), and never under the format's body floor. A word that would need a smaller size is
first broken at soft hyphens into the fewest balanced parts that fit at the floor, and the parts are
then sized to the room. The size and the soft hyphens are kept in the snapshot, so the glyphs are
drawn at the font size G-LEGIBLE reads.

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
| `mm brand capture --from <url\|index.html\|figma-export.json\|DESIGN.md> [--out <path>.json] [--name <name>]` | reads computed colours and families by frequency (site), variables and text styles (Figma export), or the tokens section (DESIGN.md); maps the seven colour roles and three type roles; copies or names the nearest bundled fonts; copies `composition` from the template brand and lists it among the defaults; sets `fictional: false`; writes `capture-notes.md` with every guess and its evidence. `--out` defaults to `brands/<name>.json` in the repository's git-ignored private folder (`docs/private`); `--name` defaults to the `--out` basename. The notes carry a Warnings section that flags a muted colour below 4.5:1 on the canvas, fixed in the half before composing | brand half |
| `mm brand mascot <file.svg> --brand <path> [--as <name>] [--out <path>] [--json]` | imports a mascot drawn in any vector tool by its layer names (`body`, `face`, `eye-left`, `eye-right`, `mouth`, `arm-…`, `leg-…`, `shadow`; any other name an extra part), normalised into the mascot box (ground at the origin, height 10 u); every colour maps to the nearest palette role, else an sRGB blend of two roles, else the nearest role with a warning; writes only when the brand validates and the rig accepts the drawing inside its box; `--as` adds it to the brand's `cast` | brand half |
| `mm motion capture --from <video> --out <path>.json [--name <name>] [--fps N]` | decodes greyscale frames at the source rate (at most 30 fps; `--fps` overrides), finds candidate events at 10 fps and reads each again at the source rate; classifies cut kinds by their frame-pair signature: hard, fade, dip (a fade through a flat colour), push, whip-pan, wipe and iris (each with its direction where it has one) and zoom; times arrivals, and push, whip-pan, wipe and iris cuts, on their progress curves; derives `pacing` (energy from calibrated bands, arrivals per 10 s, hold floor), duration roles, preferred `transitions` and the headline entrance family; writes `capture-notes.md` with the shot list, the evidence for each value and what was defaulted. `--name` defaults to the `--out` basename. Takes the grammar of the reference, never its content (H-REF) | motion half |
| `mm style compose --brand <name\|path> --motion <name\|path> --out <path> [--name <style-name>]` | §3 | composed `style.json` |
| `mm style export-designmd --style <style.json> --out DESIGN.md` | writes a style as a `DESIGN.md`, which `mm brand capture` reads back to the same colours, faces, space and radius | `DESIGN.md` |
| `mm style export-motion --style <style.json> --out <motion.css\|motion.json>` | writes a style's eases and springs as tokens a developer can paste (§6): `.css` is custom properties (an easing per role; a duration and a sampled `linear()` easing per spring), `.json` the same data with each spring also as the Motion API's `{ type: "spring", visualDuration, bounce }` (with whether it is exact) and as its physics | `motion.css` or `motion.json` |
| `mm skill new --brand <name\|path-to-brand.json> [--motion <name\|path>] --out <dir> [--force]` | scaffolds a thin per-brand skill from `skill/templates/brand-skill/`: a `SKILL.md` that loads the engine's skill, pins the composed style, carries the brand's facts file, fonts (each family listed with the licence read from its licence file) and ground mark, records the engine version and commit in `engine.json`, lists which bans the brand lifts, and says which warnings the studio tunes (the motion half's `gate`, §3) or how to tune them. The engine stays shared and brand-free; the thin skill is private to its owner. `--brand` accepts a shipped name or a captured half's path; font `src` paths in the skill's `style/*.json` are relative to the style file's own folder, and a font `src` is looked up beside its style file first, then from the repository root | a skill folder |

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
| G-LOCAL | `G-LOCAL.mjs` | `tests/check/local.test.mjs`, `tests/cli/media-layers-local.test.mjs`, `tests/cli/new.test.mjs` | `G-LOCAL/{url,font,glyph,mark}/`; a layer pack missing a part and a footage folder missing its manifests, built by the test |
| G-BRAND | `G-BRAND.mjs` (pixels: `_pixels.mjs`) | `tests/check/brand.test.mjs` | `G-BRAND/{named,computed,family,pixel,hue,hue-ground,region,mask,overlay,canvas,stripes,checker,no-rest,vignette-black,grade-contrast,grade-saturate}/`, `G-BRAND/expressive/` (a positive: a three-stop gradient of brand roles with a glow over it), `G-BRAND/{blend-multiply,blend-screen,vignette-ink,look-faded}/` (positives: finishes made of roles, and a declared look), `G-BRAND/look-extra-grade/` (a grade over a declared look); calibration sheet `_palette/` (a positive) |
| G-PLACEHOLDER | `G-PLACEHOLDER.mjs` | `tests/check/placeholder.test.mjs` | `G-PLACEHOLDER/{text,pseudo,svg,marker,entity,no-rest,hard-end,transient}/` |
| G-LEGIBLE | `G-LEGIBLE.mjs` | `tests/check/legible.test.mjs`, `tests/check/decor.test.mjs` | `G-LEGIBLE/{size,scaled,pseudo,first-letter,shadow,canvas-text,no-rest,micro-fact,micro-cta}/`; `_base/canvas-text/` (a positive: a pattern that declares `canvasText`); the decor cases run on work copies of `G-LEGIBLE/{micro-cta,micro-fact,size}` and `_base/film` |
| G-REST | `G-REST.mjs` (with `_rest.mjs`) | `tests/check/rest.test.mjs` | `G-REST/deck/` (a deck whose rest 2 is drawn mid-entrance) |
| G-EDGE | `G-EDGE.mjs` | `tests/check/edge.test.mjs` | `G-EDGE/{box,pseudo,platform}/` |
| G-OVERLAP | `G-OVERLAP.mjs` | `tests/check/overlap.test.mjs` | `G-OVERLAP/{box,pseudo}/` |
| G-LOOP | `G-LOOP.mjs` | `tests/check/loop.test.mjs` | `G-LOOP/seam/` (and `G-LOOP/ok/` and `G-LOOP/auto/`, which pass) |
| G-END | `G-END.mjs` | `tests/check/end.test.mjs` | `G-END/` |
| G-PATTERN-REF | `G-PATTERN-REF.mjs` | `tests/check/refs.test.mjs`, `tests/kit/screen-actions.test.mjs` | `G-PATTERN-REF/`, `G-PATTERN-REF/mark/` |
| G-FACT-REF | `G-FACT-REF.mjs` | `tests/check/refs.test.mjs` | `G-FACT-REF/`, `G-FACT-REF/sample/` |
| W-PATTERN-CARD | `W-PATTERN-CARD.mjs` (calls `scripts/pattern-lint.mjs`) | `tests/check/library.test.mjs`, `tests/pattern-lint.test.mjs`, `tests/contracts/pattern-card.test.mjs` | `patterns/W-PATTERN-CARD/{missing-file,missing-section,empty-section,out-of-order,demo-unused}/`; `patterns/positive/` (a positive) |
| W-PROVENANCE | `W-PROVENANCE.mjs` (calls `scripts/pattern-lint.mjs`) | `tests/check/library.test.mjs`, `tests/pattern-lint.test.mjs` | `patterns/W-PROVENANCE/{unknown-source,pattern-credit,substring}/` |
| W-SCENE-END | `W-SCENE-END.mjs` (with `_rest.mjs`) | `tests/check/rest.test.mjs` | `W-SCENE-END/` (also warns W-HOLD: the same defect); `G-REST/deck/` (SKIP) |
| G-PEAK | `G-PEAK.mjs` (with `_loudness.mjs`) | `tests/check/sound.test.mjs`, `tests/sound/{loudness,gate,sparse}.test.mjs` | `G-PEAK/` (tracked `out/mix.wav`, a clipping mix at 0.1 dBTP; also warns W-LOUDNESS: the same mix) |
| W-LITERAL | `W-LITERAL.mjs` | `tests/check/literal.test.mjs` | `W-LITERAL/{regex,layout}/`; `patterns/W-LITERAL/entrances/` (`tests/pattern-lint.test.mjs`, `tests/cli/release-check.test.mjs`: fails the library) |
| W-LOUDNESS | `W-LOUDNESS.mjs` (with `_loudness.mjs`) | `tests/check/sound.test.mjs`, `tests/sound/{loudness,gate,sparse}.test.mjs` | `W-LOUDNESS/` (tracked `out/mix.wav`, −24 LUFS, clean) |
| W-HOOK | `W-HOOK.mjs` | `tests/check/hook.test.mjs` | `W-HOOK/{film,deck}/` |
| W-DEAD | `W-DEAD.mjs` | `tests/check/dead.test.mjs` | `W-DEAD/` |
| W-QUIET | `W-QUIET.mjs` | `tests/check/quiet.test.mjs` | `W-QUIET/{film,deck}/` |
| W-LENGTH | `W-LENGTH.mjs` | `tests/check/length.test.mjs` | `W-LENGTH/` |
| W-FADE-ONLY | `W-FADE-ONLY.mjs` | `tests/check/warnings.test.mjs` | `W-FADE-ONLY/` |
| W-READ | `W-READ.mjs` | `tests/check/warnings.test.mjs` | `W-READ/` |
| W-CUE | `W-CUE.mjs` (with `_cue.mjs`, `scripts/lib/sound-place.mjs`) | `tests/sound/{lock,place,placement}.test.mjs`, `tests/check/sound.test.mjs`, `tests/sound/{cues,gate}.test.mjs` | `W-CUE/` |
| W-DUR-LITERAL | `W-DUR-LITERAL.mjs` | `tests/check/warnings.test.mjs` | `W-DUR-LITERAL/` |
| W-BAN | `W-BAN.mjs` | `tests/check/warnings.test.mjs` | `W-BAN/` |
| W-SUB | `W-SUB.mjs` | `tests/check/warnings.test.mjs` | `W-SUB/` (run with `--sub 4`) |
| W-CONTRAST | `W-CONTRAST.mjs` | `tests/check/warnings.test.mjs` | `W-CONTRAST/{color,pseudo,gradient,faint}/` |
| W-PACE | `W-PACE.mjs` | `tests/check/warnings.test.mjs` | `W-PACE/` |
| W-HOLD | `W-HOLD.mjs` | `tests/check/warnings.test.mjs`, `tests/check/rest.test.mjs` | `W-HOLD/` |
| W-EMPTY | `W-EMPTY.mjs` | `tests/check/warnings.test.mjs` | `W-EMPTY/` |
| W-ENTRANCE | `W-ENTRANCE.mjs` | `tests/check/warnings.test.mjs` | `W-ENTRANCE/` |
| W-STAGGER | `W-STAGGER.mjs` | `tests/check/warnings.test.mjs` | `W-STAGGER/` |
| W-AMBIENT | `W-AMBIENT.mjs` | `tests/check/warnings.test.mjs` | `W-AMBIENT/` |
| W-CAPTION | `W-CAPTION.mjs` | `tests/check/warnings.test.mjs` | `W-CAPTION/` |
| W-OVERSHOOT | `W-OVERSHOOT.mjs` | `tests/check/warnings.test.mjs` | `W-OVERSHOOT/{declared,measured}/` |
| W-MIX | `W-MIX.mjs` | `tests/check/sound.test.mjs`, `tests/sound/{cues,gate,recipes}.test.mjs` | `W-MIX/` |
| W-ASK | `W-ASK.mjs` | `tests/check/warnings.test.mjs` | `W-ASK/` |
| W-FACE | `W-FACE.mjs` | `tests/check/face.browser.test.mjs` | built by the test (a scratch footage piece with a supplied matte) |
| W-GEN-BRAND | `W-GEN-BRAND.mjs` | `tests/check/gen-brand.test.mjs` | a copy of the base film with one generated picture and its record, built by the test |
| W-ANCHOR | `W-ANCHOR.mjs` | `tests/check/anchor.test.mjs` | `W-ANCHOR/` |
| W-POP | `W-POP.mjs` (with `_strips.mjs`) | `tests/check/motion.test.mjs`, `tests/check/strips.test.mjs` | `W-POP/` (with the stubs `entrances/flash`, `entrances/slide-in` in `_shared/patterns/`) |
| W-DEADSTOP | `W-DEADSTOP.mjs` (with `_strips.mjs`) | `tests/check/motion.test.mjs`, `tests/check/strips.test.mjs` | `W-DEADSTOP/` (the stitch is a variant the test writes) |
| W-FOCUS | `W-FOCUS.mjs` | `tests/check/focus.test.mjs` | `W-FOCUS/` |
| W-TOKENS | `W-TOKENS.mjs` | `tests/check/tokens.test.mjs` | `W-TOKENS/` |
| W-SEAM | `W-SEAM.mjs` | `tests/check/seam.test.mjs` | `W-SEAM/` (with the stubs `exits/slide-out`, `entrances/slide-in`) |
| W-LOOP | `W-LOOP.mjs` | `tests/check/open-loops.test.mjs` | `W-LOOP/` |
| W-SAMEBOX | `W-SAMEBOX.mjs` | `tests/check/samebox.test.mjs` | `W-SAMEBOX/` |
| W-ASSET-LICENSE | `W-ASSET-LICENSE.mjs` | `tests/check/asset-license.test.mjs`, `tests/gen/licence.test.mjs` | a copy of the base film with one imported picture and its record, built by the test |
| W-PALETTE | `W-PALETTE.mjs` (with `scripts/lib/sound-palette.mjs`) | `tests/sound/palette.test.mjs` | built by the test (the shipped palette passes under its profiles; a high-passed hiss, a cue four times too loud and a 9.5 kHz sample warn) |
| W-AUDIBLE | `W-AUDIBLE.mjs` (with `scripts/lib/sound-audible.mjs`) | `tests/sound/audible.test.mjs`, `tests/sound/mix.test.mjs` | built by the tests (a cue 60 dB under a bed, a cue on a word, a silent cue and a harsh cue are planted; the shipped demo film passes) |
| W-SAMPLE-LICENSE | `W-SAMPLE-LICENSE.mjs` (with `scripts/lib/sound-licence.mjs`) | `tests/sound/sample.test.mjs`, `tests/sound/openverse.test.mjs` | built by the test (a sample with no record, a record with no licence, a missing file; an Openverse record under a licence the piece does not offer, one whose file changed, one recording under two licences), with records written from `fixtures/sound/openverse.mjs` |
| `mm sound find`, `mm sound fetch` | `sound-find.mjs`, `sound-fetch.mjs` (with `scripts/lib/openverse.mjs`, `scripts/lib/sound-licence.mjs`) | `tests/cli/sound-find.test.mjs`, `tests/cli/sound-fetch.test.mjs`, `tests/sound/openverse.test.mjs` | rows and details written from the API's documented shape (`fixtures/sound/openverse.mjs`) and answered by an injected fetch: no request leaves the machine |
| `mm share` | `share.mjs` (with `scripts/lib/{share,path-safe,piece-schedule}.mjs`) | `tests/cli/share.test.mjs`, `tests/cli/share-lib.test.mjs`, `tests/cli/path-safe.test.mjs` | built by the tests (a film with a caption beat and a short H.264 file, a standalone deck, a planted symbolic link, a folder that is not a share folder) |
| `mm showcase` | `showcase.mjs` (with `scripts/lib/{activity,hero-page,hdr}.mjs`, `new.mjs`, `media-prep.mjs`), `patterns/layouts/stage`, `patterns/3d/tablet`, `screen/zoom-to` regions without a pointer track | `tests/cli/showcase.test.mjs`, `tests/cli/showcase-run.test.mjs`, `tests/cli/activity.test.mjs`, `tests/cli/hero-page.test.mjs`, `tests/cli/media-prep.test.mjs`, `tests/kit/screen-camera.test.mjs`, `tests/kit/tablet3d.browser.test.mjs` | built by the tests (a portrait clip with one moving box, a PQ-tagged white clip) |
| deck press model, reduced motion, deck sound and the deck player | `runtime/kit/{press,kit}.js`, `scripts/lib/deck-player.js`, `scripts/lib/{deck-sound,standalone}.mjs`, `scripts/sound.mjs`, `scripts/export.mjs` | `tests/kit/press.test.mjs`, `tests/kit/deck-reduced.browser.test.mjs`, `tests/kit/deck-player.browser.test.mjs`, `tests/sound/deck-sprite.test.mjs`, `tests/contracts/reduce-motion.test.mjs` | built by the tests (the kit-smoke deck, the golden decks, a deck with the sprite embedded, opened from `file://` with the audio calls recorded) |
| W-SOUND-SHAPE | `W-SOUND-SHAPE.mjs` (with `_shape.mjs`) | `tests/sound/shape.test.mjs` | built by the test (a good film passes; a late first sound, a flat hierarchy, a run of five ticks and a key run with even gaps warn; a cue stem built from pulses) |
| W-SOUND-ARTIFACT | `W-SOUND-ARTIFACT.mjs` (with `scripts/lib/sound-artifacts.mjs`) | `tests/sound/artifact.test.mjs` | built by the test (one defect of each kind planted in a clean sound; every shipped recipe and code cue passes; a sample with a click warns) |
| W-SAY | `W-SAY.mjs` (with `scripts/lib/say.mjs`) | `tests/check/say.test.mjs`, `tests/gen/say.test.mjs` | `W-SAY/` |
| `mm say-lint`, `mm gen voice` narration reading | `say-lint.mjs`, `gen.mjs` (with `scripts/lib/say.mjs`) | `tests/cli/say-lint.test.mjs`, `tests/gen/gen-say.test.mjs`, `tests/contracts/voice-lexicon.test.mjs` | built by the tests (a text holding each kind of risky word, markers, a lexicon, a stubbed ElevenLabs) |
| the wire: retry, idempotency key, refusal classes, `mm doctor` keys-file mode | `scripts/lib/http.mjs`, `scripts/doctor.mjs` (with `scripts/lib/gen/keys.mjs`) | `tests/gen/http.test.mjs`, `tests/cli/doctor-keys.test.mjs` | built by the tests (a fake fetch and sleep; a temporary HOME with a 0644 keys file) |
| export proofs: QA-FRAMES, QA-FPS by name, QA-BITRATE, QA-DECODE | `scripts/lib/export-qa.mjs` (with `scripts/lib/frame-rate.mjs`) | `tests/cli/export-proofs.test.mjs`, `tests/cli/frame-rate.test.mjs`, `tests/cli/export-qa.test.mjs` | built by the tests (a real export; a short file, a 29.97 and a 2997/100 file, a starved and a runaway stream, a late one) |
| transparent export, file tags, exact rates | `scripts/export.mjs` (with `scripts/lib/ffmpeg.mjs`, `scripts/lib/export-meta.mjs`) | `tests/cli/export-formats.test.mjs` | built by the test (a real alpha export, byte-identical twice; a flat WebM) |
| W-EASE | `W-EASE.mjs` | `tests/kit/ease-gate.test.mjs`, `tests/check/ease.test.mjs` | built by the test (the base film with an unknown cascade ease, a partial `steps()`, a backward `curve()`, a `linear()` that does not run 0 to 1; a film that wears eases from the families passes) |
| W-DECK-STEP | `W-DECK-STEP.mjs` | `tests/check/deck-step.test.mjs` | `W-DECK-STEP/{unreached,shared}/` (a step past the scene's presses; two beats on one slot); the other findings are built by the test |
| every rule on clean pieces | all | `tests/check/positive.test.mjs` | `_base/{film,deck}/` (positives), `_shared/patterns/` (stub patterns the negatives mount) |
| raster flags | (`scripts/lib/browser.mjs` `LAUNCH_ARGS`) | `tests/check/raster.test.mjs` | `_raster/` (a positive) |
| release-check R-BRAND · R-SECRET · R-PATH · R-URL · R-LICENSE · R-FONT-LICENSE · R-PATTERNS · R-GOLDEN · R-STRATEGY · R-HISTORY · R-DUP | `scripts/release-check.mjs` | `tests/cli/release-check.test.mjs` | `fixtures/release/{brand-word,secret,abs-path,cdn-url,no-licence,font-no-licence,bad-pattern,golden-unchecked,finder-dup,strategy-file,history}/`; `fixtures/release/clean/` (a positive) |
| capture: brand roles; motion cut kinds, energy bands, durations, headline family | `scripts/capture-brand.mjs`, `scripts/capture-motion.mjs` | `tests/capture/*.test.mjs` | `fixtures/capture/site/`, `fixtures/capture/reference/` (incl. `pieces/{tempo-a,tempo-b,kinds}`), the golden films |
| composition, headline ladder, fitted headlines, bounded entrances, units on landing, zoom-through, travel units | `runtime/kit/{kit,room,count,fit}.js`, `patterns/` | `tests/contracts/composition.test.mjs`, `tests/kit/fit-room.test.mjs`, `tests/kit/{composition,patterns-frames,count-text,travel-units,fit-room}.browser.test.mjs` | `fixtures/kit-smoke/composition/` |
| finishing looks (`finish.chroma`, `scanlines`, `bloom`, `grainRate`, `look`), `transitions/impact`, `transitions/anticipation`, `transitions/dissolve-edge` | `runtime/kit/{finish,lens,kit}.js`, `patterns/transitions/{impact,anticipation,dissolve-edge}/`, `scripts/check/G-BRAND.mjs` (the look read through `gradeOf`) | `tests/kit/{finish-fx,impact,anticipation,dissolve-edge}.test.mjs`, `tests/kit/{finish-fx,finish-cuts}.browser.test.mjs`, `tests/check/brand.test.mjs` | `tests/kit/media/finish-fx.json`, the patterns' `demo/story.json`, `fixtures/negatives/G-BRAND/{look-faded,look-extra-grade}/` |
| kit: springs, track, ease, random, schedule, roles, hook, anchors, rests, settle moves, cascade emphasis, decode warnings, the reference in `runtime/kit/README.md`, shared sound synth, fragments | `runtime/kit/` | `tests/kit/*.test.mjs` (among them `move-settle`, `cascade-emphasis`, `seek-decode-warning`, `readme`, `synth`, `fragments`) | pure-function cases; `fixtures/kit-smoke/{roles,roles-deck}/` |

Ledger note: a negative is judged on every row. A G- negative: its own id fails, and no other G- rule fails
or W- rule warns, unless that W- row is the same defect, which the test names. A W- negative: its own id
warns, nothing else fails or warns, and the exit code is 0.

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
| Is a character's idle ambient motion? | character rigs keep a mascot alive at rest with beat-locked idles and blinks; hyperframes layers bound ambient motion (W-AMBIENT) | **A character's idle is an acting layer, not ambient motion.** `entrances/character` reports progress 1 from the end of its entrance, so G-REST reads the slot finished; past that it keeps an idle locked to the beat grid (`params.bpm` or `style.sound.bpm`, from `params.offset`) and blinks, drawn inside the slot's box, which does not move: the rig's viewBox reserves headroom over the body for the liveliest idle at `idle` 1.5, a pose that would reach higher gives up lift and then stretch, and the drawing clips to the slot. W-AMBIENT bounds camera moves and text scale and does not read the idle; the pattern's `idle` param bounds it instead (0 to 1.5, default 1): the liveliest mood hops 2 u × `idle` and squashes 0.16 × `idle` at the beat, so at most 3 u and 0.24 at 1.5. A deck draws no idle and no blink, so every deck rest is still. The character carries no text and never leaves its slot, so G-EDGE, G-OVERLAP and G-LEGIBLE read the text alone; the stage yields to the text (it takes only the room a grid row or flex column leaves, and gives up more when a line still crosses the safe margin), so adding the character never pushes text past the safe area. On a scene with `moves/idle-breathe` and an excited idle, G-REST passes and W-AMBIENT warns on the camera alone, while the drawing moves inside its slot and the slot box moves only with the camera |

## 16. The studio and edit ops

The piece is the story file (§4); the studio is a lens and a pen on it. It keeps no state the story
does not hold.

**16.1 Edit ops.** An edit is a list of typed ops (`contracts/edit-ops.schema.json`), addressed to
the raw story: a scene by `id`, a beat by its index in the scene's beats (in the variant's beats when
the op's `format` names a variant that has beats). The ops are `scene.duration`,
`scene.order`, `scene.cut`, `scene.move`, `scene.say`, `beat.at`, `beat.out`, `beat.set`,
`beat.param`, `beat.add`, `beat.remove`, `story.formats` (the formats the piece ships: a non-empty
list of distinct film formats, written in the order 9x16, 1x1, 4x5, 16x9; removing a format leaves
the scenes' `variants` for it in place, so adding it back restores them), and `audio.sample` (maps a
cue to a sound file of the piece in `audio.samples`; `null` unmaps it, and the last file unmapped takes
the empty `samples` object with it; `mm sound fetch --cue` writes it). Each is checked against the story and the beat's pattern
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
*Verify after edit.* The journal's last receipt (an undo included) is the last edit. `mm check` records its id as
`journal` in `out/check.json`; `mm export` refuses (exit 1; `--force` exports anyway and stamps `UNCHECKED`) a report
whose `journal` is not the journal's head when the export starts, even when the story text came back to the checked
one, and a report that names no `journal` once the journal has edits. The skill's handover is not written while the last
edit is newer than the last check (`references/handover.md`).

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
their cuts, cues, moves, the music grid, and a gate lane. The schedule-only rules (W-DEAD, W-LENGTH,
W-QUIET, W-READ, W-PACE, W-HOLD, W-CUE, W-FADE-ONLY, W-ASK) run in the page from the same rule files
`mm check` runs (`scripts/check/timing.mjs`), on the gate's schedule, and their verdicts are those of
`mm check` for the same story.

**16.6 Parallel capture.** `mm export --workers N` draws disjoint runs of frames in N pages and
feeds one encoder in order, with at most N + 1 runs drawn ahead. Proved per release by
`tests/cli/export-workers.test.mjs`: the frame hashes, the encoded stream hashes and the MP4 bytes
of a one-page and a three-page run are equal. MP4 bytes are reproducible for the same frames, ffmpeg
build and arguments; they are not claimed across ffmpeg versions. An interrupted or failed export
leaves `out/` as it was.

**16.7 Reading the finished file back.** The gate judges the page and the frames; the MP4 that ships is
read back too (`scripts/lib/export-qa.mjs`; `mm export` runs it on what it has just written, `mm verify-export`
on any MP4). Each check is PASS, FAIL or SKIP (one that could not run says so and why, never PASS); the verdict
is `out/export-qa.json` (`files[].checks[]`: `id`, `status`, `evidence`), a failed check exits 1. The thresholds
are named constants in that module.

| Check | Fails when | Reads |
|---|---|---|
| QA-STREAM | no video stream, or none of its frames decode | ffprobe |
| QA-DURATION | the frame count is not `round(duration × fps)` of the schedule (a deck's walkthrough: its first rest held 2 s, then each press's frames and a 2 s hold) | ffprobe `-count_frames`, the schedule built as the gate builds it |
| QA-SIZE · QA-FPS | the size is not the format's (even sides); the rate is not the one asked for or is not constant | ffprobe |
| QA-AUDIO | a piece with sound (a track, or cues with a palette) has no audio stream but the placeholder, or its sound is more than 0.1 s from the picture's length | ffprobe |
| QA-SILENCE | a silence longer than 5 s under −50 dB inside a file with sound | ffmpeg `silencedetect` |
| QA-LEVEL | the encoded file's true peak is over −1 dBTP, or its integrated loudness is more than 1 LU from the style's `sound.loudnessLufs` (−14) (the MP4 is measured, not `mix.wav`) | ffmpeg `ebur128` |
| QA-BLACK | a span of 0.1 s or more is black (98 % of pixels at or under luma 0.03); SKIP when the style's canvas is itself that dark | ffmpeg `blackdetect` |
| QA-FROZEN | a span of 0.5 s or more is frozen (frames within −80 dB of each other) with 0.2 s of it, and at least a frame and a half, in the middle half of an arrival, exit, move or cut the schedule plays; a rest, a gap between motions and an ease's still ends are on purpose; a deck's walkthrough, and a file with no piece, are SKIP; and the page itself drew that motion: the export keeps a hash of every frame it drew (`out/export-frames.json`), a span the page held still is the picture on purpose, and where the page changed the read-back renders the page and decodes the file at the span's start, middle and end, so only a visible change (more than 0.05 % of pixels by more than 8 levels) the file did not keep is a fault (a pattern that holds mid-entrance, a traced outline waiting for its fill, is not) | ffmpeg `freezedetect`, the schedule's events |
| QA-SEAM | at a film's cut, a black frame; for a hard cut with nothing moving before it, a frame that repeats the one before (duplicate) or a picture that changes a frame or more early (offset); inside a transition, a frame that repeats the one before between two moving steps | the three frames before and after each cut, and the transition's run, decoded and compared (mean absolute luma difference under 0.0001 is the same picture) |
| QA-FRAMES | the frames the decoder finds are not exactly `round(duration × fps)` (a walkthrough: its holds and presses), or are not the number the container declares | ffprobe `-count_frames` (a full decode) beside the tables' `nb_frames` |
| QA-FPS (by name) | as above, but a rate is read as the fraction the stream declares and the rate its first 256 packet times keep (the 5th-percentile gap, refined by least squares): 23.976, 29.97 and 59.94 are 24000/1001, 30000/1001 and 60000/1001 and are told from 24, 30 and 60, and from the rounded 2997/100; a dropped frame (a gap of two) is not constant (`scripts/lib/frame-rate.mjs`) | ffprobe packet times |
| QA-BITRATE | the video bitrate is under 0.0005 or over 0.5 bits a pixel a frame (provisional: an encode that lost its picture, or the wrong encoder) | ffprobe `bit_rate`, else the file's size over its duration |
| QA-DECODE | frames decoded from the file (the first, the middle and the last) differ from the same frames drawn cold in a fresh page by more than a mean of 3 of 255 over R, G and B, or by more than 48 on over 1 % of the samples; SKIP for a deck's walkthrough, an export made with `--sub` above 1, and a file with no piece | ffmpeg `select=eq(n,k)`, the page |
| QA-ALPHA | (a transparent `.webm` or `.mov`, with QA-STREAM, QA-FRAMES, QA-SIZE and QA-FPS) a corner the page left clear reads alpha above 8 in the file, a pixel it drew solid (with its eight neighbours) reads under 247, or the page drew every corner opaque; SKIP when it drew nothing solid | the page (`omitBackground`), ffmpeg with the `libvpx-vp9` decoder for WebM (the native one drops the alpha plane) |

`mm export` writes a silent placeholder track and `mm sound` muxes the mix afterwards, so in the `export` phase
QA-AUDIO, QA-SILENCE and QA-LEVEL are SKIP for a piece with sound and say to run `mm verify-export` after `mm sound`;
that is the `final` phase. The seam evidence is a sheet, one row a cut and the frames −3 to +2 across it, written
beside the report as `out/export-qa-seams-<format>.png` (eight rows a file); `mm footage cut` draws the same for the
joins of its edit (source frames either side of each join), `assets/<name>/seams.png`. A rest is not a freeze: the
schedule's rests and the gaps between its motions may be as still as they like.

*Audio sync.* `tests/sound/sync.test.mjs` places a click at 1.25 s in a mix, exports and muxes the film, decodes the MP4's
audio as a player does and requires the click within 1 ms of its place in the unencoded mix. The AAC encoder's priming
samples (1024 at 48 kHz, 21 ms; an FDK encoder's 2048, 43 ms) are skipped by the MP4's edit list; without it the sound
plays late. The same test found the stage-2 limiter of `mm sound` (`alimiter`) delaying the mix by 280 samples
(5.8 ms), which the chain now drops.

*Hardware encode.* `--encoder videotoolbox` (or `auto`) asks for `h264_videotoolbox` at a constant bitrate of
0.2 bits per pixel per frame (1080 × 1920 at 30 fps: 12.4 Mbit/s). It is for drafts and animatics: the x264 encode is
the one whose bytes are reproducible (§16.6). Benchmark it, and the number of workers, on your own machine and one piece:
export the same piece several times, alternating the settings (`--workers` omitted, 4, 8, and each with `--encoder
auto`) so that thermal state and caches do not favour the last; take `captureS` and the wall time of each run from
`out/export.json`, discard the first, and compare the medians. More pages than cores only compete for the CPU, and
the encoder runs in one process whatever the workers.

