import type { ServerActionsType } from "lib";
import { routeRegistry } from "lib";
import { createServerActionV2 } from "./create-server-action-v2";

// Enhanced server actions creator that supports streaming
export function createAllServerActionsV2(): ServerActionsType {
  const actions: any = {};

  for (const [functionName, route] of Object.entries(routeRegistry)) {
    actions[functionName] = createServerActionV2(
      route.path as any,
      route.method as any,
      (route as any).requiresProject,
      (route as any).isStreaming // New: pass streaming flag
    );
  }

  return actions as ServerActionsType;
}