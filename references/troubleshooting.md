# Troubleshooting

Symptoms seen in code-rendered film, their usual cause, and the fix. Where only the symptom is familiar, the cause and fix follow from the determinism rules. Credits for borrowed ideas are in `PROVENANCE.md`.

## Failure table

| symptom | cause | fix |
|---|---|---|
| the same frame looks different depending on which frames were drawn before it | state carried between frames: a counter, an accumulated value, a cached style | draw every frame from time alone and reset before each draw; G-DETERMINISM compares two loads |
| an entrance wipes out an element's own transform | the entrance sets the whole `transform` string inline | set translate, scale and rotate as separate properties so `transform` stays free for the pattern |
| an element with its own tilt jumps or straightens during its entrance | the entrance and the tilt both claim rotation | give the tilt its own wrapper or property and let the entrance animate the other |
| a headline is sized for the wrong font | text was fitted before the fonts finished loading | wait for fonts, then fit; a render must not start with fonts unloaded |
| text renders in a fallback face | the font file is missing or was not awaited | bundle the font locally and hold capture until it is ready (G-LOCAL) |
| a rotated box pokes past the margin | once turned, the box takes more room than its upright size suggests | measure the rotated bounds at rest (G-EDGE); mark deliberate bleed with `data-bleed` |
| content sits low like a poster | the layout pooled at the bottom | centre under the header row, slightly above the middle (H-FILL) |
| frames take seconds each | large blurs and heavy filters | shrink the radii, use cheaper blurs, stay inside the frame-time budget |
| an element looks soft after a move | a bitmap was scaled beyond its size | author at the final size or supply art at twice size; scale vectors, not bitmaps |
| emoji appear as boxes or change between machines | the emoji font is not bundled | avoid emoji; draw icons as vector shapes |

- The kit also refuses a render when a picture is missing, when any network request occurs, or when a frame's draw time exceeds its budget
- Overlaps are warnings, silenced per element when deliberate (`data-over`)

## Five pipeline pitfalls

- Colour range and matrix: default RGB-to-YUV conversion uses the older matrix and leaves range untagged, so reds shift; convert with an explicit bt709 matrix and tv range and tag all four colour fields. JPEG pipes arrive full-range
- Odd dimensions: the common H.264 profile needs even width and height; use even sizes or round down to even, and beware tools that snap sizes to 16
- Font loading: a screenshot can be taken before web fonts resolve; wait for the document's font set to be ready and pin fonts locally
- PNG alpha: piped PNG frames carry alpha and the encoder has none, so unflattened transparency silently becomes black; composite on the intended background first, and handle premultiplied alpha when blending
- Audio drift: mixed 44.1 and 48 kHz sources, the loudness filter's internal upsample and untrimmed tracks all lengthen audio; fix 48 kHz, delay each cue, pad or trim to the exact picture length and compare stream durations with a probe

## Determinism lessons

- The frame number is the only clock. Tabs share nothing, so any timer, CSS animation or date-based value flickers
- Prefer random access to replay. A frame that can be drawn alone allows parallel tabs and resumable renders; replaying a scene to seek backwards is slow and fragile
- Resolve start values and randomness up front. Lazy capture of start values makes seek order matter; seed every random source
- Gate capture on readiness. A handshake with a timeout covers fonts, images and data before the first frame is taken
- Closed-form maths and measured durations. Integrators drift with step size; closed forms do not, and a measured settle time lets layout depend on the spring
- Hidden history is the enemy: smoothing that remembers the last frame, input-driven state and composition modes all break random access; use closed forms or bake
- Layout-derived time breaks headless renders: fix geometry at author time and express scroll-style progress as named windows (entry, contain, exit) with linear easing across the window

## Capture gotchas

- Invalidate any frame cache whenever a scene is edited
- A virtual-time budget does not drive animation callbacks; seek instead
- Images loaded from a file URL taint the canvas; load everything from the piece folder through the server
- Preload every frame's assets before capture begins
- When a frame fails, extract the take's last frame separately: the closing frame is the one that breaks most often
