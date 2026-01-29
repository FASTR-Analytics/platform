import { MAX_CONTENT_BLOCKS } from "lib";

const MARKDOWN_TABLE_PATTERNS = [
  /\|.*\|.*\|/m, // Lines with multiple pipes (table rows)
  /\|[\s]*[-:]+[\s]*\|/m, // Table separator lines (|---|---|)
];

function containsMarkdownTable(text: string): boolean {
  return MARKDOWN_TABLE_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateNoMarkdownTables(markdown: string): void {
  if (containsMarkdownTable(markdown)) {
    throw new Error(
      "Markdown tables are not allowed. To display tabular data, you must create a table figure using 'from_metric' or 'from_visualization' with chartType='table' instead of using markdown table syntax (pipes and dashes)."
    );
  }
}

export function validateMaxContentBlocks(blocksCount: number): void {
  if (blocksCount > MAX_CONTENT_BLOCKS) {
    throw new Error(
      `Too many blocks (${blocksCount}). Maximum is ${MAX_CONTENT_BLOCKS} blocks per slide. Please reduce the number of blocks and try again.`
    );
  }
}
