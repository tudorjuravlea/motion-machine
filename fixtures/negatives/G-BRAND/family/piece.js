// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-BRAND/family: script registers a style font file under another family name
// and sets it on the sub lines. The face is local and loads, so G-LOCAL is satisfied; the computed
// font-family no longer starts with a style family, which G-BRAND's family half catches.
export function after() {
  const face = new FontFace('Impostor Sans', `url(${new URL('../../../../styles/fonts/manrope/manrope-latin-400-normal.woff2', import.meta.url)})`);
  document.fonts.add(face);
  face.load();
  for (const el of document.querySelectorAll('.title-stack')) el.style.setProperty('--mm-font-text', "'Impostor Sans', sans-serif");
}
