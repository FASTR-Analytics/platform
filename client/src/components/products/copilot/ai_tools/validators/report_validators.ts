import type { FigureBlock, ImageBlock } from "lib";
import { AIToolFailure } from "panther";
import {
  checkReportBodyLength,
  checkReportTokensResolve,
} from "report-forge/ai";

// The rules a proposed report body must pass, and the messages a model reads
// when it breaks one, are Report Forge's (report-forge/ai/validators.ts). The
// text tools get them through the package's edit operations; these two wrap
// the same checks as throws for the tools that build a body here (the figure
// tools), so the AI tool surfaces the message and nothing broken is staged.

export function validateReportTokensResolve(
  body: string,
  figures: Record<string, FigureBlock>,
  images: Record<string, ImageBlock>,
): void {
  const error = checkReportTokensResolve(body, {
    figures: Object.keys(figures),
    images: Object.keys(images),
  });
  if (error !== undefined) throw new AIToolFailure(error);
}

export function validateReportBodyLength(body: string): void {
  const error = checkReportBodyLength(body);
  if (error !== undefined) throw new AIToolFailure(error);
}
