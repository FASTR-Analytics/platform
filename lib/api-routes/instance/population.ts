import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import {
  adminAreaLevelSchema,
  type PopulationImportPreview,
  type PopulationImportResult,
  type PopulationTypeStore,
} from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const populationTypeIdSchema = z.string().min(1);

export const populationRouteRegistry = {
  setPopulationLevel: route({
    path: "/population/level",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ level: adminAreaLevelSchema }),
  }),
  getPopulationTypeStore: route({
    path: "/population/type_store",
    method: "POST",
    guard: GUARD.permission("can_view_data"),
    body: z.object({ populationType: populationTypeIdSchema }),
    response: {} as PopulationTypeStore,
  }),
  previewPopulationCsv: route({
    path: "/population/import/preview",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ assetFileName: z.string() }),
    response: {} as PopulationImportPreview,
  }),
  // Refused when the upsert leaves a touched type incomplete unless
  // confirmIncomplete is true: the preview is where the user sees why.
  importPopulationCsv: route({
    path: "/population/import",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({
      assetFileName: z.string(),
      confirmIncomplete: z.boolean(),
    }),
    response: {} as PopulationImportResult,
  }),
  deletePopulationTypeData: route({
    path: "/population/delete_type_data",
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    body: z.object({ populationType: populationTypeIdSchema }),
  }),
  deleteAllPopulation: route({
    path: "/population",
    method: "DELETE",
    guard: GUARD.permission("can_configure_data"),
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
