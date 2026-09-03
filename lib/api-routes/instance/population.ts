import { z } from "zod";
import type {
  PopulationImportResult,
  PopulationRow,
  PopulationTypeInfo,
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
  getPopulationRows: route({
    path: "/population/rows",
    method: "GET",
    response: {} as PopulationRow[],
  }),
  importPopulationCsv: route({
    path: "/population/import",
    method: "POST",
    body: z.object({ assetFileName: z.string() }),
    response: {} as PopulationImportResult,
  }),
  deletePopulationGroup: route({
    path: "/population/delete_group",
    method: "POST",
    body: z.object({
      populationType: populationTypeIdSchema,
      adminAreaLevel: z.number().int(),
    }),
  }),
  deleteAllPopulation: route({
    path: "/population",
    method: "DELETE",
  }),
} as const;
