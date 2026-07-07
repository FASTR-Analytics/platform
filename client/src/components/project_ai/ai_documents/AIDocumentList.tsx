import { Icon } from "panther";
import { Show, For } from "solid-js";
import type { ProjectDocument } from "~/state/project/t4_ai_documents";

export function AIDocumentList(p: {
  documents: ProjectDocument[];
  onRemove: (assetFilename: string) => void;
}) {
  return (
    <Show when={p.documents.length > 0}>
      <div class="flex flex-wrap gap-1 px-2 py-2 border-b border-base-300">
        <For each={p.documents}>
          {(doc) => (
            <div class="flex items-center gap-1 bg-base-200 rounded px-2 py-1 text-xs">
              <Icon iconName="file" class="w-3 h-3 text-primary" />
              <span class="max-w-[150px] truncate">{doc.assetFilename}</span>
              <button
                type="button"
                class="cursor-pointer"
                onClick={() => p.onRemove(doc.assetFilename)}
              >
                <Icon iconName="x" class="w-3 h-3" />
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}
