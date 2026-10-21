// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-TIME/smil: SMIL animation runs on the document's clock, not on seek(t).
export function after() {
  const host = document.querySelector('[data-scene="style"] .title-stack');
  host.insertAdjacentHTML('beforeend', '<svg data-keep width="10" height="10" style="position:absolute;left:0;top:0"><rect width="10" height="10" fill="none"><set attributeName="opacity" to="0" begin="60s"/></rect></svg>');
}
