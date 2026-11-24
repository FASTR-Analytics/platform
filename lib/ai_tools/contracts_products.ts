import { z } from "zod";
import { AI_RECORD_PAGE_MAX } from "./read_bounds.ts";

// The Products page tool's contract: see copilot_catalogue.ts.

export const PRODUCTS_TOOL_CONTRACTS = {
  list_products: {
    description:
      `List the products (slide decks, reports and saved visualizations) the user can see, ${AI_RECORD_PAGE_MAX} a call, by folder then label, each with its folder, the results package and scope it renders from, and the user's access level on it (view, edit or own). The count line states how many products match, how many exist, which are written and the offset of the next page. The user opens a product from the Products page; once it is open, its reading and editing tools become available.`,
    kind: "read",
    inputSchema: z.strictObject({
      search: z.string().optional().describe(
        "Only products whose label, type, folder path, package label and scope label together contain every word of this text, in any order (case- and accent-insensitive).",
      ),
      offset: z.number().int().min(0).optional().describe(
        "Optional: how many of the matching products to skip. Each page names the offset of the next.",
      ),
    }),
  },
} as const;
