// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-DETERMINISM/scene: the third scene's layout is offset by fresh random key bytes, which
// differ on every load. Only that scene changes, so the old three instants (first frame, first
// mid-entrance, last rest) miss it; one instant per scene catches it.
// The recorder watches performance.timeOrigin, so this fixture draws on a source G-TIME
// deliberately leaves to this backstop: a Web Crypto key.
// The offset spans 0-21 px in tenths of a pixel, so two fresh loads collide about once in 211.
export async function after() {
  const key = await crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, true, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.exportKey('raw', key));
  const jitter = (((bytes[0] << 8) | bytes[1]) % 211) / 10;
  document.querySelector('[data-scene="rests"] .title-stack').style.translate = `${jitter.toFixed(3)}px 0`;
}
