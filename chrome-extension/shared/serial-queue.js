// A minimal serial task queue: tasks run one at a time, in submission order.
// A failing task rejects to its own caller but does NOT break the chain - the
// next queued task still runs. Used to serialize start/stop of recording so
// overlapping messages can never run two pipelines concurrently.
export function createSerialQueue() {
  let chain = Promise.resolve();

  return function enqueue(task) {
    // Run `task` whether the previous task fulfilled or rejected.
    const result = chain.then(task, task);
    // Keep the chain alive regardless of this task's outcome.
    chain = result.then(
      () => {},
      () => {},
    );
    return result;
  };
}
