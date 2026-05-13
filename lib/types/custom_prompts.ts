export type CustomPrompt = {
  id: string;
  name: string;
  content: string;
  category: string;
  scope: "user" | "country";
  createdBy: string;
  createdAt: string;
};
