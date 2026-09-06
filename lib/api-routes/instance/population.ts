import { z } from "zod";
import type {
  PopulationImportPreview,
  PopulationImportResult,
  PopulationTypeInfo,
  PopulationTypeStore,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const populationTypeIdSchema = z.string().min(1);

export const populationRouteRegistry = {
  getPopulationTypes: route({
    path: "/population/types",
    method: "GET",
    response: {} as PopulationTypeInfo[],
  }),
  createPopulationType: route({
    path: "/population/types",
    method: "POST",
    body: z.object({ id: populationTypeIdSchema, label: z.string().min(1) }),
  }),
  updatePopulationType: route({
    path: "/population/types/update",
    method: "POST",
    body: z.object({ id: populationTypeIdSchema, label: z.string().min(1) }),
  }),
  deletePopulationType: route({
    path: "/population/types/delete",
    method: "POST",
    body: z.object({ id: populationTypeIdSchema }),
  }),
  // One type's figures as the grid shows them: structure areas down, years
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
