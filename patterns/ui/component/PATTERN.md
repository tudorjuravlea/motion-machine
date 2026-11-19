# ui/component

## Purpose
Plays a real UI component from a script of its states, moving the way the component moves: its states are written the way a component library writes them, and the runtime plays the motion between them at any instant. Four kinds: the toast stack (notifications arrive from the edge, stack behind the newest, fan out, leave and close again); the menu (the pointer presses a trigger, the menu grows from it, the pointer walks its items as they light, presses one, and the menu goes); tabs (the pointer presses a tab, its underline slides there, and the panels slide toward the side they lie on); and the sheet (it rises from the foot of the screen on the iOS sheet spring, is dragged and flicked between its detents, and the screen behind scales back and dims as it rises).

## Use when / Do not use when
Use when:
- the moment is a component doing its job: a confirmation arriving, a stack of activity, an action picked from a menu, a view switched, a sheet of choices brought up
- the motion should be the component's own, every state change timed by the script

Do not use when:
- the real product can be recorded (use a device with `screen/` actions)
- one notification is the whole point and needs words around it (a `ui/status` pill reads faster)
- the stack would hold more than four or five arrivals, or the menu more than six items; the idea reads at three or four

## Params

| name | type | default | meaning |
|---|---|---|---|
| kind | enum(toast\|menu\|tabs\|sheet) | toast | the component: toast, a stack of notifications; menu, a trigger and the menu it opens; tabs, a tab list and its panels; sheet, a bottom sheet over the screen |
| steps | string | (empty) | the script, one step a line, `<seconds> <verb> <argument>` with the seconds into the beat: toast takes `add <title> \| <text>` (a notification arrives at the front), `dismiss` or `dismiss <n>` (the front one, or the nth added, leaves), `expand` (the stack fans out) and `close` (it closes); menu takes `open`, `highlight <n>` and `press <n>` (the nth item lights; a press also closes the menu, a moment after) and `close`; tabs take `select <n>` (the nth tab); sheet takes `open` or `open <n>` (to the nth detent), `drag up` or `drag down` (a finger flicks it to the next detent that way; down from the lowest closes it) and `close` |
| max | number | 3 | toast: how many show in the stack at once; older ones wait out of sight |
| items | string | Duplicate\|Rename\|Move to…\|!Delete | menu: its items, split on `\|`; a leading `!` marks a destructive one, drawn in the alert role |
| label | string | … | menu: the words on the trigger; sheet: its title |
| tabs | string | Overview\|Activity\|Settings | tabs: the tabs, split on `\|` |
| panels | string | (empty) | tabs: a short line heading each tab's panel, split on `\|` in the tabs' order (the rest of a panel is quiet bars) |
| active | number | 1 | tabs: the tab selected when the beat starts |
| rows | string | (empty) | sheet: its rows, split on `\|`, under its title |
| hold | number | 1.2 | seconds after the last step for its motion to run and the component to rest |
| app | string | (empty) | a few words for the screen behind the component, as its title |

The script travels as a string, as every param does (a line a step, like `text/code`'s). Tabs are pressed by the pointer the same way, and the sheet's grabber is held by it through each drag. In a menu the authored pointer follows the script: it reaches the trigger as the menu opens and presses it, then reaches each item as it lights, and presses where the script presses. The beat's length is its last step plus `hold`; each step is a beat of its own for the timing rules.

## Style variables consumed
- `--mm-size-body`, `--mm-font-text`, `--mm-weight-text`, `--mm-weight-display`, `--mm-tracking-text`
- `--mm-color-surface`, `--mm-color-surfaceInk`, `--mm-surface-muted`, `--mm-device-shade` (the darkest role, the sheet's dim), `--mm-color-line`, `--mm-color-accent`, `--mm-color-alert`, `--mm-color-ink`, `--mm-color-muted`, `--mm-color-canvas`
- `--mm-space-*`, `--mm-radius-*`, `--mm-safe`
- `--mm-dur-quick`, `--mm-dur-standard`, and the style's `enter` and `exit` easings (as `--mm-ease-*`): a toast arrives and the stack moves in `standard` on `enter`, the stack fans out in `quick` on `enter`, and a toast leaves in `quick` on `exit`; a menu grows in and its items light in `quick` on `enter`, and it goes in `quick` on `exit`; tabs' underline slides in `standard` on `move`, the old panel leaves in `quick` on `exit` and the new one comes in `standard` on `enter` once it has gone; the sheet moves on its own spring (response 0.34 s, critically damped), not a duration role

## Legibility and rest notes
At p = 1 every step has run and the stack has had `hold` seconds to settle, so nothing moves; it works as the poster and under reduced motion. Only the front toast's words read in a closed stack: the ones behind take its height and their words are covered. A toast is the canvas role with the ink role on it, the pair every preset already makes readable, and its dot is the accent. Tabs rest on the last tab selected, its panel whole and the others out of sight, so two panels' words never show at once. A sheet rests where its script leaves it: open on a detent over the dimmed screen, or shut. A menu's rest is after it has shut: the trigger with the pointer where it pressed; a lit item is a faint ink tint under the ink, a destructive one the alert role (the accent in a brand without one).

## Provenance
UI SDK, Apache-2.0 (vercel-labs/ui): the presence protocol (state attributes, a starting and an ending look), the toast stack's motion (its index, offsets, the scale of the ones behind, the front height they take, the slide from the edge and back), and the menu's parts and states (a trigger open while its menu is, a lit item, a destructive one), restated in our own code and CSS as a script played at t. The menu's grow from its trigger is the common product-menu motion, not theirs (theirs only fades). The sheet's detents (0.5252 and 0.9291 of the screen), its spring and the screen behind scaling to 0.94 as it rises come from their iOS-fitted sheet physics; its drag lands through `runtime/kit/inertia.js`, whose snap rules restate theirs. No code taken.

## Known limits
- Four kinds so far: the toast stack at the panel's foot, the menu under a trigger in the panel's head, tabs, and the sheet; the command palette, dialogs, accordions and the rest are kinds still to write.
- Tabs have no keyboard focus ring and no scrolling list; their panels are quiet bars under an optional heading.
- The sheet has two detents and one size of finger drag (a flick to the next detent); on the stage its panel is a portrait screen as tall as the safe area allows, and a phone's screen holds it best. No rubber band past the top detent yet.
- A menu opens once per beat, under its trigger with their right edges aligned; no submenus, checks or radio items yet.
- The CSS never declares `transition`: each state's motion is `--mm-motion` in its grammar (a property, a duration role, an easing role, a delay), and a duration is a style role, not a sum of them.
- Numbers and lengths are interpolated, colours mixed in Oklab; a value that cannot be interpolated switches halfway, as CSS does.
- A change that interrupts a running motion starts from where it is, with its full length (the browser shortens a reversed transition; this does not).
- No swipe yet: a toast leaves by sliding back the way it came, or fading where it is if it was behind.
