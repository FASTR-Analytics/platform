import {
  type DraftedReportBackbone,
  type ReportBackboneSource,
  runReportBackboneDraft,
} from "lib";
import { callAIStructured } from "panther";
import { createAiProxyClient } from "~/components/_shared/mod.ts";

// Drafting a report backbone from an example report the person picked on
// their computer: the file goes to the model as it is (a PDF document block,
// sent through the instance's AI proxy, so usage and limits count as any AI
// call's), the shared drafting code (lib/report_backbone_draft.ts) reads it
// into a backbone, and the style editor shows the result for review. Nothing
// is stored until the person saves the style.

// The largest example the browser sends in one request (a district bulletin
// is 1 to 5 MB).
export const REPORT_BACKBONE_EXAMPLE_MAX_BYTES = 20 * 1024 * 1024;

export function reportBackboneSourceOf(
  file: File,
): ReportBackboneSource | undefined {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  return undefined;
}

async function base64Of(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function draftReportBackboneFromFile(
  file: File,
  signal: AbortSignal,
): Promise<DraftedReportBackbone & { source: ReportBackboneSource }> {
  const source = reportBackboneSourceOf(file);
  if (source === undefined) {
    throw new Error("Choose a PDF of the example report.");
  }
  if (file.size > REPORT_BACKBONE_EXAMPLE_MAX_BYTES) {
    throw new Error("The file is larger than 20 MB.");
  }
  const sdkClient = createAiProxyClient();
  const drafted = await runReportBackboneDraft({
    content: [{
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: await base64Of(file),
      },
      title: file.name,
    }],
    call: async (system, content, schema) => {
      const res = await callAIStructured(
        { sdkClient, system: () => system },
        // The blocks are the SDK's own content types, built above.
        [{ role: "user", content: content as never }],
        schema,
        { signal },
      );
      return { data: res.data, stopReason: res.stopReason };
    },
  });
  return { ...drafted, source };
}
