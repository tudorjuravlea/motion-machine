// A pattern's params at run time: its own defaults, then the brand's (style.patterns["group/name"]),
// then the beat's. Pure, so a brand can always be made more on brand without touching a story.

/** @param {{ name?: string, group?: string, params?: object|object[] }} mod @param {object} [bag] the beat's params @param {object} [style] */
export function paramsOf(mod, bag, style) {
  const out = {};
  const ps = mod.params;
  if (Array.isArray(ps)) for (const p of ps) out[p.name] = p.default;
  else if (ps && typeof ps === 'object') for (const [k, v] of Object.entries(ps)) out[k] = v && typeof v === 'object' && 'default' in v ? v.default : v;
  const brand = mod.group && mod.name ? style?.patterns?.[`${mod.group}/${mod.name}`] : null;
  return { ...out, ...(brand || {}), ...(bag || {}) };
}
