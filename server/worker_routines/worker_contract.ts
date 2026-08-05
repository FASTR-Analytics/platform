// Shared worker-contract helpers (PLAN_DHIS2_IMPORTER_CONSOLIDATION A4):
// the failure-mode knowledge from the DHIS2 run worker reviews (throttled
// status-guarded progress writes, bounded error text) lives once, consumed by
// every import-run worker. The READY handshake is already shared
// (instantiate_worker_generic.ts) — not duplicated here.

export const PROGRESS_WRITE_INTERVAL_MS = 2000;

// Progress writes are throttled (the row is polled at 2 s — writing faster
// is waste) and must be status-guarded by the caller's `write` (never
// resurrect progress on a cancelled/errored run). Write failures are logged,
// never thrown — progress is best-effort.
export function createThrottledProgressWriter<T>(
  intervalMs: number,
  write: (value: T) => Promise<void>,
): (value: T, force: boolean) => Promise<void> {
  let lastWriteMs = 0;
  return async (value: T, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastWriteMs < intervalMs) {
      return;
    }
    lastWriteMs = now;
    try {
      await write(value);
    } catch (e) {
      console.error("Failed to write worker progress:", e);
    }
  };
}

// Error text stored on a run row is bounded — a runaway message (an embedded
// response body, a huge stack) must not bloat the polled runs list.
export function truncateWorkerError(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 1000);
}
