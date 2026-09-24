import { z } from "zod";

export const datasetTypeSchema = z.enum(["hmis", "hfa", "iceh"]);
export type DatasetType = z.infer<typeof datasetTypeSchema>;
