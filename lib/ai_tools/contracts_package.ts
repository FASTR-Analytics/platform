import { z } from "zod";
import {
  AI_TEXT_LINE_MAX_CHARS,
  AI_TEXT_WINDOW_MAX_CHARS,
} from "./read_bounds.ts";

// The module tools' contracts: see copilot_catalogue.ts.

const ModuleFileQuerySchema = z.strictObject({
  id: z.string().describe("Module ID"),
  fromLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "Optional: the first line to write. Each result names the fromLine of its next window.",
    ),
  search: z
    .array(z.string())
    .min(1)
    .optional()
    .describe(
      "Optional: terms to find lines by. A line matches when it holds every word of one term, case and accents ignored. The matching lines are written with their numbers, from fromLine when given.",
    ),
});

const WINDOW =
  `One window a call: whole lines, at most ${AI_TEXT_WINDOW_MAX_CHARS} characters, a line over ${AI_TEXT_LINE_MAX_CHARS} cut with its length stated. Each result opens with the file's line and character counts and the lines it writes.`;

export const PACKAGE_TOOL_CONTRACTS = {
  get_available_modules: {
    description: "Get a list of the analysis modules in the results package",
    kind: "read",
    inputSchema: z.strictObject({}),
  },

  get_module_r_script: {
    description:
      `Get the R script for a specific module. ${WINDOW} With neither fromLine nor search, the window starts at the first line, and the result names the fromLine that reads on. search finds the lines that hold a term.`,
    kind: "read",
    inputSchema: ModuleFileQuerySchema,
  },

  get_module_log: {
    description:
      `Get the log file for a module that has recently run. This is useful for debugging errors or explaining why a module hasn't run. ${WINDOW} With neither fromLine nor search, the window ends at the last line, where an error is written; fromLine reads from an earlier line on. search finds the lines that hold a term, such as "error" or "warning".`,
    kind: "read",
    inputSchema: ModuleFileQuerySchema,
  },

  get_module_settings: {
    description:
      "Get the configuration settings and parameters for a specific module. This shows what options are selected for the module.",
    kind: "read",
    inputSchema: z.strictObject({ id: z.string().describe("Module ID") }),
  },
} as const;
