export type InfoCatalogTopic = {
  topic: string;
  title: string;
  description: string;
};

// Source of truth for on-demand reference docs. Each topic maps to a markdown
// file served as a static asset at /info/<topic>.md (client/public/info/). This
// catalog is surfaced in the AI system prompt and whitelists the get_info tool's
// fetch path. Add a topic: drop a markdown file in client/public/info/ and add an
// entry here.
export const INFO_TOPICS: InfoCatalogTopic[] = [
  {
    topic: "iceh",
    title: "ICEH data & analyses",
    description:
      "ICEH/Countdown survey data: data model, stratifiers, the CCI, and the wealth-inequality measures (definitions, methods, fidelity caveats).",
  },
  {
    topic: "iceh-equity-profile",
    title: "ICEH equity profile — report recipe",
    description:
      "Step-by-step recipe for building an ICEH/Countdown equity profile as a report from a project's imported survey data. Load when asked to create an ICEH equity profile.",
  },
];
