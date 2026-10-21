// The key legend: a bar under the timeline that shows only the keys
// that work right now. Its context follows the focus and the pointer: `play` when nothing in the
// timeline is focused, `beat` or `scene` when a timeline item is, `drag` while a drag is in flight.
// A read-only story lists no editing keys. "? all keys" opens the full list (the #keys dialog).
import { h } from './dom.js';

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const UNDO = MAC ? ['⌘Z'] : ['Ctrl', 'Z'];
const EXPORT = MAC ? ['⌘E'] : ['Ctrl', 'E'];

// each key is a list of caps and what they do; caps are drawn as <kbd>, side by side (none: a mouse action)
const SETS = {
  play: [[['Space'], 'play'], [['J', 'K', 'L'], 'shuttle'], [['←', '→'], 'a frame (⇧ 1 s)'], [['I', 'O'], 'loop in, out'], [['=', '−'], 'zoom'], [['Tab'], 'into the timeline'], [EXPORT, 'export']],
  beat: [[['←', '→'], 'nudge a frame (⇧ 0.1 s)'], [['[', ']'], 'exit'], [['Alt', '←', '→'], 'next clip'], [['↑', '↓'], 'lane'], [['Enter'], 'edit'], [['Delete'], 'remove'], [UNDO, 'undo']],
  scene: [[['←', '→'], 'move the scene'], [['[', ']'], 'scene end'], [['Alt', '←', '→'], 'next item'], [['↑', '↓'], 'lane'], [['Enter'], 'edit'], [UNDO, 'undo']],
  view: [[['Alt', '←', '→'], 'next item'], [['↑', '↓'], 'lane'], [['Enter'], 'inspect'], [['Space'], 'play']],
  drag: [[['Alt'], 'skip snapping'], [['Esc'], 'cancel'], [[], 'release to save']],
};

export function createKeybar(el, { onAll }) {
  let shown = null;
  // built once: focusing it changes the context, and a rebuilt button would lose the click
  const row = h('div', 'kb-row');
  const all = h('button', 'kb-all', { type: 'button', 'data-all-keys': true, title: 'Every key (?)' });
  all.append(h('kbd', null, {}, '?'), ' all keys');
  all.addEventListener('click', onAll);
  el.replaceChildren(row, all);
  function set(context, { readOnly = false } = {}) {
    const key = `${context}|${readOnly}`;
    if (key === shown) return;
    shown = key;
    const editing = context === 'beat' || context === 'scene';
    const items = readOnly && editing ? SETS.view : SETS[context];
    el.dataset.context = context;
    row.replaceChildren();
    if (readOnly && editing) row.append(h('span', 'kb-note', {}, 'read-only'));
    for (const [caps, what] of items) {
      const k = h('span', 'kb');
      caps.forEach((c, i) => { if (i) k.append(' '); k.append(h('kbd', null, {}, c)); });
      if (caps.length) k.append(' ');
      k.append(h('span', 'kb-what', {}, what));
      row.append(k);
    }
  }
  return { set };
}
