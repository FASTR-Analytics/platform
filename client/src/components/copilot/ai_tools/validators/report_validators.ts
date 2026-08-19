import type { FigureBlock, ImageBlock } from "lib";
import { AIToolFailure } from "panther";

const EMBED_TOKEN_RE = /!\[[^\]]*\]\((figure|image):([^)\s]+)\)/g;

// Every figure:/image: token in the markdown must resolve in the registry — the
// AI may only reference existing embed ids (it does not create figures here).
// Throws (the AI tool surfaces the message) so a broken token is never staged.
export function validateReportTokensResolve(
  markdown: string,
  figures: Record<string, FigureBlock>,
  images: Record<string, ImageBlock>,
): void {
  const unresolved: string[] = [];
  let m: RegExpExecArray | null;
  EMBED_TOKEN_RE.lastIndex = 0;
  while ((m = EMBED_TOKEN_RE.exec(markdown)) !== null) {
    const kind = m[1];
    const id = m[2];
    if (kind === "figure" && !figures[id]) unresolved.push(`figure:${id}`);
    if (kind === "image" && !images[id]) unresolved.push(`image:${id}`);
  }
  if (unresolved.length > 0) {
    throw new AIToolFailure(
      `Unresolved embed token(s): ${unresolved.join(", ")}. Only reference figure/image ids that already exist (call get_report_editor to list them); do not invent ids.`,
    );
  }
}

const MAX_BODY_LENGTH = 200_000;

export function validateReportBodyLength(markdown: string): void {
  if (markdown.length > MAX_BODY_LENGTH) {
    throw new AIToolFailure(
      `Report body is too long (${markdown.length} chars; max ${MAX_BODY_LENGTH}).`,
    );
  }
}
