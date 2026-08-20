import { z } from "zod";
import { route } from "../route-utils.ts";

// Folder ids are uuids (unlike product and slide ids).
const folderIdParamsSchema = z.object({ folder_id: z.uuid() });

// Folders nest via `parentId` (adjacency list, no depth cap). A move is
// `updateFolder` — label, colour and parent are one metadata write; the server
// refuses cycles with a typed failure. `folders` has no sort_order and no
// description — both were columns with no live writer.
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
  }),

  updateFolder: route({
    path: "/folders/:folder_id",
    method: "PUT",
    params: folderIdParamsSchema,
    body: z.object({
      label: z.string(),
      color: z.string().nullable(),
      parentId: z.uuid().nullable(),
    }),
    response: {} as { lastUpdated: string },
  }),

  // Child folders and products reparent one level up, never cascade; the freed
  // product ids come back so the caller can emit products_upserted for them.
  deleteFolder: route({
    path: "/folders/:folder_id",
    method: "DELETE",
    params: folderIdParamsSchema,
    response: {} as { freedProductIds: string[] },
  }),
} as const;
