# Archetypes

Read when: a brief names a kind of film or a familiar UI moment and you want a tested beat order
to start from. Each recipe is a structure restated in our own words, built from patterns that exist
(`references/patterns-cheatsheet.md`). Change any beat that does not serve the brief.

## How to use these

Pick the archetype nearest the brief at gate 2 and change it: a treatment is three directions, so
two of them should depart from the table. Times are for a 9x16 film at the calm motion style; the
gate's reading-time arithmetic (W-READ) decides the final seconds. Only the device showcase is
built around a device: everywhere else a device appears only if the viewer must see the product in
use (SKILL.md ground rule 9).

## Launch (30 to 40 s): a thing exists now

| # | Scene · layout | s | On screen | Arrives as |
|---|---|---|---|---|
| 1 | hook · `layouts/statement` | 0–3 | the change in five words or fewer | `style:headline` 0, instant |
| 2 | name · `layouts/statement` | 3–7 | the product's name | `3d/particles-to-shape` or `entrances/assemble` |
| 3 | why · `layouts/grid-break` | 7–12 | the sameness it ends, and the odd one out | tiles `entrances/pop`; `odd` `entrances/punch` |
| 4 | proof · `layouts/stat-hero` | 12–17 | one sourced number | `style:figure`; emphasis `emphasis/brackets` |
| 5 | how · `layouts/fan-stack` | 17–23 | three things it does, newest in front | cards `entrances/pop` |
| 6 | when · `layouts/title-stack` | 23–28 | the date | `text/date-flip` (`from`: the old date, if it moved) |
| 7 | end · `layouts/endcard` | 28–32 | the call to action and the link | `style:headline`, `style:body` |

## Explainer (40 to 60 s): how something works

| # | Scene · layout | s | On screen | Arrives as |
|---|---|---|---|---|
| 1 | question · `layouts/statement` | 0–4 | the question, finished at frame 0 | `style:headline` 0, instant |
| 2 | the parts · `layouts/paper-cards` | 4–11 | up to three parts, one line each | cards `entrances/drop` |
| 3 | the flow · `layouts/title-stack` | 11–18 | input → steps → outcome | `data/flow` |
| 4 | the key part · `layouts/list-reveal` | 18–24 | the steps; the one that matters | items `style:body`; emphasis `emphasis/lens` |
| 5 | the number · `layouts/title-stack` | 24–31 | amounts, then the trend | `data/bar-to-line` (a sourced fact) |
| 6 | the stack · `layouts/bento-3` | 31–37 | what it is built from | scene move `moves/explode-layers` |
| 7 | the answer · `layouts/statement` | 37–42 | the answer to scene 1 | `text/masked-fill`; emphasis `emphasis/marker-circle` |
| 8 | end · `layouts/endcard` | 42–45 | where to learn more | `style:headline`, `style:body` |

## Newsletter promo (20 to 30 s): subscribe

| # | Scene · layout | s | On screen | Arrives as |
|---|---|---|---|---|
| 1 | hook · `layouts/statement` | 0–3 | the reader's problem | `style:headline` 0, instant |
| 2 | issue · `layouts/fan-stack` | 3–9 | three recent headlines | cards `entrances/pop` |
| 3 | cadence · `layouts/title-stack` | 9–14 | how often, how long | `text/elastic` (a width axis) or `style:headline` |
| 4 | choice · `layouts/statement` | 14–18 | the plan or the day | emphasis `emphasis/stretch-pill` |
| 5 | end · `layouts/endcard` | 18–22 | subscribe and the link | `style:headline`, `style:body` |

## Milestone (20 to 30 s): a number worth celebrating

| # | Scene · layout | s | On screen | Arrives as |
|---|---|---|---|---|
| 1 | hook · `layouts/stat-hero` | 0–4 | the number, finished at frame 0 | `style:figure` 0, instant |
| 2 | the climb · `layouts/title-stack` | 4–10 | how it grew | `data/bar-to-line` |
| 3 | who · `layouts/quote` | 10–16 | one line from a person (consent, H-FACES) | `style:headline` |
| 4 | thanks · `layouts/statement` | 16–20 | the thanks | `text/masked-fill` |
| 5 | end · `layouts/endcard` | 20–23 | what comes next | `style:headline`, `style:body` |

## Device showcase (30 to 45 s): the product in use

The one archetype built around a device, for an app or a site the viewer must see working.
Find its 2 to 3 beats of use first: entry, the key action, the result. Those are scenes 2 to 4. A
diagram of the product's purpose does not show the product working; a stat or hero frame may
wrap the flow in at most one scene and never takes its place.

| # | Scene · layout | s | On screen | Arrives as |
|---|---|---|---|---|
| 1 | hook · `layouts/statement` | 0–3 | what the product lets you do | `style:headline` 0, instant |
| 2 | the app · `layouts/caption-bar` | 3–9 | the phone plays the recording | `devices/phone` with `asset` (a prepared recording) |
| 3 | the moment · `layouts/caption-bar` | 9–14 | the key moment opens in the island | `screen/island` on the phone's screen |
| 4 | a path · `layouts/caption-bar` | 14–21 | scroll, then a tap, with one callout | `screen/scroll`, `screen/tap`, `screen/callout` |
| 5 | the site · `layouts/desktop` | 21–27 | the website on the desktop stage | `desk` with a captured page |
| 6 | the turn · `layouts/caption-bar` | 27–32 | the phone turns to face the viewer | `3d/phone` (`move: hero`, or `showcase` for a half-turn from its back); for a desktop product `3d/laptop` |
| 7 | end · `layouts/endcard` | 32–36 | the call to action | `style:headline`, `style:body` |

In 9x16 the phone shows the site rather than the laptop: give scene 5 a `variants` entry for
`9x16`.

## Product demo, stills first (25 to 40 s): the product, without a recording

Read this before you ask for a screen recording. A live recording wanders: the cursor hunts, a
spinner turns, a pause sits in the middle of the key action, and the viewer reads a screen while
the voice has moved on. A still is exactly the state you chose. Take one still per beat of use
(`mm capture site`, or a screenshot saved to `assets/`), and move the camera and the callouts instead
of the interface. Use a recording only when the motion is the point (a drag, a loading state that
resolves, a gesture).

| Step | What the viewer sees | Pattern |
|---|---|---|
| 1. A still arrives, tilted in | the whole screen enters leaning in from one side; the next still leans in from the other side, so the eye is never on the same edge twice | `devices/phone` or `devices/browser` with `asset` (`tilt` sets the lean, 0 to 45 degrees, one direction); `3d/phone` or `3d/laptop` for a real turn. `GAP: a full-bleed still that tilts in from alternating sides (closest: devices/phone tilt, layouts/media bleed)`; until then alternate a phone still and a browser still, or the 3D device's `move` |
| 2. A slow drift | the still is never dead; it moves 3 to 6 % over the shot | `moves/ken-burns` or `moves/push-in` with `moveParams: { "target": "media", "to": 1.05 }` (the picture moves inside the screen, the device stays); `moves/hero-drift` for the whole device |
| 3. Callouts pinned to the still | a leader line and a short label on the thing being named; they are tied to a mark on the still, not to the frame | `screen/callout` (`at` a mark from `mm capture site --mark`, or a point; `side` where the label sits) |
| 4. One push to a region | a single move into the part that matters, once per still | `screen/zoom-to` (`at`, `s` about 1.6) |

Rules:
- **Never crop the UI.** A device picture is covered to the screen edge to edge, so a still of
  another shape loses its edges (the device cards say so). Make the still the shape of the screen:
  a phone-shaped capture for a phone, a capture in the laptop's or browser's own proportions (the
  device card gives them), one asset per format through a `variants` entry. A cut-off menu or a clipped button reads as a mistake. The
  push in step 4 is the only time part of the screen leaves the frame.
- **One still, one idea, one push.** Two pushes on one still reads as searching.
- **Alternate sides** where the pattern lets you. A lean in one direction every time reads as a
  loop; the drift direction at least does not repeat on two stills in a row.
- Four to five stills in 30 s. Each holds long enough to read its callout (0.3 s a word, W-READ),
  and the push comes after the callout has been read, not with it.

## Reel (25 to 35 s): a list, spoken to camera

A speaker, then three to five items, each shown the same way. It is built to be watched in a feed
with the sound off, so every spoken claim is also on screen. Shots are short (1.1 to 1.4 s, none over
about 2.8 s; `references/pacing.md`, "Short-form bands"), so each shot carries two or three words at
most (W-READ). A shot is a beat inside a scene, not a scene of its own.

| # | Scene · layout | s | On screen | Arrives as |
|---|---|---|---|---|
| 1 | hook · `layouts/talking-full` | 0–3 | one line that names the subject, finished at frame 0 | `style:headline` 0, instant |
| 2 | proof · `layouts/talking-full` | 3–6 | one credibility line: what the speaker has done, as a sourced fact | `style:body`; a number with `fact` |
| 3 | the list · `layouts/list-reveal` | 6–10 | every item's name, soft, before any is explained: an open loop | items `entrances/blur-fade` (see the gap below) |
| 4 to 6 | item · `layouts/paper-cards` and `layouts/media` | 4 each | see "Per item" | see "Per item" |
| 7 | callback · `layouts/statement` | 22–25 | the hook's own words again, now answered | `style:headline`; emphasis `emphasis/marker-circle` |
| 8 | end · `layouts/endcard` | 25–32 | the resource first (page, file or app on screen), then the ask and the link | `devices/browser` with `asset`, then `style:headline`, `style:body` |

Per item (four shots, about 4 s): the item's number and name on a card (`entrances/pop`); the
definition in one line of eight words or fewer (`style:body`); a literal picture of the thing
(`layouts/media`, a real screenshot or a drawn object, not a metaphor); then back to the speaker with a
punch-in (`moves/punch` on the footage, or `moves/push-in`). The speaker is never off screen for more
than 3.5 s: if the card, the definition and the picture would take longer, cut back to the speaker
between them.

`GAP: a list that rests soft and sharpens one item at a time as the speaker reaches it (closest:
entrances/blur-fade, moves/rack-focus)`. Until it exists, show the list blurred in scene 3 and
re-show each item sharp on its own card in its scene.

**Close the loop.** Scene 7 must answer scene 1 in the same words. If the hook promised a result,
scene 7 shows it. A callback to a hook the piece did not keep is worse than none.

**Draft three openings, keep the truthful one.** Before scene 1 is fixed, write three different first
lines for the same subject, for example: a question ("Why do your posts stop at 200 views?"), a
result ("I got 40,000 views from one change"), a count ("Three edits that fix flat posts"). Strike any
line that the facts cannot back; a hook that promises more than the piece pays out is the one that
gets scrolled past on the second watch. Of those left, take the one that names the subject soonest.
Log all three and the choice (`references/direction-log.md`).

## Recipe: search → results (one scene, about 4 s)

The moment a query becomes answers. No device is needed: the layout is the search.

| t (s) | Slot | Pattern | On screen |
|---|---|---|---|
| 0.2 | `headline` | `entrances/typewriter` | the query, typed ("plan the week") |
| 1.4 | `item-1` | `entrances/rise` | the first result |
| 1.55 | `item-2` | `entrances/rise` | the second result |
| 1.7 | `item-3` | `entrances/rise` | the third result |
| 2.3 | `item-1` | emphasis `emphasis/lens` or `emphasis/stretch-pill` | the answer stands out |

Layout: `layouts/list-reveal`. Keep the query to four words or fewer so the typing lands before
1.4 s; the results stagger by the style's own stagger unless you set `at` yourself.
Source: the "search to results" effect of charlie947/motion-graphics-skills (MIT), restated.
