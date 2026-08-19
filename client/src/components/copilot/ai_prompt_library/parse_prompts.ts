import type {
  PromptCategory,
  FlattenedPrompt,
  ParseResult,
} from "./types";

export function parsePromptsMarkdown(markdown: string): ParseResult {
  const categories: PromptCategory[] = [];
  const lines = markdown.split("\n");
  const warnings: string[] = [];

  let currentCategory: PromptCategory | null = null;
  let currentPromptTitle: string | null = null;
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let orphanedBlocks = 0;

  for (const line of lines) {
    if (line.startsWith("```prompt")) {
      inCodeBlock = true;
      codeBlockContent = [];
      continue;
    }

    if (line === "```" && inCodeBlock) {
      inCodeBlock = false;
      const content = codeBlockContent.join("\n").trim();
      if (!content) continue;

      if (!currentCategory) {
        orphanedBlocks++;
        continue;
      }

      const title = currentPromptTitle ?? currentCategory.title;
      currentCategory.prompts.push({
        id: slugify(`${currentCategory.title}-${title}`),
        title,
        content,
      });
      currentPromptTitle = null;
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    if (line.startsWith("## ")) {
      const title = line.slice(3).trim();
      currentCategory = { id: slugify(title), title, prompts: [] };
      categories.push(currentCategory);
      currentPromptTitle = null;
    } else if (/^#{3,6}\s/.test(line)) {
      const title = line.replace(/^#{3,6}\s+/, "").trim();
      currentPromptTitle = title;
    }
  }

  const totalPrompts = categories.reduce(
    (sum, c) => sum + c.prompts.length,
    0,
  );

  if (totalPrompts === 0) {
    return {
      categories: [],
      status: "error",
      message: "No prompts found in source file",
    };
  }

  if (orphanedBlocks > 0) {
    warnings.push(
      `${orphanedBlocks} prompt block(s) had no category heading`,
    );
  }

  const emptyCategories = categories.filter((c) => c.prompts.length === 0);
  if (emptyCategories.length > 0) {
    warnings.push(
      `${emptyCategories.length} category heading(s) had no prompts`,
    );
  }

  const filteredCategories = categories.filter((c) => c.prompts.length > 0);

  if (warnings.length > 0) {
    return {
      categories: filteredCategories,
      status: "warning",
      message: warnings.join("; "),
    };
  }

  return {
    categories: filteredCategories,
    status: "ok",
    message: `Loaded ${totalPrompts} prompts in ${filteredCategories.length} categories`,
  };
}

export function flattenPrompts(
  categories: PromptCategory[],
): FlattenedPrompt[] {
  const flattened: FlattenedPrompt[] = [];
  for (const cat of categories) {
    for (const prompt of cat.prompts) {
      flattened.push({ ...prompt, category: cat.title });
    }
  }
  return flattened;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
