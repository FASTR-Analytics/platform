import { createAITool } from "panther";
import { z } from "zod";

// On-demand reference docs shipped as static assets under client/public/info/.
// index.json is the catalog; each topic maps to client/public/info/<topic>.md.
// Matching a requested topic against the catalog also whitelists the fetch path
// (no path traversal possible).
type InfoTopic = { topic: string; title: string; description: string };

async function loadInfoIndex(): Promise<InfoTopic[]> {
  const response = await fetch("/info/index.json", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Could not load info index (${response.status})`);
  }
  const data = (await response.json()) as { topics: InfoTopic[] };
  return data.topics;
}

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
        const topics = await loadInfoIndex();
        if (!input.topic) {
          return { availableTopics: topics };
        }
        const match = topics.find((t) => t.topic === input.topic);
        if (!match) {
          throw new Error(
            `Unknown info topic "${input.topic}". Available: ${topics
              .map((t) => t.topic)
              .join(", ")}.`,
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
