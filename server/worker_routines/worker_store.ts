// Global storage for active worker references
// Separate workers for HMIS and HFA datasets

let hmisWorker: Worker | null = null;
let hfaWorker: Worker | null = null;

// HMIS worker functions
export function setHmisWorker(worker: Worker | null): void {
  hmisWorker = worker;
}

export function getHmisWorker(): Worker | null {
  return hmisWorker;
}

// HFA worker functions
export function setHfaWorker(worker: Worker | null): void {
  hfaWorker = worker;
}

export function getHfaWorker(): Worker | null {
  return hfaWorker;
}
