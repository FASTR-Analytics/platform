// Single source for the production docker container name of a module run.
// The host kills the container by this name when it terminates a run —
// SIGKILL-ing the `docker run` CLI client alone leaves the container executing
// on the daemon.
export function getModuleRunContainerName(
  moduleId: string,
  runToken: string,
): string {
  return `fastr-run-${moduleId}-${runToken}`;
}
