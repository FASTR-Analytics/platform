import { Button, FileIcon, XIcon } from "panther";
import { Show, For } from "solid-js";
import type { ConversationDocument } from "~/state/ai_documents";

type Props = {
  documents: ConversationDocument[];
  onOpenSelector: () => void;
  onRemoveDocument: (assetFilename: string) => void;
};

export function AIDocumentButton(p: Props) {
  // const count = () => p.documents.length;

  return (
    <Button outline iconName="document" intent="base-100" onClick={p.onOpenSelector} />

    //   // <div class="flex items-center ui-gap-sm">
    //  <Show when={count() > 0}>
    //       <div class="flex items-center gap-1 text-xs text-white">
    //         <FileIcon class="w-3 h-3" />
    //         <span>{count()} PDF{count() > 1 ? "s" : ""}</span>
    //       </div>
    //     </Show> */}
    // {/* {count() > 0 ? "Manage files" : "Include file"} */ }
    //   // </div>
  );
}

export function AIDocumentList(p: {
  documents: ConversationDocument[];
  onRemove: (assetFilename: string) => void;
}) {
  return (
    <Show when={p.documents.length > 0}>
      <div class="flex flex-wrap gap-1 px-2 py-2 border-b border-base-300">
        <For each={p.documents}>
          {(doc) => (
            <div class="flex items-center gap-1 bg-base-200 rounded px-2 py-1 text-xs">
              <FileIcon class="w-3 h-3 text-primary" />
              <span class="max-w-[150px] truncate">{doc.assetFilename}</span>
              <button
                type="button"
                class="cursor-pointer"
                onClick={() => p.onRemove(doc.assetFilename)}
              >
                <XIcon class="w-3 h-3" />
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
