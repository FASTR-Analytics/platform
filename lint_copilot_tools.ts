#!/usr/bin/env -S deno run -c deno.json --allow-all
// Copilot tools lint: every tool the chat registers is built here, by
// panther's createAITool, so a tool it refuses (an open input object, a
// schema with no object at its root, an empty gate) fails the typecheck. The
// same refusal otherwise first runs when the shell mounts in a browser,
// which no gate does.
//
// A tool the browser runs states its contract in lib
// (lib/ai_tools/copilot_catalogue.ts) and its createAITool call in the client
// takes that contract and adds what runs. This lint builds every contract,
// builds the tools lib itself holds whole, and reads the client's calls: each
// takes one contract, states none of a contract's fields, and no contract is
// taken twice or left untaken.
//
// Run: deno task lint:copilot-tools

import { type AIToolKind, createAITool } from "@timroberton/panther";
import type { z } from "zod";
import {
  COPILOT_SHARED_GATED_TOOLS,
  COPILOT_TOOL_CONTRACT_NAMES,
  COPILOT_TOOL_VIEWS,
  type CopilotClientToolName,
  copilotToolContract,
  EMPTY_HFA_TAXONOMY,
  getSharedToolsForMetrics,
  getSharedToolsForReferenceDocs,
  REFERENCE_DOCS,
} from "lib";

const CONTRACT_FIELDS = [
  "name",
  "description",
  "kind",
  "inputSchema",
  "availableIn",
];

type ErasedContract = {
  name: string;
  description: string;
  kind: AIToolKind;
  inputSchema: z.ZodType;
  availableIn: readonly string[];
};

function neverRun(): never {
  throw new Error("lint_copilot_tools builds tools and runs none");
}

function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const problems: string[] = [];

const shared = new Set<string>(COPILOT_SHARED_GATED_TOOLS);
const browserRun = new Set(
  Object.keys(COPILOT_TOOL_VIEWS).filter((name) => !shared.has(name)),
);
for (const name of COPILOT_TOOL_CONTRACT_NAMES) {
  if (!browserRun.has(name)) {
    problems.push(
      `lib/ai_tools: a contract is stated for "${name}", which the catalogue does not gate as a tool the browser runs.`,
    );
  }
}

for (const name of COPILOT_TOOL_CONTRACT_NAMES) {
  if (!browserRun.has(name)) continue;
  const contract: ErasedContract = copilotToolContract(
    name as CopilotClientToolName,
  );
  try {
    createAITool({ ...contract, handler: neverRun });
  } catch (e) {
    problems.push(`lib/ai_tools: ${reason(e)}`);
  }
}

try {
  const built = getSharedToolsForMetrics(
    { getItems: neverRun, getResultsValueInfo: neverRun },
    [],
    [],
    [],
    [],
    structuredClone(EMPTY_HFA_TAXONOMY),
  ).map((tool) => tool.sdkTool.name);
  if (built.join() !== COPILOT_SHARED_GATED_TOOLS.join()) {
    problems.push(
      `lib/ai_tools/tools_metrics.ts builds ${
        built.join(", ")
      }, and the catalogue's COPILOT_SHARED_GATED_TOOLS names ${
        COPILOT_SHARED_GATED_TOOLS.join(", ")
      }.`,
    );
  }
} catch (e) {
  problems.push(`lib/ai_tools/tools_metrics.ts: ${reason(e)}`);
}

try {
  getSharedToolsForReferenceDocs(REFERENCE_DOCS, { instance: neverRun });
} catch (e) {
  problems.push(`lib/ai_tools/tools_reference_docs.ts: ${reason(e)}`);
}

async function clientToolFiles(): Promise<string[]> {
  const out = await new Deno.Command("git", {
    args: ["grep", "-l", "createAITool(", "--", "client/src"],
    stdout: "piped",
  }).output();
  return new TextDecoder().decode(out.stdout).split("\n").filter(Boolean);
}

// The lines that open a property of the call's config: `deno fmt` puts each
// at one indentation, two spaces in from the line that closes the call.
function configPropertyLines(afterCall: string): string[] | undefined {
  const lines = afterCall.split("\n");
  if (lines[0].trim() !== "{") return undefined;
  const indent = lines[1].length - lines[1].trimStart().length;
  const closing = `${" ".repeat(indent - 2)}})`;
  const end = lines.findIndex((line) => line.startsWith(closing));
  const own = `${" ".repeat(indent)}`;
  return lines.slice(1, end < 0 ? undefined : end).filter((line) =>
    line.startsWith(own) && line[indent] !== " "
  ).map((line) => line.trim());
}

const taken = new Map<string, string>();
for (const file of await clientToolFiles()) {
  const calls = (await Deno.readTextFile(file)).split("createAITool(").slice(1);
  for (const call of calls) {
    const properties = configPropertyLines(call);
    if (properties === undefined) {
      problems.push(
        `${file}: a createAITool call whose config is not an object written over its own lines.`,
      );
      continue;
    }
    const names = properties.flatMap((line) => {
      const name = line.match(/^\.\.\.copilotToolContract\("([^"]+)"\),$/)?.[1];
      return name === undefined ? [] : [name];
    });
    if (names.length !== 1) {
      problems.push(
        `${file}: a createAITool call that takes ${names.length} contracts. A tool the browser runs states its contract in lib/ai_tools and takes it with ...copilotToolContract("<name>").`,
      );
      continue;
    }
    const [name] = names;
    for (const field of CONTRACT_FIELDS) {
      if (properties.some((line) => line.startsWith(`${field}:`))) {
        problems.push(
          `${file}: ${name} states its own ${field}. It belongs in the tool's contract in lib/ai_tools.`,
        );
      }
    }
    const first = taken.get(name);
    if (first !== undefined) {
      problems.push(
        `${file}: ${name} is built a second time (first in ${first}).`,
      );
    }
    taken.set(name, file);
  }
}
for (const name of COPILOT_TOOL_CONTRACT_NAMES) {
  if (!taken.has(name)) {
    problems.push(
      `lib/ai_tools: the contract of "${name}" is taken by no createAITool call in client/src.`,
    );
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  console.error(`\nFAIL: ${problems.length} copilot tool problem(s).`);
  Deno.exit(1);
}
console.log(
  `OK: ${COPILOT_TOOL_CONTRACT_NAMES.length} copilot tool contracts built, each taken once; the lib tools built.`,
);
