import { type Component } from "solid-js";
import { createMarkdownIt, Icon, openComponent } from "panther";
import {
  SaveToPromptLibraryModal,
  type SaveToPromptLibraryResult,
} from "./save_to_prompt_library_modal";
import { t3 } from "lib";

// A user's text, a country-wide library prompt included, must not fetch an
// image URL as it renders: image syntax renders as a link instead.
const md = createMarkdownIt();
md.disable("image");

type UserTextItem = { type: "user_text"; text: string };

export const SaveableUserTextRenderer: Component<{ item: UserTextItem }> = (
  props,
) => {
  const handleSave = async () => {
    await openComponent<{ initialContent: string }, SaveToPromptLibraryResult>({
      element: SaveToPromptLibraryModal,
      props: { initialContent: props.item.text },
    });
  };

  return (
    <div class="group ml-auto flex max-w-[80%] items-start gap-1">
      <button
        type="button"
        title={t3({
          en: "Save to prompt library",
          fr: "Enregistrer dans la bibliothèque",
          pt: "Guardar na biblioteca de prompts",
        })}
        onClick={handleSave}
        class="bg-base-100 text-base-content-muted hover:text-base-content mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded border opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Icon iconName="bookmark" class="h-3.5 w-3.5" />
      </button>
      <div
        class="bg-base-200 text-base-content min-w-0 flex-1 rounded px-4 py-3 text-left text-sm"
        innerHTML={md.render(props.item.text)}
      />
    </div>
  );
};
