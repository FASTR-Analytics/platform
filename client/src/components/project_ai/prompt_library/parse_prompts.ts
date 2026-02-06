import type { PromptCategory, FlattenedPrompt } from "./types";

export function parsePromptsMarkdown(markdown: string): PromptCategory[] {
  const categories: PromptCategory[] = [];
  const lines = markdown.split("\n");

  let currentCategory: PromptCategory | null = null;
  let currentSubcategory: { id: string; title: string; prompts: any[] } | null = null;
  let currentPromptTitle: string | null = null;
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  for (const line of lines) {
    if (line.startsWith("```prompt")) {
      inCodeBlock = true;
      codeBlockContent = [];
      continue;
    }

    if (line === "```" && inCodeBlock) {
      inCodeBlock = false;
      if (currentPromptTitle && currentSubcategory && currentCategory) {
        currentSubcategory.prompts.push({
          id: slugify(
            `${currentCategory.title}-${currentSubcategory.title}-${currentPromptTitle}`
          ),
          title: currentPromptTitle,
          content: codeBlockContent.join("\n").trim(),
          categoryPath: `${currentCategory.title} > ${currentSubcategory.title}`,
        });
      }
      currentPromptTitle = null;
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    if (line.startsWith("# ") && !line.startsWith("## ")) {
      const title = line.slice(2).trim();
      currentCategory = { id: slugify(title), title, subcategories: [] };
      categories.push(currentCategory);
      currentSubcategory = null;
    } else if (line.startsWith("## ")) {
      const title = line.slice(3).trim();
      if (currentCategory) {
        currentSubcategory = { id: slugify(title), title, prompts: [] };
        currentCategory.subcategories.push(currentSubcategory);
      }
    } else if (line.startsWith("### ")) {
      currentPromptTitle = line.slice(4).trim();
    }
  }

  return categories;
}

export function flattenPrompts(categories: PromptCategory[]): FlattenedPrompt[] {
  const flattened: FlattenedPrompt[] = [];
  for (const cat of categories) {
    for (const sub of cat.subcategories) {
      for (const prompt of sub.prompts) {
        flattened.push({
          ...prompt,
          category: cat.title,
          subcategory: sub.title,
        });
      }
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
