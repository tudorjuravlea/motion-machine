# 3d/phone

## Purpose
A phone in real 3D rises into frame and turns, its screen playing a recording or showing a captured page, with every screen action carried over. It has the built-in phone's slab, metal rim, glass, keys and cutouts, a glossy screen that catches the light as it turns, and a camera on the back.

## Use when / Do not use when
**Use when**
- a hero moment for an app: the phone turns from edge-on to face the viewer
- a slow turntable while the screen scrolls or plays
- a showcase: the phone shows its back, then makes a slow half-turn to face the viewer
- a product shown from idea to real (`drawn`): the phone and its page are drawn in thin lines, then become the real phone

**Do not use when**
- the screen must stay perfectly flat and sharp for reading (use `devices/phone`)
- the scene is text-led; the 3D phone is the scene's picture

## Params
| name | type | default | meaning |
|---|---|---|---|
| `move` | enum(hero|turntable|still|showcase|cross|drawn) | `hero` | `hero` turns from edge-on to facing over the entrance, then sways slowly; `turntable` turns about 20° a second; `still` holds a slight angle; `showcase` starts with the back to the viewer and turns half a turn to face it over 3.2 s, then holds still; `cross` faces the viewer at `from`, then travels to `to` making one full turn, its back to the viewer half-way. `drawn` draws the phone lying in the hairline view (from 30° up, turned 45°, nearly orthographic): the body, its keys and its crease, the glass lifted off it on dashed guides with the island, the status bar and the page's wire (`mm capture site` records it) spreading out from the island; the glass settles (0.7 s ease-out), a band with one bright edge sweeps along the phone and turns the lines into the real phone, then it stands up into the hero's camera as the field widens, about 6.5 s after it arrives; give screen actions after that. In a deck every rest faces the viewer (a `cross` rests at `to`) |
| `from` | number | -0.28 | `cross`: where the phone starts, as a fraction of its slot's width from the centre (negative is left) |
| `to` | number | 0.28 | `cross`: where it ends, the same way |
| `crossAt` | number | 2 | `cross`: seconds after the phone arrives that the cross begins |
| `crossFor` | number | 2.4 | `cross`: seconds the cross takes; the back faces the viewer at its middle, so a `screen/swap` with `how: cut` at `crossAt + crossFor / 2` changes the screen unseen |
| `metal` | enum(aluminium|titanium) | `aluminium` | the frame: satin aluminium in a neutral, faintly cool grey; or titanium, darker and faintly warm with a finer brushed sheen |
| `status` | enum(auto|true|false) | `auto` | the top bar drawn into the screen: `auto` shows it on a bare screen and a captured page (the page starts below it, as on a real screen) and leaves it to a recording or a still, which carry their own; its text goes dark or light with the content underneath |
| `statusTime` | string | `10:00` | the time in the top bar |
| `model` | enum(island|punch|plain) | `island` | the front cutout and the back camera, as devices/phone draws them: a floating island with its lens, five keys and a camera plateau across the top of the back; a punch-hole camera, two keys on the right and a visor across the back; or no cutout and a small camera block |
| `aa` | enum(auto|ssaa4|ssaa16|msaa|off) | `auto` | edge anti-aliasing. `ssaa4` and `ssaa16` render the frame 4 or 16 times, each shifted by sixteenths of a pixel, and average them: exact and the same on every machine (about 2.5 and 9 times the cost of `msaa` in software). `msaa` is the graphics card's multisampling, `off` leaves edges stepped. `auto` is `ssaa4` in an export, a stills run and a check, `msaa` in a preview |
| `glow` | number | `0.4` | the screen's glow, 0 to 1 (0 is off): the screen's bright picture blooms softly onto the bezel and the air around it, and never over the picture itself, which stays exact. Seen on a dark ground; on a light one it is a faint halation |
| `contact` | number | `1` | the soft contact shadow under the device, 0 to 1 (0 is off): the device seen from under the floor as height above it, blurred twice, dark where it touches and a wide faint pool beyond; the key light's own shadow eases as it grows |
| `contactSoft` | number | `0.5` | how far the contact shadow spreads, 0 (tight) to 1 (wide) |
| `occlusion` | number | `0` | ambient occlusion (GTAO), 0 to 1 (0 is off): creases take a little shade. Costs about 100 ms a frame in software and can speckle a hard silhouette, so it is off unless a brand wants it |
| `reflection` | number | `0` | a mirror floor, 0 to 1 (0 is off): the device reflected in the floor, strongest at its foot, fading and softening away from it. Off by default: on a light ground the reflection of a light device is faint |
| `reflectSoft` | number | `0.5` | how soft the floor's reflection is, 0 (a mirror) to 1 (a polished table) |
| `studio` | enum(light|dark|brand) | `light` | the light the device is lit by: `light` is a white void with a few softboxes (rectangular lights for crisp highlights on glass and metal, strips mirrored in the metal); `dark` is the dark room the 3D devices used before; `brand` is the void tinted by the canvas role with the accent role as a rim |
| `dof` | number | `0` | depth of field, 0 to 1 (0 is off): what lies nearer or further than the device is blurred; the focus is set from the camera to the device at that instant, never found by looking at the picture |
| `tilt` | number | `0` | a tilt-shift blur, 0 to 1 (0 is off): the frame softens toward its top and bottom edges, the row through the device staying sharp |
| `brushed` | number | `0.35` | the brushed grain of the metal, 0 (smooth satin) to 1 (a strong streak along the grain); a physical material with anisotropy, no dearer to draw than the standard one here |
| `asset` | beat field | none | a still, a recording folder (`mm media prep`) or a page folder (`mm capture site`) for the screen |
| `screen` | beat field | none | screen actions (`screen/scroll`, `play`, `swap`, `zoom-to`, `tap`) on the phone's screen; tap rings are drawn into the glass |

Brand knobs: aa, glow, contact, contactSoft, occlusion, reflection, reflectSoft, studio, dof, tilt, brushed, metal, model, status

## Style variables consumed
- `--mm-device-body` (the back, brand `devices.finish`)
- `--mm-device-rim-light` (the metal rim and keys)
- `--mm-device-glass` (the front glass and bezel)
- `--mm-device-island` (the island or punch hole)
- `--mm-device-lens`, `--mm-device-lens-ring` (camera lenses, front and back)
- `--mm-device-spec` (the flash)
- `--mm-color-surface` (the screen behind its content)
- `--mm-color-accent` (tap rings)
- `--mm-color-ink`, `--mm-color-canvas` (`drawn`: the lines are the ink at partial strength, the plates are the canvas)
- `--mm-frame-h` (the hidden screen's size)

## Legibility and rest notes
- The top bar draws the phone's status bar: time, signal, network and battery around the cutout.
- Lit like a product shot: a studio of softbox strips mirrored in the metal as bright lines, a soft glow behind the device, and a sheen that sweeps the glass as it turns and rests just off the left edge, so the screen reads clean at rest.
- The pose is a pure function of p and of the seconds since the beat arrived; the renderer is cached per slot and holds no visible state, so the same t gives the same pixels after any seek.
- The screen texture is copied after the seek's decodes (`afterSettle`), from the live boxes of a hidden 2D screen the screen fold drives, so it always shows the frame for t.
- The top bar's words (time, network, menu items, address) are drawn into the screen texture and declared (`canvasText: true`): device chrome, never the scene's message.
- The canvas is declared media: the gate's pixel rules mask it, and text on its screen is not read.

## Provenance
three.js (mrdoob/three.js), MIT: the vendored library, its RoundedBoxGeometry addon and the post-processing addons (composer, supersampling, bloom, occlusion, output pass, reflector, rectangular lights) ported from r187 (runtime/vendor/three/0.170.0, see NOTICE); the phone, its pose and the screen copy are original. The `drawn` move's line style follows Hairline (lucasmarkes/hairline), MIT: its drawing maths adapted in `runtime/kit/hairline.js`, its stroke roles and its long ease-out (see NOTICE).

## Known limits
- `drawn` draws a page's wire only for a captured page with a `wire` (captured since `mm capture site` records one); a recording or a still shows the phone, the screen edge and the status bar in lines, and its picture arrives with the band.
- Rendered in software (SwiftShader): slower than the flat devices to export. The default `ssaa4` draws the frame four times (about 0.25 to 0.35 s a frame at 1792 x 952); `ssaa16` about four times that.
- The mirror floor shows a hard vertical cut at the edge of its reflection on some poses (seen on a dark ground); it is off by default.
- Screen overlays other than tap rings (callouts, the island action) are not drawn into the glass yet.
- One phone per slot. A frame image (`frame`) is flat and stays with devices/phone; the 3D phone is drawn in code only.
