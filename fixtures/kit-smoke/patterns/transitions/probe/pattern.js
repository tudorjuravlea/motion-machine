// Fixture probe: a transition that records params and policy, appends an overlay node to
// <body> and writes --mm-tx-* on both sections: the kit must clear both when a seek leaves the cut.
const rec = (kind, key, v) => { const w = globalThis; w.__probe ??= {}; (w.__probe[kind] ??= {})[key] = v; };
export default {
  name: 'probe',
  group: 'transitions',
  dur: 'standard',
  params: { shape: { type: 'enum(line|circle)', default: 'line', meaning: 'plate shape' } },
  at(incoming, p, ctx) {
    rec('transition', ctx.scene, { params: ctx.params, policy: ctx.policy });
    const doc = incoming.ownerDocument;
    const veil = doc.createElement('div');
    veil.setAttribute('data-mm-overlay', '');
    veil.className = 'probe-veil';
    doc.body.append(veil);
    ctx.from.style.setProperty('--mm-tx-veil', String(1 - p));
    ctx.to.style.setProperty('--mm-tx-veil', String(p));
    ctx.to.style.opacity = String(p);
  },
};
