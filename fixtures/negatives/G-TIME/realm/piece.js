// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-TIME/realm: a fresh iframe's realm has its own, unrecorded timers. The recorder
// refuses the iframe and records the attempt.
export function after() {
  const f = document['create' + 'Element']('ifr' + 'ame');
  f.style.display = 'none';
  document.body.append(f);
  f.contentWindow['set' + 'Timeout'](() => { document.documentElement.dataset.late = ''; }, 60_000);
}
