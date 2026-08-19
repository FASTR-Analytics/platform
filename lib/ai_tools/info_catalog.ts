export type InfoCatalogTopic = {
  topic: string;
  title: string;
  description: string;
};

// The SHARED on-demand reference docs — topics both surfaces (SPA copilot,
// /mcp) can act on. Each topic maps to a markdown file served as a static
// asset at /info/<topic>.md (client/public/info/). A surface passes the list
// it exposes to getSharedToolsForInfo (which whitelists the fetch path
// against it) and to buildSystemPrompt (which renders it). SPA-only topics
// (recipes that presuppose authoring tools) live in
// client/src/components/project_ai/ai_tools/client_info_topics.ts. Add a
// shared topic: drop a markdown file in client/public/info/ and add an entry
// here.
export const INFO_TOPICS: InfoCatalogTopic[] = [
  {
    topic: "iceh",
    title: "ICEH data & analyses",
    description:
      "ICEH/Countdown survey data: data model, stratifiers, the CCI, and the wealth-inequality measures (definitions, methods, fidelity caveats).",
  },
];
