import {
  createSignal,
  createMemo,
  Show,
  For,
  onMount,
  type Component,
} from "solid-js";
import {
  AlertComponentProps,
  Button,
  Input,
  Loading,
  TextArea,
} from "panther";
import { t } from "lib";
import type { PromptCategory, FlattenedPrompt } from "./types";
import { parsePromptsMarkdown, flattenPrompts } from "./parse_prompts";

type Props = {};

export type PromptLibraryResult =
  | {
    action: "run_current" | "run_new";
    promptText: string;
  }
  | undefined;

export function PromptLibraryModal(
  p: AlertComponentProps<Props, PromptLibraryResult>
) {
  const [isLoading, setIsLoading] = createSignal(true);
  const [categories, setCategories] = createSignal<PromptCategory[]>([]);
  const [searchText, setSearchText] = createSignal("");
  const [selectedPrompt, setSelectedPrompt] = createSignal<FlattenedPrompt | null>(null);
  const [editedContent, setEditedContent] = createSignal("");

  const allPrompts = createMemo(() => flattenPrompts(categories()));

  const filteredPrompts = createMemo(() => {
    const search = searchText().toLowerCase().trim();
    if (!search) return allPrompts();
    return allPrompts().filter(
      (p) =>
        p.title.toLowerCase().includes(search) ||
        p.content.toLowerCase().includes(search) ||
        p.category.toLowerCase().includes(search) ||
        p.subcategory.toLowerCase().includes(search)
    );
  });

  const groupedPrompts = createMemo(() => {
    const groups = new Map<string, FlattenedPrompt[]>();
    for (const prompt of filteredPrompts()) {
      const key = `${prompt.category} > ${prompt.subcategory}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(prompt);
    }
    return groups;
  });

  onMount(async () => {
    try {
      const url = `https://raw.githubusercontent.com/FASTR-Analytics/fastr-resource-hub/refs/heads/main/prompts.md?t=${Date.now()}`;
      const response = await fetch(url, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error("Failed to load prompts");
      const markdown = await response.text();
      setCategories(parsePromptsMarkdown(markdown));
    } catch (err) {
      console.error("Failed to load prompt library:", err);
    } finally {
      setIsLoading(false);
    }
  });

  const handleSelectPrompt = (prompt: FlattenedPrompt) => {
    setSelectedPrompt(prompt);
    setEditedContent(prompt.content);
  };

  const handleBack = () => {
    setSelectedPrompt(null);
    setEditedContent("");
  };

  const handleRunCurrent = () => {
    p.close({ action: "run_current", promptText: editedContent() });
  };

  const handleRunNew = () => {
    p.close({ action: "run_new", promptText: editedContent() });
  };

  return (
    <div class="ui-pad-lg ui-spy max-h-[80vh] w-[min(700px,90vw)] overflow-hidden flex flex-col">
      <div class="font-700 text-lg mb-4">
        {selectedPrompt() ? t("Edit Prompt") : t("Prompt Library")}
      </div>

      <Show when={isLoading()}>
        <div class="">
          <Loading msg={t("Loading prompts...")} noPad />
        </div>
      </Show>

      <Show when={!isLoading()}>
        <Show
          when={selectedPrompt()}
          fallback={
            <BrowsePhase
              searchText={searchText()}
              onSearchChange={setSearchText}
              groupedPrompts={groupedPrompts()}
              onSelectPrompt={handleSelectPrompt}
            />
          }
        >
          {(prompt) => (
            <EditPhase
              prompt={prompt()}
              editedContent={editedContent()}
              onContentChange={setEditedContent}
              onBack={handleBack}
              onRunCurrent={handleRunCurrent}
              onRunNew={handleRunNew}
              onCancel={() => p.close(undefined)}
            />
          )}
        </Show>
      </Show>

      <Show when={!isLoading() && !selectedPrompt()}>
        <div class="mt-4 flex justify-end">
          <Button onClick={() => p.close(undefined)} intent="neutral">
            {t("Cancel")}
          </Button>
        </div>
      </Show>
    </div>
  );
}

type BrowsePhaseProps = {
  searchText: string;
  onSearchChange: (v: string) => void;
  groupedPrompts: Map<string, FlattenedPrompt[]>;
  onSelectPrompt: (prompt: FlattenedPrompt) => void;
};

const BrowsePhase: Component<BrowsePhaseProps> = (p) => {
  return (
    <>
      <Input
        value={p.searchText}
        onChange={p.onSearchChange}
        placeholder={t("Search prompts...")}
        autoFocus
        fullWidth
      />
      <div class="mt-3 flex-1 overflow-y-auto max-h-[50vh]">
        <Show
          when={p.groupedPrompts.size > 0}
          fallback={
            <div class="text-base-content/60 text-center py-8">
              {t("No prompts found matching your search.")}
            </div>
          }
        >
          <For each={[...p.groupedPrompts.entries()]}>
            {([groupName, prompts]) => (
              <div class="mb-4">
                <div class="text-xs font-600 text-base-content/60 uppercase tracking-wide mb-2">
                  {groupName}
                </div>
                <For each={prompts}>
                  {(prompt) => (
                    <button
                      type="button"
                      class="w-full text-left px-3 py-2 rounded hover:bg-base-200 cursor-pointer block"
                      onClick={() => p.onSelectPrompt(prompt)}
                    >
                      <div class="font-500">{prompt.title}</div>
                      <div class="text-sm text-base-content/60 truncate">
                        {prompt.content.slice(0, 100)}...
                      </div>
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
        </Show>
      </div>
    </>
  );
};

type EditPhaseProps = {
  prompt: FlattenedPrompt;
  editedContent: string;
  onContentChange: (v: string) => void;
  onBack: () => void;
  onRunCurrent: () => void;
  onRunNew: () => void;
  onCancel: () => void;
};

const EditPhase: Component<EditPhaseProps> = (p) => {
  return (
    <div class="flex flex-col flex-1">
      <div class="flex items-center gap-2 mb-3">
        <Button size="sm" outline iconName="chevronLeft" onClick={p.onBack}>
          {t("Back")}
        </Button>
        <div class="text-sm text-base-content/60">{p.prompt.categoryPath}</div>
      </div>
      <div class="font-600 mb-2">{p.prompt.title}</div>
      <TextArea
        value={p.editedContent}
        onChange={p.onContentChange}
        fullWidth
        height="300px"
      />
      <div class="mt-4 flex gap-2 justify-end">
        <Button onClick={p.onCancel} intent="neutral">
          {t("Cancel")}
        </Button>
        <Button onClick={p.onRunCurrent} intent="primary">
          {t("Run in Current Chat")}
        </Button>
        <Button onClick={p.onRunNew} intent="success">
          {t("Run as New Chat")}
        </Button>
      </div>
    </div>
  );
};
