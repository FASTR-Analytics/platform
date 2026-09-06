import { z } from "zod";
import type {
  PopulationImportPreview,
  PopulationImportResult,
  PopulationTypeStore,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const populationTypeIdSchema = z.string().min(1);

export const populationRouteRegistry = {
  // Refused while any population row exists.
  setPopulationLevel: route({
    path: "/population/level",
    method: "POST",
    body: z.object({ level: z.union([z.literal(2), z.literal(3), z.literal(4)]) }),
  }),
  // One type's values as the grid shows them: structure areas down, years
  // across, stale areas appended.
  getPopulationTypeStore: route({
    path: "/population/type_store",
    method: "POST",
    body: z.object({ populationType: populationTypeIdSchema }),
    response: {} as PopulationTypeStore,
  }),
  // Read-only: what the store would look like after the file is upserted.
  previewPopulationCsv: route({
    path: "/population/import/preview",
    method: "POST",
    body: z.object({ assetFileName: z.string() }),
    response: {} as PopulationImportPreview,
  }),
  // Refused when the upsert leaves a touched type incomplete unless
  // confirmIncomplete is true: the preview is where the user sees why.
  importPopulationCsv: route({
    path: "/population/import",
    method: "POST",
    body: z.object({
      assetFileName: z.string(),
      confirmIncomplete: z.boolean(),
    }),
    response: {} as PopulationImportResult,
  }),
  deletePopulationTypeData: route({
    path: "/population/delete_type_data",
    method: "POST",
    body: z.object({ populationType: populationTypeIdSchema }),
  }),
  deleteAllPopulation: route({
    path: "/population",
    method: "DELETE",
  }),
} as const;
