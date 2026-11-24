// Every chat tool labels its call in the chat in the app's words: an
// in-progress label and, unless it draws its own display, a success label,
// each through t3 with en, fr and pt, and in English the verbs of its kind.
// A tool without one shows panther's default, its code name. The tools are
// client code the server tests cannot import, so this reads the sources.
//
//   deno test -A --no-check server/tests/copilot_tool_labels_test.ts

import { assert, assertEquals } from "@std/assert";
import {
  COPILOT_CHAT_WIDE_TOOLS,
  COPILOT_TOOL_CONTRACT_NAMES,
  COPILOT_TOOL_VIEWS,
  type CopilotClientToolName,
  copilotToolContract,
} from "lib";

const ROOT = new URL("../../", import.meta.url);

// The chat's tools this app defines; ask_user_questions is panther's own.
const PANTHER_TOOLS = new Set(["ask_user_questions"]);

type ToolSource = { name: string; file: string; text: string; block: string };

async function toolSources(): Promise<ToolSource[]> {
  const out = await new Deno.Command("git", {
    args: ["grep", "-l", "createAITool(", "--", "client/src", "lib"],
    cwd: ROOT,
    stdout: "piped",
  }).output();
  const files = new TextDecoder().decode(out.stdout).trim().split("\n");
  return files.flatMap((file) => {
    const text = Deno.readTextFileSync(new URL(file, ROOT));
    return text.split("createAITool(").slice(1).map((block) => {
      const named = block.match(
        /\.\.\.copilotToolContract\("([^"]+)"\)|\bname:\s*"([^"]+)"/,
      );
      const name = named?.[1] ?? named?.[2];
      assert(name, `${file}: a createAITool call with no literal name`);
      return { name, file, text, block };
    });
  });
}

// A tool the browser runs states its kind in its contract; a tool lib builds
// whole states it in its call.
function kindOf(tool: ToolSource): string | undefined {
  return COPILOT_TOOL_CONTRACT_NAMES.includes(tool.name)
    ? copilotToolContract(tool.name as CopilotClientToolName).kind
    : tool.block.match(/\bkind:\s*"([a-z]+)"/)?.[1];
}

// The text of a property, from its key to the next property at its
// indentation or the first line indented less.
function property(block: string, key: string): string | undefined {
  const match = block.match(new RegExp(`\\n( +)${key}:`));
  if (match === null || match.index === undefined) return undefined;
  const indent = match[1].length;
  const lines = block.slice(match.index + 1).split("\n");
  const end = lines.findIndex((line, i) => {
    if (i === 0 || line.trim() === "") return false;
    const lead = line.length - line.trimStart().length;
    return lead < indent || (lead === indent && /^\s*[a-zA-Z]+:/.test(line));
  });
  return lines.slice(0, end < 0 ? undefined : end).join("\n");
}

// The string literal after `key:` in `text`, quotes stripped.
function literalAfter(text: string, key: string): string | undefined {
  const at = text.search(new RegExp(`\\b${key}:\\s*["\`]`));
  if (at < 0) return undefined;
  const open = text.indexOf(text.slice(at).match(/["`]/)![0], at);
  const quote = text[open];
  const close = text.indexOf(quote, open + 1);
  return text.slice(open + 1, close);
}

// A label's t3 text in each language: written in the label, or a
// TranslatableString constant of the same file the label passes to t3.
function labelTexts(
  tool: ToolSource,
  label: string,
): { en?: string; fr?: string; pt?: string } {
  const named = label.match(/\bt3\(([A-Z_]+)\)/)?.[1];
  const source = named === undefined ? label : (() => {
    const start = tool.text.indexOf(`const ${named}: TranslatableString = {`);
    assert(start >= 0, `${tool.name}: no constant ${named} in ${tool.file}`);
    return tool.text.slice(start, tool.text.indexOf("};", start));
  })();
  return {
    en: literalAfter(source, "en"),
    fr: literalAfter(source, "fr"),
    pt: literalAfter(source, "pt"),
  };
}

const tools = await toolSources();

Deno.test("the sources define every chat tool the catalogue names, once", () => {
  assertEquals(
    tools.map((t) => t.name).toSorted(),
    [...Object.keys(COPILOT_TOOL_VIEWS), ...COPILOT_CHAT_WIDE_TOOLS]
      .filter((n) => !PANTHER_TOOLS.has(n))
      .toSorted(),
  );
});

Deno.test("every tool declares its labels through t3 in en, fr and pt", () => {
  for (const tool of tools) {
    assert(
      property(tool.block, "completionMessage") === undefined,
      `${tool.name}: completionMessage, where successMessage is the label`,
    );
    const ownsDisplay = property(tool.block, "displayComponent") !== undefined;
    const labels = {
      inProgressLabel: property(tool.block, "inProgressLabel"),
      successMessage: property(tool.block, "successMessage"),
    };
    assert(labels.inProgressLabel, `${tool.name}: no inProgressLabel`);
    if (ownsDisplay) {
      assert(
        labels.successMessage === undefined,
        `${tool.name}: a successMessage the chat never shows, since the tool draws its own display`,
      );
    } else {
      assert(labels.successMessage, `${tool.name}: no successMessage`);
    }
    for (const [key, label] of Object.entries(labels)) {
      if (label === undefined) continue;
      assert(label.includes("t3("), `${tool.name}: ${key} is not through t3`);
      const texts = labelTexts(tool, label);
      for (const lang of ["en", "fr", "pt"] as const) {
        assert(texts[lang], `${tool.name}: ${key} has no ${lang} text`);
      }
    }
  }
});

Deno.test("every tool's English labels use the verbs of its kind", () => {
  for (const tool of tools) {
    const progress = labelTexts(tool, property(tool.block, "inProgressLabel")!)
      .en!;
    const successLabel = property(tool.block, "successMessage");
    const success = successLabel === undefined
      ? undefined
      : labelTexts(tool, successLabel).en!;
    assert(
      progress.endsWith("..."),
      `${tool.name}: "${progress}" does not end with "..."`,
    );
    assert(
      success === undefined || !success.endsWith("..."),
      `${tool.name}: "${success}" ends with "..."`,
    );
    const asksApproval = property(tool.block, "approval") !== undefined;
    const isRead = kindOf(tool) === "read" &&
      property(tool.block, "displayComponent") === undefined;
    const [progressVerb, successVerb]: [RegExp, RegExp] = asksApproval
      ? [/^Proposing /, /^Not proposed/]
      : isRead
      ? [/^Getting /, /^Retrieved /]
      : [/^[A-Z][a-z]+ing /, /^[A-Z][a-z]+ed /];
    assert(
      progressVerb.test(progress),
      `${tool.name}: "${progress}" does not match ${progressVerb}`,
    );
    assert(
      success === undefined || successVerb.test(success),
      `${tool.name}: "${success}" does not match ${successVerb}`,
    );
  }
});
