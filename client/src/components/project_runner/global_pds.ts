import type { ProjectDirtyStates } from "lib";
import { unwrap } from "solid-js/store";

/**
 * Global reference to ProjectDirtyStates for non-reactive async access.
 *
 * This is set by ProjectRunnerProvider and accessed by the cache system.
 * DO NOT use this in components - use useProjectDirtyStates() hook instead.
 *
 * Why this exists:
 * - useContext() can only be called during component setup, not in async functions
 * - Cache operations happen in async contexts (onMount callbacks, event handlers, etc.)
 * - We need access to current PDS without creating reactive tracking dependencies
 *
 * Architecture:
 * - Components: use useProjectDirtyStates() context hook (reactive)
 * - Caches: use getGlobalPDSSnapshot() (non-reactive, works in async)
 * - Provider: sets both context and global reference
 */
let _globalPDSStore: ProjectDirtyStates | null = null;

export function setGlobalPDS(pds: ProjectDirtyStates): void {
  _globalPDSStore = pds;
}

export function getGlobalPDSSnapshot(): ProjectDirtyStates | undefined {
  if (!_globalPDSStore) {
    return undefined;
  }
  // Return unwrapped snapshot to prevent reactive tracking
  return unwrap(_globalPDSStore);
}
