# 3d/laptop

## Purpose
A notebook in real 3D, matching 3d/phone: it turns into frame while its lid opens, or turns slowly, or makes a showcase half-turn, its screen playing a recording or showing a captured page with every screen action carried over.

## Use when / Do not use when
**Use when**
- a hero moment for a desktop product: the laptop turns to face the viewer as its lid opens
- a showcase: the laptop shows its back, then makes a slow half-turn to face the viewer
- a slow turntable while the screen scrolls or plays

**Do not use when**
- the screen must stay perfectly flat and sharp for reading (use `devices/laptop` or `devices/browser`)
- the scene is text-led; the 3D laptop is the scene's picture

## Params
| name | type | default | meaning |
|---|---|---|---|
| `move` | enum(hero|turntable|still|showcase) | `hero` | `hero` turns from the side to facing while the lid opens from nearly shut, then sways slowly; `turntable` turns about 20° a second; `still` holds a slight angle; `showcase` starts with the back to the viewer and turns half a turn to face it over 3.2 s, lid open, then holds still. In a deck every rest faces the viewer with the lid open |
| `metal` | enum(aluminium|titanium) | `aluminium` | the frame: satin aluminium in a neutral, faintly cool grey; or titanium, darker and faintly warm with a finer brushed sheen |
| `status` | enum(auto|true|false) | `auto` | the top bar drawn into the screen: `auto` shows it on a bare screen and a captured page (the page starts below it, as on a real screen) and leaves it to a recording or a still, which carry their own; its text goes dark or light with the content underneath |
| `statusTime` | string | `10:00` | the time in the top bar |
| `browser` | enum(auto|true|false) | `auto` | a browser window around a website: a toolbar below the menu bar with three window dots, back and forward, and an address pill; `auto` shows it for a captured page, not for a recording or a still |
| `url` | string | (empty) | the address in the browser's pill; empty shows the pill with its padlock only |
| `menu` | string | `File,Edit,View,Window,Help` | the menu bar's items, comma-separated, the first in bold; at most 6 |
| `model` | enum(notch|chin|plain) | `notch` | the face of the lid, as devices/laptop draws it: a camera notch with thin even bezels; a deeper top holding a small camera and a chin; or even bezels and no camera |
| `aa` | enum(auto|ssaa4|ssaa16|msaa|off) | `auto` | edge anti-aliasing. `ssaa4` and `ssaa16` render the frame 4 or 16 times, each shifted by sixteenths of a pixel, and average them: exact and the same on every machine (about 2.5 and 9 times the cost of `msaa` in software). `msaa` is the graphics card's multisampling, `off` leaves edges stepped. `auto` is `ssaa4` in an export, a stills run and a check, `msaa` in a preview |
| `glow` | number | `0.4` | the screen's glow, 0 to 1 (0 is off): the screen's bright picture blooms softly onto the bezel and the air around it, and never over the picture itself, which stays exact. Seen on a dark ground; on a light one it is a faint halation |
| `contact` | number | `0` | a contact shadow right under the device, 0 to 1 (0 is off, the default: the key light's soft long shadow on the floor is the only one): the device seen from under the floor as height above it, blurred twice, dark where it touches and a wide faint pool beyond; the key light's own shadow eases as it grows |
| `contactSoft` | number | `0.5` | how far the contact shadow spreads, 0 (tight) to 1 (wide) |
| `occlusion` | number | `0` | ambient occlusion (GTAO), 0 to 1 (0 is off): creases take a little shade. Costs about 100 ms a frame in software and can speckle a hard silhouette, so it is off unless a brand wants it |
| `reflection` | number | `0` | a mirror floor, 0 to 1 (0 is off): the device reflected in the floor, strongest at its foot, fading and softening away from it. Off by default: on a light ground the reflection of a light device is faint |
| `reflectSoft` | number | `0.5` | how soft the floor's reflection is, 0 (a mirror) to 1 (a polished table) |
| `studio` | enum(light|dark|brand) | `light` | the light the device is lit by: `light` is a white void with a few softboxes (rectangular lights for crisp highlights on glass and metal, strips mirrored in the metal); `dark` is the dark room the 3D devices used before; `brand` is the void tinted by the canvas role with the accent role as a rim |
| `dof` | number | `0` | depth of field, 0 to 1 (0 is off): what lies nearer or further than the device is blurred; the focus is set from the camera to the device at that instant, never found by looking at the picture |
| `tilt` | number | `0` | a tilt-shift blur, 0 to 1 (0 is off): the frame softens toward its top and bottom edges, the row through the device staying sharp |
| `brushed` | number | `0.35` | the brushed grain of the metal, 0 (smooth satin) to 1 (a strong streak along the grain); a physical material with anisotropy, no dearer to draw than the standard one here |
| `asset` | beat field | none | a still, a recording folder (`mm media prep`) or a page folder (`mm capture site`) for the screen |
| `screen` | beat field | none | screen actions (`screen/scroll`, `play`, `swap`, `zoom-to`, `tap`) on the laptop's screen; tap rings are drawn into the glass |

Brand knobs: aa, glow, contact, contactSoft, occlusion, reflection, reflectSoft, studio, dof, tilt, brushed, metal, model, status

## Style variables consumed
- `--mm-device-body` and `--mm-device-rim-light` (the metal shell; the deck, keys and trackpad are tones of it)
- `--mm-device-glass` (the glass face of the lid, the bezel and the notch)
- `--mm-device-lens-ring` (the camera)
- `--mm-color-surface` (the screen behind its content)
- `--mm-color-accent` (tap rings)
- `--mm-frame-h` (the hidden screen's size)

## Legibility and rest notes
- The top bar draws the laptop's menu bar: menu items, wifi, battery and time; a captured page also sits in a browser window below it.
- Lit like a product shot: a studio of softbox strips mirrored in the metal as bright lines, a soft glow behind the device, and a sheen that sweeps the glass as it turns and rests just off the left edge, so the screen reads clean at rest.
- The pose (turn, rise, lid angle) is a pure function of p and of the seconds since the beat arrived; the renderer is cached per slot and holds no visible state, so the same t gives the same pixels after any seek.
- The screen texture is copied after the seek's decodes (`afterSettle`), from the live boxes of a hidden 2D screen the screen fold drives, so it always shows the frame for t. The screen reflects the room faintly, as a glossy panel does.
- The top bar's words (time, network, menu items, address) are drawn into the screen texture and declared (`canvasText: true`): device chrome, never the scene's message.
- The canvas is declared media: the gate's pixel rules mask it, and text on its screen is not read.

## Provenance
three.js (mrdoob/three.js), MIT: the vendored library (runtime/vendor/three/0.170.0); the laptop, its proportions, its pose, the studio light and the screen copy are original (runtime/kit/device3d.js, shared with 3d/phone).

## Known limits
- Rendered in software (SwiftShader): slower than the flat devices to export. The default `ssaa4` draws the frame four times (about 0.25 to 0.35 s a frame at 1792 x 952); `ssaa16` about four times that.
- The mirror floor shows a hard vertical cut at the edge of its reflection on some poses (seen on a dark ground); it is off by default.
- Screen overlays other than tap rings (callouts, a menu bar) are not drawn into the glass.
- One laptop per slot; a frame image (`frame`) stays with devices/laptop.
