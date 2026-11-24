import { z } from "zod";

export const valueFuncStrict = z.enum([
  "SUM",
  "AVG",
  "COUNT",
  "MIN",
  "MAX",
  "identity",
]);
export type ValueFunc = z.infer<typeof valueFuncStrict>;
