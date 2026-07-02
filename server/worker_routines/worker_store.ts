// Active worker per import family (one concurrent import each): set at
// spawn, cleared (null) on completion, crash, or cancel.
const workers = new Map<string, Worker>();

export function setWorker(key: string, worker: Worker | null): void {
  if (worker === null) {
    workers.delete(key);
  } else {
    workers.set(key, worker);
  }
}

export function getWorker(key: string): Worker | null {
  return workers.get(key) ?? null;
}
