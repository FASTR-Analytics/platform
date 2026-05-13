import { type Component, createSignal } from "solid-js";
import { createMarkdownIt, openComponent } from "panther";
import { SaveToPromptLibraryModal, type SaveToPromptLibraryResult } from "./SaveToPromptLibraryModal";
import { t3 } from "lib";

const md = createMarkdownIt();

function stripAIContext(text: string): string {
  return text.replace(/<<<.*?>>>/gs, "").trim();
}

type UserTextItem = { type: "user_text"; text: string };

export const SaveableUserTextRenderer: Component<{ item: UserTextItem }> = (props) => {
  const [hovered, setHovered] = createSignal(false);

  const displayText = () => stripAIContext(props.item.text);

  const handleSave = async () => {
    await openComponent<{ initialContent: string }, SaveToPromptLibraryResult>({
      element: SaveToPromptLibraryModal,
      props: { initialContent: displayText() },
    });
  };

  return (
    <div
      class="group relative ml-auto max-w-[80%]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        class="bg-base-200 text-base-content rounded px-4 py-3 text-left text-sm"
        innerHTML={md.render(displayText())}
      />
      {hovered() && (
        <button
          type="button"
          title={t3({ en: "Save to prompt library", fr: "Enregistrer dans la bibliothèque" })}
          onClick={handleSave}
          class="bg-base-100 border-base-300 text-base-content/60 hover:text-base-content absolute -left-8 top-1 flex h-7 w-7 items-center justify-center rounded border shadow-sm"
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
      )}
    </div>
  );
};
