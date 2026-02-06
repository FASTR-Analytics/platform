export type PromptCategory = {
  id: string;
  title: string;
  subcategories: PromptSubcategory[];
};

export type PromptSubcategory = {
  id: string;
  title: string;
  prompts: PromptItem[];
};

export type PromptItem = {
  id: string;
  title: string;
  content: string;
  categoryPath: string;
};

export type FlattenedPrompt = PromptItem & {
  category: string;
  subcategory: string;
};
