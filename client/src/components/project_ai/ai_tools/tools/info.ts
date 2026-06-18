import { createAITool } from "panther";
import { z } from "zod";
import { INFO_TOPICS } from "../../info_catalog";

// On-demand reference docs. The catalog (INFO_TOPICS) is a compile-time const so
// the system prompt and this tool share one source of truth with no fetch; only
// the markdown CONTENT is fetched on demand from client/public/info/<topic>.md
// when a topic is actually requested. Matching against INFO_TOPICS also whitelists
// the fetch path (no traversal, never serves the SPA fallback).
export function getToolsForInfo() {
  return [
    createAITool({
      name: "get_info",
      description:
        "Load on-demand reference documentation maintained by the app (data models, methods, definitions, caveats). Call with no argument to list available topics; call with a topic id to get its full markdown content. Load the relevant topic before building domain-specific reports (for example, load 'iceh' before creating an ICEH equity profile).",
      inputSchema: z.object({
        topic: z
          .string()
          .optional()
          .describe(
            "Topic id to load (e.g. 'iceh'). Omit to list all available topics.",
          ),
      }),
      handler: async (input) => {
        if (!input.topic) {
          return { availableTopics: INFO_TOPICS };
        }
        const match = INFO_TOPICS.find((t) => t.topic === input.topic);
        if (!match) {
          throw new Error(
            `Unknown info topic "${input.topic}". Available: ${INFO_TOPICS.map(
              (t) => t.topic,
            ).join(", ")}.`,
          );
        }
        const response = await fetch(`/info/${match.topic}.md`, {
          cache: "no-cache",
        });
        if (!response.ok) {
          throw new Error(
            `Could not load info "${input.topic}" (${response.status}).`,
          );
        }
        return await response.text();
      },
      inProgressLabel: (input) =>
        input.topic
          ? `Loading "${input.topic}" reference...`
          : "Listing reference topics...",
      completionMessage: (input) =>
        input.topic
          ? `Loaded "${input.topic}" reference`
          : "Listed reference topics",
    }),
  ];
}
