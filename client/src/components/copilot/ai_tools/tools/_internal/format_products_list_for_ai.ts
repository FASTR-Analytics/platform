import type { SlideDeckSummary } from "lib";

export function formatSlideDecksListForAI(
  slideDecks: SlideDeckSummary[],
): string {
  const lines: string[] = [
    "AVAILABLE SLIDE DECKS",
    "=".repeat(80),
    "",
  ];

  if (slideDecks.length === 0) {
    lines.push("No slide decks available.");
    return lines.join("\n");
  }

  for (const deck of slideDecks) {
    lines.push(`ID: ${deck.id}`);
    lines.push(`Name: ${deck.label}`);
    lines.push("");
  }

  return lines.join("\n");
}
