// ui/component: a UI component played from a script of its states (runtime/kit/component.js). The kind
// builds the component and says, for each moment a step changes something, what state every part is in;
// the component's CSS says what each state looks like and, in `--mm-motion`, how it moves there. Kinds: the
// toast stack (notifications arrive from the edge, stack behind the newest, fan out and leave) and the menu (a
// trigger is pressed, the menu grows from it, the pointer walks its items and presses one, and it closes) and
// tabs (the pointer presses a tab, its underline slides there, and the panels slide toward the side they lie on)
// and the sheet (it rises from the foot of the screen to a detent on the iOS sheet spring, is dragged and flicked
// to the next, the screen behind it scaling back and dimming as it rises).
import { arrive, bar, cursorAt, drawCursor, elapsed, listOf, panel, part, pointIn, pressAt, scaleOf } from '../../../runtime/kit/ui.js';
import { playParts } from '../../../runtime/kit/component.js';
import { spring } from '../../../runtime/kit/springs.js';
import { inertia, SNAP } from '../../../runtime/kit/inertia.js';

const KINDS = ['toast', 'menu', 'tabs', 'sheet'];
const VERBS = { toast: ['add', 'dismiss', 'expand', 'close'], menu: ['open', 'highlight', 'press', 'close'], tabs: ['select'], sheet: ['open', 'drag', 'close'] };
// the sheet: where it rests, as shares of the screen's height (the medium and large detents of an iOS sheet),
// how long a finger drags before it lets go, and the screen height the flick threshold is measured against
const DETENTS = [0.5252, 0.9291];
const DRAG_S = 0.25;
const POINTS = 844;
const PRESS_S = 0.12;   // a press holds its pressed look this long
const LEAVE_S = 0.1;    // a pressed item shows its press before the menu goes
const OPEN = 0.4;   // the panel arrives over its first 0.4 s
const r1 = (x) => Math.round(x * 10) / 10;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * The steps of a beat, read from its script and put in time order: one step a line, `<seconds> <verb>
 * <argument>`, the seconds into the beat (a script travels as a string, like every param, SPEC §3). Toast:
 * `add <title> | <text>`, `dismiss` (the front one) or `dismiss <n>` (the nth added), `expand`, `close`.
 * Menu: `open`, `highlight <n>` and `press <n>` (the nth item; a press closes the menu), `close`. Tabs:
 * `select <n>` (the nth tab). Sheet: `open` or `open <n>` (to the nth detent), `drag up` or `drag down` (a finger
 * flicks it to the next detent that way; down from the lowest closes it), `close`.
 */
export function stepsOf(prm) {
  const kind = prm?.kind ?? 'toast';
  if (!KINDS.includes(kind)) throw new Error(`ui/component: unknown kind "${kind}" (${KINDS.join(', ')})`);
  const out = [];
  String(prm?.steps ?? '').split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const m = /^(\d+(?:\.\d+)?)\s+([a-z]+)(?:\s+(.*))?$/.exec(line);
    if (!m) throw new Error(`ui/component: step line ${i + 1} must read "<seconds> <verb> <argument>", not "${line.slice(0, 60)}"`);
    const [, at, verb, arg = ''] = m;
    if (!VERBS[kind].includes(verb)) throw new Error(`ui/component: step line ${i + 1}: ${kind} knows ${VERBS[kind].join(', ')}, not "${verb}"`);
    if (verb === 'add' && !arg.trim()) throw new Error(`ui/component: step line ${i + 1}: add needs a title`);
    if (verb === 'dismiss' && arg.trim() && arg.trim() !== 'front' && !/^\d+$/.test(arg.trim())) throw new Error(`ui/component: step line ${i + 1}: dismiss takes "front" or a number, not "${arg.trim()}"`);
    if (kind === 'sheet' && verb === 'drag' && !/^(up|down)$/.test(arg.trim())) throw new Error(`ui/component: step line ${i + 1}: drag takes up or down, not "${arg.trim()}"`);
    if (kind === 'sheet' && verb === 'open' && arg.trim() && !/^[12]$/.test(arg.trim())) throw new Error(`ui/component: step line ${i + 1}: open takes a detent, 1 or 2`);
    if ((verb === 'highlight' || verb === 'press' || verb === 'select') && !/^[1-9]\d*$/.test(arg.trim())) throw new Error(`ui/component: step line ${i + 1}: ${verb} takes ${verb === 'select' ? 'a tab' : 'an item'}'s number, from 1`);
    out.push({ at: Number(at), verb, arg: arg.trim() });
  });
  return out.sort((a, b) => a.at - b.at);
}

/** The beat's length: its last step, then `hold` seconds for the last change to run and the component to rest. */
export const durationOf = (prm) => Math.round(((stepsOf(prm).at(-1)?.at ?? 0) + (Number.isFinite(prm?.hold) ? prm.hold : 1.2)) * 1000) / 1000;

/**
 * The toast stack's parts, from its steps. Every toast is built in the region at once and measured at its
 * natural height; then, at each step, the live toasts (newest first, a leaving one out of the count) get their
 * index, the offset of the newer ones above them, the front toast's height and the stack's expansion.
 */
function toastParts(root, prm) {
  const steps = stepsOf(prm);
  const max = Number.isFinite(prm.max) && prm.max >= 1 ? Math.floor(prm.max) : 3;
  const region = part(root, 'mm-uc-toast__region');
  const toasts = [];
  for (const s of steps) {
    if (s.verb !== 'add') continue;
    const [title, ...rest] = s.arg.split('|');
    const a = { title: title.trim(), text: rest.join('|').trim() };
    const el = part(region, 'mm-uc-toast');
    const head = part(el, 'mm-uc-toast__head');
    part(head, 'mm-uc-toast__mark');
    part(head, 'mm-uc-toast__title', String(a.title ?? ''));
    if (a.text) part(el, 'mm-uc-toast__text', String(a.text));
    const cover = part(el, 'mm-uc-toast__cover');
    toasts.push({ el, cover, at: s.at, leave: null, h: 0, n: toasts.length + 1 });
  }
  for (const x of toasts) x.h = r1(x.el.offsetHeight);   // no --toast-height yet: the natural height
  // the panel is as tall as its words, or as the largest stack it fans out, with room above and below
  const gapProbe = part(root, 'mm-uc__gap');
  gapProbe.style.height = 'var(--mm-space-3)';
  const gap = gapProbe.offsetHeight, pad = parseFloat(root.ownerDocument.defaultView.getComputedStyle(region).bottom) || 0;
  gapProbe.remove();
  const tallest = toasts.map((x) => x.h).sort((a, b) => b - a).slice(0, max);
  if (tallest.length) root.style.minHeight = `${r1(tallest.reduce((a, b) => a + b, 0) + gap * (tallest.length - 1) + 2 * pad)}px`;

  let expanded = false;
  const times = [...new Set(steps.map((s) => s.at))];
  const states = new Map(toasts.map((x) => [x, []]));
  for (const T of times) {
    for (const s of steps.filter((s) => s.at === T)) {
      if (s.verb === 'expand') expanded = true;
      if (s.verb === 'close') expanded = false;
      if (s.verb === 'dismiss') {
        const liveNow = toasts.filter((x) => x.at <= T && x.leave == null).reverse();
        const x = !s.arg || s.arg === 'front' ? liveNow[0] : toasts[Number(s.arg) - 1];
        if (!x) throw new Error(`ui/component: dismiss at ${T} s names no toast (${s.arg ?? 'front'})`);
        if (x.leave == null) x.leave = T;
      }
    }
    const live = toasts.filter((x) => x.at <= T && (x.leave == null || x.leave > T)).reverse();
    const front = live[0]?.h ?? 0;
    let offset = 0;
    live.forEach((x, i) => {
      states.get(x).push({ at: T, attrs: { 'data-front': i === 0, 'data-expanded': expanded, 'data-limited': i >= max },
        vars: { '--toast-index': i, '--toast-offset': `${r1(offset)}px`, '--toast-height': `${x.h}px`, '--toast-front-height': `${front}px` } });
      offset += x.h;
    });
  }
  return toasts.map((x) => ({ el: x.el, follow: [x.cover], states: states.get(x).filter((s) => s.at >= x.at), leave: x.leave }));
}

/**
 * The menu's parts, from its steps. The trigger sits in the panel's head; the menu is laid out under it,
 * its right edge on the trigger's, and grows from that corner. It opens once: from `open` until `close` or
 * just after a `press`. Each `highlight` and `press` lights one item; the authored pointer reaches the
 * trigger as the menu opens and each item as it lights, and presses where the script presses.
 */
function menuParts(root, head, prm) {
  const steps = stepsOf(prm);
  const items = listOf(prm.items);
  if (!items.length) throw new Error('ui/component: a menu needs items, "First|Second|…"');
  const opened = steps.find((s) => s.verb === 'open');
  const trigger = part(head, 'mm-uc-menu__trigger', String(prm.label || '…'));
  const popup = part(root, 'mm-uc-menu__popup');
  const rows = items.map((text) => {
    const row = part(popup, `mm-uc-menu__item${text.startsWith('!') ? ' mm-uc-menu__item--alert' : ''}`, text.replace(/^!/, ''));
    return row;
  });
  for (const s of steps) if ((s.verb === 'highlight' || s.verb === 'press') && Number(s.arg) > items.length) throw new Error(`ui/component: ${s.verb} ${s.arg} at ${s.at} s names no item (the menu has ${items.length})`);

  // where the menu sits: under the trigger, right edges aligned, a small gap between
  const gapProbe = part(root, 'mm-uc__gap');
  gapProbe.style.height = 'var(--mm-space-2)';
  const gap = gapProbe.offsetHeight, pad = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).paddingBottom) || 0;
  gapProbe.remove();
  const corner = pointIn(trigger, root, 1, 1);
  popup.style.top = `${r1(corner.y + gap)}px`;
  popup.style.left = `${r1(corner.x - popup.offsetWidth)}px`;
  root.style.minHeight = `${r1(corner.y + gap + popup.offsetHeight + pad)}px`;

  // the menu's life: open, then shut by a close or just after the press that ends it
  const openAt = opened ? opened.at : null;
  const shut = openAt == null ? null : steps.find((s) => s.at > openAt && (s.verb === 'close' || s.verb === 'press'));
  const leave = shut == null ? null : shut.verb === 'press' ? shut.at + LEAVE_S : shut.at;

  // the trigger: hovered as the pointer reaches it, pressed as it opens the menu, open while it is open
  const tStates = [{ at: 0, attrs: {} }];
  if (openAt != null) {
    tStates.push({ at: Math.max(0, openAt - 0.25), attrs: { 'data-mm-hover': true } });
    tStates.push({ at: openAt, attrs: { 'data-mm-hover': true, 'data-mm-active': true, 'data-open': true } });
    tStates.push({ at: openAt + PRESS_S, attrs: { 'data-open': true } });
    if (leave != null) tStates.push({ at: leave, attrs: {} });
  }
  const parts = [{ el: trigger, states: tStates, leave: null }];
  if (openAt == null) { popup.style.display = 'none'; return { parts, pointer: null }; }

  // the menu and its items live from open to leave; one item at a time is lit, a pressed one pressed for a moment
  parts.push({ el: popup, states: [{ at: openAt, attrs: {} }], leave });
  const lit = steps.filter((s) => (s.verb === 'highlight' || s.verb === 'press') && s.at >= openAt && (leave == null || s.at < leave));
  rows.forEach((row, i) => {
    const states = [{ at: openAt, attrs: {} }];
    for (const s of lit) {
      const on = Number(s.arg) === i + 1;
      states.push({ at: s.at, attrs: { 'data-highlighted': on, 'data-mm-active': on && s.verb === 'press' } });
      if (on && s.verb === 'press') states.push({ at: s.at + PRESS_S, attrs: { 'data-highlighted': true } });
    }
    parts.push({ el: row, states, leave });
  });

  // the pointer: from beside the panel to the trigger as the menu opens, then to each item as it lights
  const size = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).fontSize);
  const tp = pointIn(trigger, root, 0.5, 0.55);
  const stops = [{ x: root.offsetWidth + size * 2, y: tp.y + size * 3, at: 0 }, { ...tp, at: openAt }];
  for (const s of lit) stops.push({ ...pointIn(rows[Number(s.arg) - 1], root, 0.3, 0.55), at: s.at });
  const presses = [openAt, ...lit.filter((s) => s.verb === 'press').map((s) => s.at)];
  return { parts, pointer: { stops, presses } };
}

/**
 * The tabs' parts, from its steps. The list's tabs are measured once; the underline takes the active tab's
 * place and width at each `select`, and each panel lies before or after the active one, so a change slides the
 * old panel away and the new one in from the side the pressed tab is on. The pointer presses each tab it selects.
 */
function tabsParts(root, app, prm) {
  const steps = stepsOf(prm);
  const labels = listOf(prm.tabs);
  if (labels.length < 2) throw new Error('ui/component: tabs need two or more, "First|Second|…"');
  const captions = listOf(prm.panels);
  for (const s of steps) if (Number(s.arg) > labels.length) throw new Error(`ui/component: select ${s.arg} at ${s.at} s names no tab (there are ${labels.length})`);
  const first = Number.isInteger(prm.active) && prm.active >= 1 && prm.active <= labels.length ? prm.active : 1;
  const list = part(app, 'mm-uc-tabs__list');
  const tabs = labels.map((l) => part(list, 'mm-uc-tabs__tab', l));
  const line = part(list, 'mm-uc-tabs__indicator');
  const stack = part(app, 'mm-uc-tabs__panels');
  const LAYOUTS = [[18, 24, 10, 21], [12, 20, 16, 8, 14], [22, 14, 19, 11]];
  const panes = labels.map((_, i) => {
    const pane = part(stack, 'mm-uc-tabs__panel');
    if (captions[i]) part(pane, 'mm-uc-tabs__caption', captions[i]);
    for (const w of LAYOUTS[i % LAYOUTS.length]) bar(pane, w);
    return pane;
  });
  stack.style.minHeight = `${Math.max(...panes.map((x) => x.offsetHeight))}px`;
  const place = tabs.map((x) => ({ x: x.offsetLeft, w: x.offsetWidth }));

  const picks = [{ at: 0, n: first }, ...steps.map((s) => ({ at: s.at, n: Number(s.arg) }))];
  const lineStates = picks.map((p) => ({ at: p.at, vars: { '--tab-x': `${r1(place[p.n - 1].x)}px`, '--tab-w': `${r1(place[p.n - 1].w)}px` } }));
  const parts = [{ el: line, states: lineStates, leave: null }];
  tabs.forEach((tab, i) => {
    const states = [];
    for (const p of picks) {
      states.push({ at: p.at, attrs: { 'data-active': p.n === i + 1, 'data-mm-active': p.at > 0 && p.n === i + 1 } });
      if (p.at > 0 && p.n === i + 1) states.push({ at: p.at + PRESS_S, attrs: { 'data-active': true } });
    }
    parts.push({ el: tab, states: states.sort((a, b) => a.at - b.at), leave: null });
  });
  panes.forEach((pane, i) => parts.push({ el: pane, leave: null,
    states: picks.map((p) => ({ at: p.at, attrs: { 'data-side': i + 1 < p.n ? 'before' : i + 1 > p.n ? 'after' : false } })) }));

  const size = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).fontSize);
  const at0 = pointIn(tabs[first - 1], root, 0.5, 0.6);
  const stops = [{ x: root.offsetWidth + size * 2, y: at0.y + size * 4, at: 0 }, ...steps.map((s) => ({ ...pointIn(tabs[Number(s.arg) - 1], root, 0.5, 0.6), at: s.at }))];
  return { parts, pointer: steps.length ? { stops, presses: steps.map((s) => s.at) } : null };
}

/**
 * The sheet's height above the foot of the screen through the script, as closed forms in t. `open` and `close`
 * carry it on the sheet spring (response SNAP.response, critically damped) from wherever it is and at whatever
 * speed it has; a `drag` is a finger that grabs where the sheet is and pulls the next detent's way, faster and
 * faster for DRAG_S, then lets go at a flick's speed, and the throw takes over: its snap rules pick the next detent
 * that way and land it on the sheet spring that leaves at the release speed (inertia.js). Returns the height
 * and speed at any t, and each drag's window.
 */
export function sheetMotion(steps, H) {
  const rests = [0, ...DETENTS.map((f) => f * H)];
  const minFlick = SNAP.minFlick * (H / POINTS);
  const w = (2 * Math.PI) / SNAP.response, calm = { k: w * w, c: 2 * w, m: 1 };
  const segs = [{ t0: 0, at: () => 0, speed: () => 0 }];
  const here = (t) => { let g = segs[0]; for (const x of segs) if (x.t0 <= t) g = x; return g; };
  const ext = (t) => here(t).at(t), vel = (t) => here(t).speed(t);
  const drags = [];
  for (const s of steps) {
    const T = s.at, e0 = ext(T), v0 = vel(T);
    if (s.verb === 'open' || s.verb === 'close') {
      const to = s.verb === 'close' ? 0 : rests[s.arg ? Number(s.arg) : 1];
      segs.push({ t0: T, at: (t) => spring.from(t - T, calm, { from: e0, to, velocity: v0 }), speed: (t) => spring.velocityFrom(t - T, calm, { from: e0, to, velocity: v0 }) });
      continue;
    }
    // a drag: the finger pulls e = e0 + d u², u = (t - T) / DRAG_S, and lets go at 2d / DRAG_S, one and a half flicks
    const dir = s.arg === 'up' ? 1 : -1;
    const v = dir * 1.5 * minFlick, d = (v * DRAG_S) / 2, T1 = T + DRAG_S;
    segs.push({ t0: T, at: (t) => e0 + d * ((t - T) / DRAG_S) ** 2, speed: (t) => (2 * d * (t - T)) / DRAG_S ** 2 });
    const th = inertia({ from: e0 + d, velocity: v, snap: rests, skip: false, minFlick, restDelta: 0.5 });
    segs.push({ t0: T1, at: (t) => th.at(t - T1), speed: (t) => th.velocity(t - T1) });
    drags.push({ t0: T, t1: T1 });
  }
  return { at: ext, speed: vel, drags, top: rests.at(-1) };
}

/**
 * The sheet's parts. The panel is a screen: the app behind is the `outlet` that scales back and dims as the
 * sheet rises to its first detent; the sheet itself is as tall as its top detent, moved up by its height. The
 * pointer reaches the sheet's grabber at each drag's start and holds it to the release.
 */
function sheetDraw(root, app, prm, t) {
  const steps = stepsOf(prm);
  // on a device the screen is the panel; on the stage the panel is a portrait screen as tall as the safe area allows
  const screen = root.parentElement?.classList.contains('mm-screen-fx');
  if (!screen) {
    const stage = root.closest('.mm-stage'), safe = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).getPropertyValue('--mm-safe')) || 0;
    const room = (stage?.offsetHeight ?? root.offsetWidth * 1.3) - 2 * safe - 2;
    const h = Math.min(root.offsetWidth * 1.3, room);
    root.style.height = `${r1(h)}px`;
    root.style.width = `${r1(Math.min(root.offsetWidth, h * 0.75))}px`;
  }
  const H = root.clientHeight;
  const m = sheetMotion(steps, H);
  const dim = part(root, 'mm-uc-sheet__dim');
  const sheet = part(root, 'mm-uc-sheet');
  part(sheet, 'mm-uc-sheet__grabber');
  if (prm.label && prm.label !== '…') part(sheet, 'mm-uc-sheet__title', prm.label);
  for (const row of listOf(prm.rows)) part(sheet, 'mm-uc-sheet__row', row);
  for (const w of [17, 23, 12]) bar(sheet, w);
  sheet.style.height = `${r1(m.top)}px`;
  const e = Math.max(0, m.at(t));
  sheet.style.translate = `0 ${r1(m.top - e)}px`;
  sheet.style.display = e < 0.5 ? 'none' : '';
  const p = Math.min(1, e / (DETENTS[0] * H));
  dim.style.opacity = String(Math.round(0.35 * p * 1000) / 1000);
  app.style.transformOrigin = 'center top';
  app.style.scale = String(Math.round((1 - 0.06 * p) * 10000) / 10000);
  app.style.translate = `0 ${r1(0.02 * H * p)}px`;
  if (!m.drags.length) return;
  // the pointer: to the grabber as a drag starts, with it to the release, then still
  const size = parseFloat(root.ownerDocument.defaultView.getComputedStyle(root).fontSize);
  const grab = (x) => ({ x: r1(root.clientWidth / 2), y: r1(H - Math.max(0, m.at(x)) + size * 0.6) });
  const inDrag = m.drags.find((g) => t >= g.t0 && t <= g.t1);
  let at;
  if (inDrag) at = grab(t);
  else {
    const stops = [{ x: root.offsetWidth + size * 2, y: H * 0.7, at: 0 }];
    for (const g of m.drags) stops.push({ ...grab(g.t0), at: g.t0 }, { ...grab(g.t1), at: g.t1 });
    at = cursorAt(t, stops, scaleOf(root));
  }
  drawCursor(root, at, { press: inDrag ? 0.86 : 1 });
}

export default {
  name: 'component',
  group: 'ui',
  durationOf,
  stepsOf: (prm) => stepsOf(prm).map((s) => s.at),
  params: {
    kind: { type: 'enum(toast|menu|tabs|sheet)', default: 'toast', meaning: 'the component: toast, a stack of notifications; menu, a trigger and the menu it opens; tabs, a tab list and its panels; sheet, a bottom sheet over the screen' },
    steps: { type: 'string', default: '', meaning: 'the script, one step a line, "<seconds> <verb> <argument>" with the seconds into the beat: toast takes "add <title> | <text>" (a notification arrives at the front), "dismiss" or "dismiss <n>" (the front one, or the nth added, leaves), "expand" (the stack fans out) and "close" (it closes); menu takes "open", "highlight <n>" and "press <n>" (the nth item lights; a press also closes the menu) and "close"; tabs take "select <n>" (the nth tab); sheet takes "open" or "open <n>" (to the nth detent), "drag up" or "drag down" (flicked to the next detent that way; down from the lowest closes it) and "close"' },
    max: { type: 'number', default: 3, meaning: 'toast: how many show in the stack at once; older ones wait out of sight' },
    items: { type: 'string', default: 'Duplicate|Rename|Move to…|!Delete', meaning: 'menu: its items, split on "|"; a leading "!" marks a destructive one, drawn in the alert role' },
    label: { type: 'string', default: '…', meaning: 'menu: the words on the trigger; sheet: its title' },
    tabs: { type: 'string', default: 'Overview|Activity|Settings', meaning: 'tabs: the tabs, split on "|"' },
    panels: { type: 'string', default: '', meaning: 'tabs: a short line heading each tab\'s panel, split on "|" in the tabs\' order (the rest of a panel is quiet bars)' },
    active: { type: 'number', default: 1, meaning: 'tabs: the tab selected when the beat starts' },
    rows: { type: 'string', default: '', meaning: 'sheet: its rows, split on "|", under its title (label)' },
    hold: { type: 'number', default: 1.2, meaning: 'seconds after the last step for its motion to run and the component to rest' },
    app: { type: 'string', default: '', meaning: 'a few words for the screen behind the component, as its title' },
  },
  at(el, p, ctx) {
    const t = elapsed(p, ctx);
    const prm = ctx.params;
    const root = panel(el, `mm-uc mm-uc--${prm.kind ?? 'toast'}`);
    const app = part(root, 'mm-uc__app');
    const head = part(app, 'mm-uc__head');
    if (prm.app) part(head, 'mm-uc__title', prm.app);
    const kind = prm.kind ?? 'toast';
    if (kind !== 'tabs') for (const w of [16, 22, 12, 19, 9]) bar(app, w);   // the screen behind a toast or a menu
    if (kind === 'menu' || kind === 'tabs') {
      const { parts, pointer } = kind === 'menu' ? menuParts(root, head, prm) : tabsParts(root, app, prm);
      playParts(parts, t);
      if (pointer) {
        const at = cursorAt(t, pointer.stops, scaleOf(root));
        const press = Math.min(...pointer.presses.map((p) => pressAt(t, p, 0.86)));
        drawCursor(root, { x: r1(at.x), y: r1(at.y) }, { press: Math.round(press * 1000) / 1000 });
      }
    } else if (kind === 'sheet') sheetDraw(root, app, prm, t);
    else playParts(toastParts(root, prm), t);
    arrive(root, clamp01(t / OPEN), ctx);
    root.style.opacity = String(Math.round(parseFloat(root.style.opacity) * 1000) / 1000);
  },
};
