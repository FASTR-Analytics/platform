import { z } from "zod";
import { type ProductAccessLevel, route } from "../route-utils.ts";
import { productAccessBodySchema } from "./products.ts";

// Folder ids are uuids (unlike product and slide ids).
const folderIdParamsSchema = z.object({ folder_id: z.uuid() });

// Folders nest through `parentId` (adjacency list, no depth cap). Each write
// carries only what it changes, so a rename and a move cannot undo one
// another: `moveFolder` writes the parent and refuses a cycle with the typed
// FOLDER_CYCLE failure; `updateFolder` writes label and colour. Only these
// routes declare `folder_id` or `parentId`, which is how the access guard
// tells a folder route from a product route naming a destination folder.
export const folderRouteRegistry = {
  createFolder: route({
    path: "/folders",
    method: "POST",
    body: z.object({
      label: z.string(),
      color: z.string().nullable(),
      parentId: z.uuid().nullable(),
    }),
    response: {} as { folderId: string; lastUpdated: string },
    access: "edit",
  }),

  updateFolder: route({
    path: "/folders/:folder_id",
    method: "PUT",
    params: folderIdParamsSchema,
    body: z.object({
      label: z.string(),
      color: z.string().nullable(),
    }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  moveFolder: route({
    path: "/folders/:folder_id/parent",
    method: "PUT",
    params: folderIdParamsSchema,
    body: z.object({ parentId: z.uuid().nullable() }),
    response: {} as { lastUpdated: string },
    access: "edit",
  }),

  // Child folders and products reparent one level up, never cascade; the
  // freed product ids come back because their rows changed. A folder has no
  // owner, so any user who may change folders may delete one
  // (PLAN_PRODUCT_OWNERSHIP R5).
  deleteFolder: route({
    path: "/folders/:folder_id",
    method: "DELETE",
    params: folderIdParamsSchema,
    response: {} as { freedProductIds: string[] },
    access: "edit",
  }),

  // The bulk action (R19): raises access on every product in the folder and
  // its subfolders, in one transaction, and never lowers it. `own` on a
  // folder route means a global admin: nobody else owns a folder. Refuses an
  // email with no users row and a list naming one email twice.
  setFolderProductsAccess: route({
    path: "/folders/:folder_id/products/access",
    method: "PUT",
    params: folderIdParamsSchema,
    body: productAccessBodySchema,
    response: {} as { productIds: string[] },
    access: "own",
  }),
} as const satisfies Record<string, { access: ProductAccessLevel }>;
