# Provenance

Motion Machine is original work. Some of its rules, numbers and pattern ideas started from the open-source
projects below. Everything here is written in our own words and code, except the third-party code and fonts
listed in `NOTICE`, which keep their licences. A pattern's `PATTERN.md` names its source in its Provenance
section, and that name matches a row below. Projects whose licence does not allow reuse, or that have none,
contributed no code and no text. The production workflow of SPEC §11 and the skill is written from this
project's own file formats, commands and tests.

## Code from other projects

| Source | Licence | What is in this repository |
|---|---|---|
| three.js | MIT | Vendored at `runtime/vendor/three/0.170.0/` for the 3D stage (core module, `RoundedBoxGeometry`, `RoomEnvironment`); only the `three` import of the two addons is rewritten to a relative path |
| danielwh2/drawably | MIT | The hand-drawn stroke in `runtime/kit/rough.js` (dense samples, seeded jitter, midpoint curves, a wilder second pass, boil frames), re-implemented in our own code; the hand-off idea behind `transitions/sketch-to-ink` |
| mulberry32 | public domain | The 32-bit seeded generator inlined in `patterns/sound/*/pattern.js` |
| showcase | MIT, same author (github.com/tudorjuravlea/showcase) | The seek-then-screenshot render loop, the BT.709 colour recipe, the contact sheet, device proportions, the float and orbit looks; adapted into `scripts/lib/ffmpeg.mjs`, `scripts/lib/sheet.mjs`, `scripts/stills.mjs`, `scripts/export.mjs` and `scripts/lib/standalone.mjs`, and redrawn as generic CSS boxes in the device and camera patterns |

## Ideas we restated (no code or text taken)

| Source | Licence | What we took |
|---|---|---|
| heygen-com/hyperframes | Apache-2.0 | Determinism rules (no wall clock, seeded randomness), a lint-then-check gate, transition ids with energy and narrative-position bands, caption grouping, typography size floors; for the studio and the timeline CLI, typed edit operations with undo, writing edits back into the source, snapping, and plan-then-apply verbs with receipts |
| charlie947/motion-graphics-skills | MIT | The effect ideas behind sixteen patterns (masked and elastic type, slats, stretch pill, brackets, bar-to-line, fan stack, dock, flowing paths, lens, exploded layers, particle assembly, marker circle, date flip, paper cards, grid break) and the launch and explainer beat orders |
| robonuggets/cinematic-site-components | MIT | Ideas for about ten effects, re-derived as functions of `t`; no code taken |
| LottieFiles/motion-design-skill | MIT | Motion personalities, duration scaled by size and distance, stagger rules, layered ambient motion |
| emilkowalski/skills | MIT | Easing tokens, duration budgets, the 30-80 ms stagger band, scale entrances from 0.9-0.97, spring ranges, animation review checks |
| greensock/gsap-skills | MIT | Timeline position grammar, ease families, scroll scrub as progress |
| zarazhangrui/frontend-slides | MIT | A fixed 1920×1080 stage scaled to fit, the slide kept in the URL, one slide per printed page |
| latent-spaces/brag | MIT | A strong-beat score, a reading floor per line, a share caption, showing the product in use |
| howseen-ai/claude-motion-design | MIT | Seek-based rendering practice, closed-form springs, beat maps |
| oso95/scroll-world | MIT | Scroll progress as entry, contain and exit windows |
| romainsimon/uisfx | code MIT, audio CC0 | A sound-cue taxonomy, the one-shot length limit and the retrigger cooldown; every cue here is synthesised and no sample is used |
| pbakaus/impeccable | Apache-2.0 | Product facts kept apart from visual tokens; the shape of a deterministic detector CLI |
| google-labs-code/design.md | Apache-2.0 | A style file of tokens plus prose, and its lint, diff and export verbs |
| ManimCommunity/manim | MIT | The verbs Indicate, Circumscribe and Spotlight, and an explanatory verb grammar |
| Motion Canvas | MIT | Measure both boxes, then animate the difference, for `transitions/shared-element` |
| motiondivision/motion, Popmotion, react-spring, anime.js | MIT | Spring and easing maths, re-derived in `runtime/kit/springs.js`; stagger origins |
| Shifty, lottie-web, Rive runtimes | MIT | Keyframe interpolation kinds and state-machine vocabulary |
| Theatre.js core | Apache-2.0 | A sequence as a function of position |
| Remotion core and `remotion-dev/skills` | Remotion License; skills unlicensed | Names and ideas only: frames as a function of time, a transition as an overlap of two scenes, the iris and clock-wipe effects; for the studio, the sequence registry as the timeline model, write-back with a snapshot undo stack, zoom anchored under the cursor, in and out marks, capture in parallel tabs re-sequenced into one encoder, a shuffled-order render-parity proof |
| imageio, PyAV, OpenCV | BSD-2, BSD-3, Apache-2.0 | Pipeline pitfalls only (size snapping, colour range, seeking) |

## Fonts

`styles/fonts/` ships Archivo, Fraunces, Manrope and IBM Plex Mono as web fonts under the SIL Open Font
License 1.1, each family with its `LICENSE.txt`; pieces carry copies of the same files. The `.woff2` files
are latin and latin-ext subsets named in the fontsource convention, that is, subsets of the full fonts and
so modified versions. IBM Plex Mono carries the Reserved Font Name "Plex": its
`LICENSE.txt` is the upstream text from `IBM/plex` (`packages/plex-mono/LICENSE.txt`, copyright line
"Copyright © 2017 IBM Corp. with Reserved Font Name "Plex""). The upstream package version of each subset was
not recorded; the SHA-256 of each shipped file is:

| File | SHA-256 |
|---|---|
| `archivo/archivo-latin-700-normal.woff2` | `abada6cd4c92a9a706f6d7ed3189f322ff43dd78b9402c7d1137465b861d2a04` |
| `archivo/archivo-latin-800-normal.woff2` | `c26cda2400b374eb1adb6e0973c86f455e2df17ca57c6755eb37d7bde47663fb` |
| `archivo/archivo-latin-ext-700-normal.woff2` | `8affe3b4758ec03c7c1a8b40c119209cbb1815fd836160570f94935ce9a683ec` |
| `archivo/archivo-latin-ext-800-normal.woff2` | `5aca026bdcb2d06623bcab485c8ed44ecaee07aa39c9b6fdbf855925a1e821b4` |
| `fraunces/fraunces-latin-300-normal.woff2` | `eb7978600911337e093a9b339e355a5493c4a2a6609af2839e8298c0b5444174` |
| `fraunces/fraunces-latin-700-normal.woff2` | `c38570d224b830056e69484bb9e768e1d3fa7ba4755c8891a3c6d366194d2ff3` |
| `fraunces/fraunces-latin-ext-300-normal.woff2` | `12296b4361a32b0932e11e0c64d47d01688fe67df532a9664572559f4e4a9678` |
| `fraunces/fraunces-latin-ext-700-normal.woff2` | `162b7b2654ef849ce146e1297bdd5694b971f730cd5f1749a954f24109ca11c4` |
| `ibm-plex-mono/ibm-plex-mono-latin-400-normal.woff2` | `08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7` |
| `ibm-plex-mono/ibm-plex-mono-latin-ext-400-normal.woff2` | `6bc0f226a5b7884a8170e3f62c63d7675609d4631bdc5931b5cdab81821f00eb` |
| `manrope/manrope-latin-400-normal.woff2` | `849290ef12a2eeb9af5c11924120d11aa4ae8b435ed3347d7fc8bc240c293ca3` |
| `manrope/manrope-latin-600-normal.woff2` | `f7ac6258da20ab7541939b59851155753d1d24f1b30cbcb949077a3faa3d1593` |
| `manrope/manrope-latin-700-normal.woff2` | `d2a12c85a831e4b5db341767d0347fa3d1361d22a1fcb3e361a16b6c90080f71` |
| `manrope/manrope-latin-ext-400-normal.woff2` | `72c5354a6f814f3bd38dc3d8caee774f7557b301e69d8428e677b7b73d58d9ee` |
| `manrope/manrope-latin-ext-600-normal.woff2` | `ff679412842fc3b5ce2dfad626db5261a4e663dcfd1bf1209bdfc61c2b2f37e6` |
| `manrope/manrope-latin-ext-700-normal.woff2` | `dc7c46d7eb269cc90650d7f70cf49aafa39a98444e6882cc84096acbc156bfcd` |
