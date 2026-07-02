export type WorkerKey = "hmis" | "hfa";

// Active worker per import family (one concurrent import each): stored at
// spawn, cleared on completion, crash, or cancel. clearWorker is
// compare-and-delete so a stale worker's late event cannot clobber a
// successor stored under the same key.
const workers = new Map<WorkerKey, Worker>();

export function setWorker(key: WorkerKey, worker: Worker): void {
  workers.set(key, worker);
}

export function clearWorker(key: WorkerKey, worker: Worker): void {
  if (workers.get(key) === worker) {
    workers.delete(key);
  }
}

export function getWorker(key: WorkerKey): Worker | null {
  return workers.get(key) ?? null;
}
