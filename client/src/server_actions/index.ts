import type { ServerActionsType } from "lib";
import { createAllServerActions } from "./create_server_action";
export const _SERVER_HOST =
  process.env.NODE_ENV === "production" ? "" : "http://localhost:8000";

// P2: sentinel layer deleted — bundles carry no undefined values, so
// createAllServerActions() can be used directly.
export const serverActions: ServerActionsType = createAllServerActions();
