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
| lucasmarkes/hairline | MIT | The drawing maths in `runtime/kit/hairline.js` (sampled rounded rings with outward normals, the hull of two rings as a solid's silhouette, the facing run as its one crease), rewritten with a caller's projector so it follows a perspective camera; the stroke roles (one bright highlight, silhouette, dim crease, dashed guides behind opaque plates) and its long ease-out `cubic-bezier(.32, .72, 0, 1)` in the `drawn` move of `3d/phone` (`runtime/kit/drawn.js`) |
| mulberry32 | public domain | The 32-bit seeded generator inlined in `patterns/sound/*/pattern.js` |
| showcase | MIT, same author (github.com/tudorjuravlea/showcase) | The seek-then-screenshot render loop, the BT.709 colour recipe, the contact sheet, device proportions, the float and orbit looks; adapted into `scripts/lib/ffmpeg.mjs`, `scripts/lib/sheet.mjs`, `scripts/stills.mjs`, `scripts/export.mjs` and `scripts/lib/standalone.mjs`, and redrawn as generic CSS boxes in the device and camera patterns |

## Ideas we restated (no code or text taken)

| Source | Licence | What we took |
|---|---|---|
| heygen-com/hyperframes | Apache-2.0 | Determinism rules (no wall clock, seeded randomness), a lint-then-check gate, transition ids with energy and narrative-position bands, caption grouping, typography size floors; for the studio and the timeline CLI, typed edit operations with undo, writing edits back into the source, snapping, and plan-then-apply verbs with receipts |
| charlie947/motion-graphics-skills | MIT | The effect ideas behind sixteen patterns (masked and elastic type, slats, stretch pill, brackets, bar-to-line, fan stack, dock, flowing paths, lens, exploded layers, particle assembly, marker circle, date flip, paper cards, grid break) and the launch and explainer beat orders |
| robonuggets/cinematic-site-components | MIT | Ideas for about ten effects, re-derived as functions of `t`; no code taken |
| nateherkai/herk-edit-kit | MIT | Ideas only: short-form craft notes (reel structure, stills-first demo, pacing bands, word reveals, sound levels, data restraint); speaker-frame modes (hero, side, inset, bottom, hidden) with a lead-in move and a slow drift, a face-safe zone that graphics keep clear of, and a gate rule for text over the face |
| LottieFiles/motion-design-skill | MIT | Motion personalities, duration scaled by size and distance, stagger rules, layered ambient motion |
| emilkowalski/skills | MIT | Easing tokens, duration budgets, the 30-80 ms stagger band, scale entrances from 0.9-0.97, spring ranges, animation review checks |
| greensock/gsap-skills | MIT | Timeline position grammar, ease families, scroll scrub as progress |
| zarazhangrui/frontend-slides | MIT | A fixed 1920×1080 stage scaled to fit, the slide kept in the URL, one slide per printed page |
| latent-spaces/brag | MIT | A strong-beat score, a reading floor per line, a share caption, showing the product in use |
| howseen-ai/claude-motion-design | MIT | Seek-based rendering practice, closed-form springs, beat maps |
| pireel/pireel, 0xsline/OpenChatCut | AGPL-3.0 | Ideas only: a request cache for paid generation (a key of everything that decides the result, a repeat reuses it), an asset licence ledger with an allowlist and a credits list, text from outside kept in a marked block as material and never instruction, verify after edit (the check must have seen the last edit before an export), paid work that never replays by itself and takes no internal option from a recorded request |
| nateherkai/herk-edit-kit | MIT | Ideas only: six gate rules (a beat's arrival against the spoken word it names, a lone odd frame, a jump then stillness, one lit element, few type/stroke/radius values, a matched exit and entrance across a cut, open loops closed before the call to action) |
| oso95/scroll-world | MIT | Scroll progress as entry, contain and exit windows |
| pireel/pireel, 0xsline/OpenChatCut | AGPL-3.0 | Ideas only: the finished MP4 read back (a video stream, duration, size and frame rate, sound, black frames, frozen spans, long silence, the encoded file's peak and loudness), a seam evidence sheet (the frames either side of every edit boundary, checked for black, duplicated or offset frames), a hardware H.264 encode with a worker benchmark method, an audio sync proof against encoder priming, and a check for scenes that put their content in the same boxes |
| romainsimon/uisfx | code MIT, audio CC0 | A sound-cue taxonomy, the one-shot length limit and the retrigger cooldown; every cue here is synthesised and no sample is used |
| danielwh2/cuelume | MIT | Ideas only, restated in our own numbers and code: a sound as data (layers of sine partials with per-partial decay, seeded noise through a filter, a glide, an emphasis rank per layer), material that marks a family (glass bars, mallets, air and wood), a length ladder, contour that carries meaning, one shared seeded stereo room, levels matched on the loudest 100 ms, a register contract and a sound profile a style or brand chooses once (`patterns/sound/*/recipe.json`, `styles/sound/`, `runtime/kit/synth.js`), and the habit of measuring a set of sounds to get such a profile, built here as `mm sound mine` (a recording cut into sounds and summarised, every source and licence kept), `mm sound clone` (a new cue found by seeded search against a profile) and W-PALETTE, with a licence record for every sample file (`scripts/lib/sound-mine.mjs`, `scripts/lib/sound-clone.mjs`, `scripts/lib/sound-sample.mjs`). Nothing from its theme measured from another product's sounds was used |
| nateherkai/herk-edit-kit | MIT | Ideas only: a bloom ground, a graph-paper ground and a dot-grid ground in palette roles, and a shared glass surface for cards (tint, blur, hairline, highlight, shadow, one shine sweep) |
| pbakaus/impeccable | Apache-2.0 | Product facts kept apart from visual tokens; the shape of a deterministic detector CLI |
| google-labs-code/design.md | Apache-2.0 | A style file of tokens plus prose, and its lint, diff and export verbs |
| ManimCommunity/manim | MIT | The verbs Indicate, Circumscribe and Spotlight, and an explanatory verb grammar |
| Motion Canvas | MIT | Measure both boxes, then animate the difference, for `transitions/shared-element` |
| motiondivision/motion, Popmotion, react-spring, anime.js | MIT | Spring and easing maths, re-derived in `runtime/kit/springs.js`; stagger origins |
| Shifty, lottie-web, Rive runtimes | MIT | Keyframe interpolation kinds and state-machine vocabulary |
| nateherkai/herk-edit-kit | MIT | Ideas only: brand-steered generation through Kie.ai, ElevenLabs and Higgsfield (`mm gen`), with a plan before any paid call and a record per result |
| Theatre.js core | Apache-2.0 | A sequence as a function of position |
| Remotion core and `remotion-dev/skills` | Remotion License; skills unlicensed | Names and ideas only: frames as a function of time, a transition as an overlap of two scenes, the iris and clock-wipe effects; for the studio, the sequence registry as the timeline model, write-back with a snapshot undo stack, zoom anchored under the cursor, in and out marks, capture in parallel tabs re-sequenced into one encoder, a shuffled-order render-parity proof |
| imageio, PyAV, OpenCV | BSD-2, BSD-3, Apache-2.0 | Pipeline pitfalls only (size snapping, colour range, seeking) |
| feitangyuan/onetake | PolyForm Noncommercial 1.0.0 | Ideas only: an element-led flood of light between beats (`transitions/flood`) |
| pyang5166/gbro-collage-broll | MIT | Ideas: a stop-motion cadence (`frameHold` 3 and the `stop-motion` motion half) |
| pyang5166/gbro-collage-info | MIT | Ideas: photos shown as a toned print so they sit inside a brand's palette (`entrances/photo-wake`); each card turning over on its own beat (`entrances/card-flip`); many candidates collapsing to one with a result card under it (`layouts/shortlist`); a static paper fibre that never shimmers (`finish.paper`) |
| pireel/pireel, 0xsline/OpenChatCut | AGPL-3.0 | Ideas only: finishing looks as pure functions of time (a lens fringe, a line screen, bloom, a grain rate, film-like tone looks written from the palette roles) and three transitions (an impact cut with a shake, a zoom punch and a fringe at the cut; an anticipation wind-up before the push; a noise-field dissolve with a glowing edge) |
| feitangyuan/motion-web | CC BY-NC 4.0 | Ideas only: readable type lifted to full strength in reading order, with our own reading cursor and colour floor (`text/lit-sweep`); cards that arrive with no entrance on an irregular beat, stacked in arrival order under an opaque panel (`layouts/pile-up`); a stack in which the next screen rides up over a still one, optionally dimmed (`transitions/cover`) |
| feitangyuan/doodle-anim | MIT | Ideas: a pen that drifts along its length, a thinner and fainter ghost pass, a run-on past an open stroke's ends, three pen voices, a layered wash and a clipped hatch in brand colours (`runtime/kit/rough.js`, `entrances/sketch`); a colour bloom behind a sketch's ink (`emphasis/wash-bloom`); drawn reaction marks (`emphasis/emote`); a shake channel on the shot camera (`moves/shake`) |
| JohnHeibel/ClaudeAnimationBase | MIT | Ideas restated in `runtime/kit/rig.js`, `entrances/character` and `emphasis/act`: a character built from a unit and a ground point, one transform stack about the feet, drawn key views with a face frame that shifts and narrows toward the heading, limbs with a layer, a hop with anticipation and a landing squash, a blink phase-shifted per character, idles locked to the beat, an acted mood change (squint, swap, take, settle) with a take sized per mood. Some numbers are the source's own, adapted under its MIT licence: the act's eye-closing and eye-opening times (0.1 s, 0.14 s) and pose blend (0.4 s), the take sizes of surprised, sleepy and sad (1.3, 0.2, 0.3) and the excited idle's squash (0.16). Our own code, the other timings and an exact area-keeping squash; no code or drawings taken. The band wipe of `transitions/brush-wipe`, adapted and re-implemented in our own code: staggered tilted bands whose cut happens under full cover, five by default, the cover and uncover halves split at the middle with each band's delay taken out of its own half, ragged ends from an integer hash, waved edges and alternating fills. An iris aimed at an element (`transitions/iris` `target`) |
| JohnHeibel/PDoomVideo | no licence file | Ideas only: an impact shake that dies to stillness, and a still rest after it (`moves/shake`) |
| lemomo-ai/lemo-opuscar | MIT | Ideas for looks a brand can wear: spot colour, print plates off register and grid motion (the looks `spot-mono`, `print-plates` with `finish.misregister`, and `blueprint` with the `grid` motion half), with the source's numbers adapted under its MIT licence: the easing `cubic-bezier(0.7, 0, 0.2, 1)`, a register of 2 to 4 px at 1080 and stepping every 2/30 s. One continuous inked line through a drawing (`entrances/one-line`); dimension lines (`emphasis/dimension`) and label columns with leaders (`layouts/label-column`); a title split on a diagonal (`entrances/diagonal-join`); a deletion drawn as a rule and a fold (`exits/knife-cut`); a soft light front with a glint (`entrances/light-reveal`); re-inking a poster through a ragged, linear, tilted pull (`transitions/re-ink`). Timings and proportions restated in our code: the rubber stamp's slam, press, flash and jolt (`emphasis/stamp`), and the unit stack's cascade (0.85 exponent, 0.42 s fall, quintic set-down) (`data/unit-stack`). No code taken |
| lemomo-ai/lemo-wake | CC BY-NC 4.0 | Ideas only: one picture split into a plate and layers, with a recompose check and a colour-key unmix (`mm media layers`); depth parallax inside a still picture, seen through a lens (`moves/depth-parallax`); a photo waking from brand colours behind a decorated front on a noise-warped, equalised arrival field (`entrances/photo-wake`). The dolly model, the lens, the band masks, the depth fill and the line-continuing hole and part completion, the ΔE check and every constant are our own |
| robinebers/attentionmachine-skills | PolyForm Internal Use 1.0.0 | Ideas only: a room level and a speech level measured from the take with a quiet threshold at 40 % of the gap, lead and tail quiet kept around removed pauses, an edit list of source ranges, short click-free joins and one static loudness gain (`mm footage cut`); a speaker full frame under text that changes only on cuts (`layouts/talking-full`); punch-ins on alternate clips about the eye line (`moves/punch`); phrase captions shown at or before their first spoken word (`text/caption-karaoke`); a short-form motion personality, quick entrances and hard cuts over still rests (the `proof` motion half, whose values are our kinetic and calm halves'). No code, text, sounds or style values taken |
| Type Garden | no licence | Ideas only, no code taken: plants growing from letterforms, weaving behind and in front of the type, and a garden withering in reverse order (`text/garden`, `exits/wither`). Our own models: the growth model (Bézier-chain stems and their growth forms, offshoots, spiral curls, the stem/leaf/bloom part grammar and its presets, the botanical blooms, leaves, loose petals and bed composition), the anchor finder, the weave by distance field and every drawing |
| Revelium Milkmaid | no licence | Ideas only: a picture rebuilt as points in depth and revealed by a growing sphere; a seed that bursts into a swirling, tinted cloud of streaks before the points condense; a living rest (restated as closed forms of `t` in `3d/point-cloud` and `runtime/kit/points.js`; the pillow inflation, the colour key, the swirl flow, the flight, the twinkle and every number are our own) |
| nateherkai/herk-edit-kit | MIT | Ideas only: gauges and small data cards (`data/gauge`, `data/unit-grid`, `data/waterfall`, `data/bubble`, `data/versus`, `data/delta`), object cards (`layouts/object-card`) and a hanging swing (`entrances/swing`); lower-third mechanisms, off-device annotation marks, a post card with counters and a keyword call-to-action chip (`text/lower-third`, `exits/lower-third`, `text/annotate`, `layouts/social-card`, `emphasis/keyword-cta`) |
| prompt-motion.com | no licence | Ideas only: a shape that floods the frame from an element and contracts into the next scene's element, with its timing advice (`transitions/flood`); a highlight that sweeps a row of options and slows onto the answer (`emphasis/roulette`) |
| nateherkai/herk-edit-kit | MIT | Ideas only: light openers (a beam, curtains, a portal, an anamorphic streak: `transitions/beam`); a CRT power-on with held flicker and a colour split (`entrances/power-on`); crossing out the myths and revealing the survivor (`text/cross-out`); a verdict stamped on one of two names after a held beat (`text/verdict`); an urgency clock with scrolling stripes (`emphasis/countdown-clock`); a talking-head cut review (a retake, false-start and stutter finder, a propose-approve-apply cuts file, a cut audit page, a speaker-relative gap audit, a transcript sanity check and a round-trip check of the words at each cut); structure diagrams and timelines (an org chart with a stem, a rail and branches, a tree, a mind map, a cycle ring, a Venn, a pyramid, a 2x2 matrix, a roadmap, milestones, a gantt and a stepper), restated as `data/org-chart`, `cycle`, `venn`, `pyramid`, `matrix` and `timeline` over `runtime/kit/diagram.js` |
| pireel, OpenChatCut | AGPL-3.0 | Ideas only, no code read or taken: dead air judged by the sound as well as the words (a stretch with no word is cut only where energy and spectral flatness say it is not speech, a clip classed no-audio, silent, noise or speech: `mm footage review --audio`); a cut plan scored against gold fixtures with spans to cut, may cut and keep (`scripts/footage-eval.mjs`); caption line breaks chosen by a score of sentence ends, punctuation, pauses and phrase boundaries, width in character units (`text/caption-karaoke`, `runtime/kit/captions.js`); scene cuts from a colour-difference spike with a minimum scene, and a cut that keeps clear of them (`mm footage scenes`, `--scenes`) |

## On-device frameworks

`mm footage matte` calls the macOS Vision framework (`VNGeneratePersonSegmentationRequest`) on the user's own
Mac through `scripts/lib/segment.swift`, compiled on first use; nothing of the framework is redistributed.

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
