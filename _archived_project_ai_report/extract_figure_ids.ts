// Updated regex to capture optional :suffix after UUID
const FIGURE_REGEX =
  /!\[[^\]]*\]\((figure:\/\/)?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(:[^\)]+)?\)/gi;

export type ExtractedFigure = {
  uuid: string;
  replicantValue?: string;
  fullRef: string; // "uuid" or "uuid:value" for map key
};

export function extractFiguresFromMarkdown(markdown: string): ExtractedFigure[] {
  const figures: ExtractedFigure[] = [];
  const seen = new Set<string>();
  let match;

  // Reset regex lastIndex for reuse
  FIGURE_REGEX.lastIndex = 0;

  while ((match = FIGURE_REGEX.exec(markdown)) !== null) {
    const uuid = match[2];
    const suffix = match[3]?.slice(1); // Remove leading ':'
    const fullRef = suffix ? `${uuid}:${suffix}` : uuid;

    // Dedupe by fullRef
    if (!seen.has(fullRef)) {
      seen.add(fullRef);
      figures.push({
        uuid,
        replicantValue: suffix,
        fullRef,
      });
    }
  }

  return figures;
}

// Backward compatibility: return just UUIDs (deduped)
export function extractFigureIdsFromMarkdown(markdown: string): string[] {
  const figures = extractFiguresFromMarkdown(markdown);
  return [...new Set(figures.map((f) => f.uuid))];
}
