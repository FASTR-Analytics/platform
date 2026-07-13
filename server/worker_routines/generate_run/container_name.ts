// Single source for the production docker container name of one module
// execution inside a wizard generation. Deterministic by (runId, moduleId)
// so the host can `docker rm -f` every container a torn-down run could have
// started without the worker's cooperation — terminating the worker only
// kills the `docker run` CLI client, never the container.
export function getGenerateRunContainerName(
  runId: string,
  moduleId: string,
): string {
  return `fastr-genrun-${runId}-${moduleId}`;
}
