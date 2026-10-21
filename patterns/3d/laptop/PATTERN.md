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
| `asset` | beat field | none | a still, a recording folder (`mm media prep`) or a page folder (`mm capture site`) for the screen |
| `screen` | beat field | none | screen actions (`screen/scroll`, `play`, `swap`, `zoom-to`, `tap`) on the laptop's screen; tap rings are drawn into the glass |

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
- Rendered in software (SwiftShader): slower than the flat devices to export.
- Screen overlays other than tap rings (callouts, a menu bar) are not drawn into the glass.
- One laptop per slot; a frame image (`frame`) stays with devices/laptop.
