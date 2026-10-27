import { REFERENCE_DOCS, type ReferenceDocEntry } from "lib";

// SPA-only reference documents: recipes that presuppose the copilot's
// authoring tools (reports, slides). Same file convention as the shared
// catalog (lib/ai_tools/reference_catalog.ts): the markdown lives in
// client/public/info/.
const CLIENT_REFERENCE_DOCS: ReferenceDocEntry[] = [
  {
    id: "iceh-equity-profile",
    title: "ICEH equity profile report recipe",
    description:
      "Step-by-step recipe for building an ICEH/Countdown equity profile as a report from the results package's ICEH survey data.",
    readWhen: "when asked to create an ICEH equity profile",
    dataset: "iceh",
  },
];

export const SPA_REFERENCE_DOCS: ReferenceDocEntry[] = [
  ...REFERENCE_DOCS,
  ...CLIENT_REFERENCE_DOCS,
];
