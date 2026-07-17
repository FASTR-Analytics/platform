import { type Component } from "solid-js";
import { createMarkdownIt, openComponent } from "panther";
import { SaveToPromptLibraryModal, type SaveToPromptLibraryResult } from "./SaveToPromptLibraryModal";
import { t3 } from "lib";

const md = createMarkdownIt();

function stripAIContext(text: string): string {
  return text.replace(/<<<.*?>>>/gs, "").trim();
}

type UserTextItem = { type: "user_text"; text: string };

export const SaveableUserTextRenderer: Component<{ item: UserTextItem }> = (props) => {
  const displayText = () => stripAIContext(props.item.text);

  const handleSave = async () => {
    await openComponent<{ initialContent: string }, SaveToPromptLibraryResult>({
      element: SaveToPromptLibraryModal,
      props: { initialContent: displayText() },
    });
  };

  return (
    <div class="group ml-auto flex max-w-[80%] items-start gap-1">
      <button
        type="button"
        title={t3({ en: "Save to prompt library", fr: "Enregistrer dans la bibliothèque", pt: "Guardar na biblioteca de prompts" })}
        onClick={handleSave}
        class="bg-base-100 border-border text-base-content-muted hover:text-base-content mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded border opacity-0 transition-opacity group-hover:opacity-100"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </button>
      <div
        class="bg-base-200 text-base-content min-w-0 flex-1 rounded px-4 py-3 text-left text-sm"
        innerHTML={md.render(displayText())}
      />
    </div>
  );
};
