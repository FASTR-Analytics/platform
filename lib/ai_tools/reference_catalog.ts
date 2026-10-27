import type { DatasetType } from "../types/datasets.ts";

// One reference document the app ships: its markdown is served as a static
// asset at /info/<id>.md (client/public/info/). `readWhen` is the trigger
// the model sees in the list tool's description and the catalog line, so it
// knows when to read the document before its first call. A document about
// one dataset declares it, and the catalog drops it when the instance holds
// no such data.
export type ReferenceDocEntry = {
  id: string;
  title: string;
  description: string;
  readWhen: string;
  dataset?: DatasetType;
};

// The SHARED documents, exposed on both surfaces (the SPA copilot and /mcp).
// SPA-only documents (recipes that presuppose authoring tools) live in
// client/src/components/instance/copilot/client_reference_docs.ts. Add a
// shared document: drop a markdown file in client/public/info/ and add an
// entry here.
export const REFERENCE_DOCS: ReferenceDocEntry[] = [
  {
    id: "iceh",
    title: "ICEH data & analyses",
    description:
      "ICEH/Countdown survey data: data model, stratifiers, the CCI, and the wealth-inequality measures (definitions, methods, fidelity caveats).",
    readWhen: "before analysing ICEH survey data",
    dataset: "iceh",
  },
];
