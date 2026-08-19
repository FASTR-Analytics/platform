import { INFO_TOPICS, type InfoCatalogTopic } from "lib";

// SPA-only get_info topics: recipes that presuppose the copilot's authoring
// tools (reports, slides). Same file convention as the shared catalog
// (lib/ai_tools/info_catalog.ts): the markdown lives in client/public/info/.
const CLIENT_INFO_TOPICS: InfoCatalogTopic[] = [
  {
    topic: "iceh-equity-profile",
    title: "ICEH equity profile — report recipe",
    description:
      "Step-by-step recipe for building an ICEH/Countdown equity profile as a report from the instance's imported survey data. Load when asked to create an ICEH equity profile.",
  },
];

// The one list the SPA hands to BOTH getSharedToolsForInfo (the tool's
// whitelist) and buildSystemPrompt (the prompt's reference-docs section), so
// the two can never diverge.
export const SPA_INFO_TOPICS: InfoCatalogTopic[] = [
  ...INFO_TOPICS,
  ...CLIENT_INFO_TOPICS,
];
