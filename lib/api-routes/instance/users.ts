import type { GlobalUser } from "../../types/mod.ts";
import type { UserLog } from "../../../server/db/mod.ts";
import { route } from "../route-utils.ts";

// Route registry for users
export const userRouteRegistry = {
  getCurrentUser: route({
    path: "/user",
    method: "GET",
    response: {} as GlobalUser,
  }),
  getOtherUser: route({
    path: "/user/:email",
    method: "GET",
    params: {} as { email: string },
    response: {} as GlobalUser,
  }),
  addUsers: route({
    path: "/user",
    method: "POST",
    body: {} as { emails: string[]; isGlobalAdmin: boolean },
    response: {} as string[],
  }),
  toggleUserAdmin: route({
    path: "/user/toggle-admin",
    method: "POST",
    body: {} as { emails: string[]; makeAdmin: boolean },
  }),
  deleteUser: route({
    path: "/user",
    method: "DELETE",
    body: {} as { emails: string[] },
  }),
  batchUploadUsers: route({
    path: "/users/batch",
    method: "POST",
    body: {} as { asset_file_name: string; replace_all_existing: boolean },
  }),
  getAllUserLogs: route({
    path: "/all-user-logs",
    method: "GET",
    response: {} as UserLog[],
  })
} as const;
