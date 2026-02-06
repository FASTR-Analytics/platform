import { openComponent } from "panther";
import {
  PromptLibraryModal,
  type PromptLibraryResult,
} from "./PromptLibraryModal";

export type UsePromptLibraryOptions = {
  onRunPrompt: (promptText: string, startNewConversation: boolean) => void;
};

export function usePromptLibrary(options: UsePromptLibraryOptions) {
  async function openPromptLibrary() {
    const result = await openComponent<{}, PromptLibraryResult>({
      element: PromptLibraryModal,
      props: {},
    });

    if (result) {
      options.onRunPrompt(result.promptText, result.action === "run_new");
    }
  }

  return { openPromptLibrary };
}
