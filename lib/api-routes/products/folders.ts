import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import { route } from "../route-utils.ts";
import { productAccessBodySchema } from "./products.ts";

// Folder ids are uuids (unlike product and slide ids).
const folderIdParamsSchema = z.object({ folder_id: z.uuid() });

// Folders nest through `parentId` (adjacency list, no depth cap). Each write
// carries only what it changes, so a rename and a move cannot undo one
// another: `moveFolder` writes the parent and refuses a cycle with the typed
// FOLDER_CYCLE failure; `updateFolder` writes label and colour.
export const folderRouteRegistry = {
  createFolder: route({
    path: "/folders",
    method: "POST",
    guard: GUARD.folder("edit"),
    body: z.object({
      label: z.string(),
      color: z.string().nullable(),
      parentId: z.uuid().nullable(),
    }),
    response: {} as { folderId: string; lastUpdated: string },
  }),

  updateFolder: route({
    path: "/folders/:folder_id",
    method: "PUT",
    guard: GUARD.folder("edit"),
    params: folderIdParamsSchema,
    body: z.object({
      label: z.string(),
      color: z.string().nullable(),
    }),
    response: {} as { lastUpdated: string },
  }),

  moveFolder: route({
    path: "/folders/:folder_id/parent",
    method: "PUT",
    guard: GUARD.folder("edit"),
    params: folderIdParamsSchema,
    body: z.object({ parentId: z.uuid().nullable() }),
    response: {} as { lastUpdated: string },
  }),

  // Child folders and products reparent one level up, never cascade; the
  // freed product ids come back because their rows changed. A folder has no
  // owner, so any user who may change folders may delete one.
  deleteFolder: route({
    path: "/folders/:folder_id",
    method: "DELETE",
    guard: GUARD.folder("edit"),
    params: folderIdParamsSchema,
    response: {} as { freedProductIds: string[] },
  }),

  // The bulk action: raises access on every product in the folder and
  // its subfolders, in one transaction, and never lowers it. `own` on a
  // folder route means a global admin: nobody else owns a folder. Refuses an
  // email with no users row and a list naming one email twice.
  setFolderProductsAccess: route({
    path: "/folders/:folder_id/products/access",
    method: "PUT",
    guard: GUARD.folder("own"),
    params: folderIdParamsSchema,
    body: productAccessBodySchema,
    response: {} as { productIds: string[] },
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
