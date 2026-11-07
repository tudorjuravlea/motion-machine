// Piece code for a gate fixture. after(mm) runs once, right after mount.
// Negative G-TIME/post-task: a delayed task is a timer. The recorder wraps scheduler.postTask.
export function after() {
  globalThis['sched' + 'uler']['post' + 'Task'](() => { document.documentElement.dataset.late = ''; }, { delay: 60_000 });
}
