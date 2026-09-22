export type PromptCategory = {
  id: string;
  title: string;
  prompts: PromptItem[];
};

export type PromptItem = {
  id: string;
  title: string;
  content: string;
};

export type FlattenedPrompt = PromptItem & {
  category: string;
};

export type ParseResult = {
  categories: PromptCategory[];
  status: "ok" | "warning" | "error";
  message: string;
};
