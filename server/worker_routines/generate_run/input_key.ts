import { createHash } from "node:crypto";

// §3.7 memoization keys (PLAN_RESULTS_RUNS): a module node's inputKey =
// hash(generated script text, sorted content hashes of its declared input
// files — dataset extracts + upstream outputs + assets — and the R image
// tag). Item 2 computes and records keys while forcing every node to run;
// item 3 turns on base-run diffing. A wrong or absent key can only cost a
// wasted re-run, never wrong data — memoization fails closed.

export function sha256HexOfText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// Streamed — module outputs and dataset extracts are multi-GB at Nigeria
// scale, so the whole file never sits in memory.
export async function sha256HexOfFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  const file = await Deno.open(path, { read: true });
  const reader = file.readable.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hash.digest("hex");
}

export function computeModuleInputKey(args: {
  scriptText: string;
  inputs: { name: string; sha256: string }[];
  rImageTag: string;
}): string {
  const lines = [
    `rimage:${args.rImageTag}`,
    `script:${sha256HexOfText(args.scriptText)}`,
    ...args.inputs
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((input) => `${input.name}:${input.sha256}`),
  ];
  return sha256HexOfText(lines.join("\n"));
}
