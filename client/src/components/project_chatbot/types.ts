import type { ReportItemConfig } from "lib";

export type MessageParam = {
  role: "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
};

export type DisplayItem =
  | {
      type: "text";
      role: "user" | "assistant";
      text: string;
    }
  | {
      type: "visualizations_to_show";
      role: "assistant";
      ids: string[];
    }
  | {
      type: "tool_in_progress";
      toolName: string;
      toolInput: unknown;
      toolInProgressActionLabel?: string;
    }
  | {
      type: "tool_error";
      toolName: string;
      errorMessage: string;
    }
  | {
      type: "show_slide";
      role: "assistant";
      slideDataFromAI: unknown;
    };

export type ContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  [key: string]: unknown;
};
