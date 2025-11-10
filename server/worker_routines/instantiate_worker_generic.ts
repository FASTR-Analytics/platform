/**
 * Generic function to instantiate a worker with the standard "READY" handshake pattern
 * @param workerPath - Path to the worker file relative to the calling module
 * @param callerUrl - The import.meta.url of the calling module
 * @param data - Data to send to the worker after it's ready
 */
export function instantiateWorker<T>(
  workerPath: string,
  callerUrl: string,
  data: T
): Worker {
  const workerUrl = new URL(workerPath, callerUrl).href;
  const worker = new Worker(workerUrl, {
    type: "module",
  });
  worker.onmessage = (e) => {
    if (e.data === "READY") {
      worker.postMessage(data);
    }
  };
  return worker;
}
