// Style values that end up inside a <style> element or a font-family rule must not be able to close the rule or
// the element. One definition, shared by `mm style compose`, `mm brand capture` and the handout export: a font
// family is a short run of word characters, spaces, dots, apostrophes and hyphens; a colour is a hex colour.

/** A font family name safe to write into CSS between double quotes. */
export const FAMILY_PATTERN = /^[\w .'-]{1,64}$/;
/** The colour forms the code's hex parser reads: #rgb, #rgba, #rrggbb, #rrggbbaa. */
export const COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const isSafeFamily = (name) => typeof name === 'string' && FAMILY_PATTERN.test(name);
export const isColor = (value) => typeof value === 'string' && COLOR_PATTERN.test(value);

/** What a captured family name that fails the pattern is called in notes: the value itself is never repeated. */
export const UNSAFE_FAMILY_LABEL = 'a family name with unsafe characters';
/** The name as written in notes and evidence: itself when safe, else the label. */
export const familyLabel = (name) => (isSafeFamily(name) ? name : UNSAFE_FAMILY_LABEL);

/** Every problem in a style's (or brand half's) font families and colours, as readable sentences; [] when clean. */
export function unsafeStyleValues(style) {
  const problems = [];
  for (const [role, face] of Object.entries(style?.type ?? {})) {
    if (!isSafeFamily(face?.family)) problems.push(`type.${role}.family ${JSON.stringify(face?.family)} is not allowed: a font family is 1 to 64 letters, digits, spaces, dots, apostrophes, underscores or hyphens`);
  }
  for (const [role, value] of Object.entries(style?.color ?? {})) {
    if (!isColor(value)) problems.push(`color.${role} ${JSON.stringify(value)} is not a hex colour (#rgb, #rrggbb or #rrggbbaa)`);
  }
  return problems;
}
