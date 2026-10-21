// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-TIME/worker: a worker thread keeps its own clock. The recorder refuses it.
export function after() {
  const W = globalThis['Wor' + 'ker'];
  const w = new W('data:text/javascript,postMessage(1)');
  w.onmessage = () => { document.documentElement.dataset.late = ''; };
}
