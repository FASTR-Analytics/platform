import { createSignal, createMemo, Show, For, onMount } from "solid-js";
import {
  AlertComponentProps,
  Button,
  CollapsibleSection,
  Input,
  Loading,
  ModalContainer,
  TextArea,
} from "panther";
import { t } from "lib";
import type {
  PromptCategory,
  PromptItem,
  FlattenedPrompt,
  ParseResult,
} from "./types";
import { parsePromptsMarkdown } from "./parse_prompts";

type Props = {};

export type PromptLibraryResult =
  | {
      action: "run_current" | "run_new";
      promptText: string;
    }
  | undefined;

export function PromptLibraryModal(
  p: AlertComponentProps<Props, PromptLibraryResult>,
) {
  const [isLoading, setIsLoading] = createSignal(true);
  const [parseResult, setParseResult] = createSignal<ParseResult>({
    categories: [],
    status: "error",
    message: "Loading...",
  });
  const [searchText, setSearchText] = createSignal("");
  const [selectedPrompt, setSelectedPrompt] =
    createSignal<FlattenedPrompt | null>(null);
  const [editedContent, setEditedContent] = createSignal("");

  const filteredCategories = createMemo(() => {
    const search = searchText().toLowerCase().trim();
    const cats = parseResult().categories;
    if (!search) return cats;
    return cats
      .map((cat) => ({
        ...cat,
        prompts: cat.prompts.filter(
          (pr) =>
            pr.title.toLowerCase().includes(search) ||
            pr.content.toLowerCase().includes(search) ||
            cat.title.toLowerCase().includes(search),
        ),
      }))
      .filter((cat) => cat.prompts.length > 0);
  });

  onMount(async () => {
    try {
      const url = `https://raw.githubusercontent.com/FASTR-Analytics/fastr-resource-hub/refs/heads/main/prompts.md?t=${Date.now()}`;
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load prompts");
      const markdown = await response.text();
      setParseResult(parsePromptsMarkdown(markdown));
    } catch (err) {
      console.error("Failed to load prompt library:", err);
      setParseResult({
        categories: [],
        status: "error",
        message: "Failed to load prompt library",
      });
    } finally {
      setIsLoading(false);
    }
  });

  const handleSelectPrompt = (prompt: PromptItem, category: string) => {
    setSelectedPrompt({ ...prompt, category });
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
    <ModalContainer
      title={selectedPrompt() ? t("Edit prompt") : t("Prompt library")}
      width="xl"
      scroll="content"
      rightButtons={
        !isLoading() && !selectedPrompt()
          ? // eslint-disable-next-line jsx-key
            [
              <Button onClick={() => p.close(undefined)} intent="neutral">
                {t("Cancel")}
              </Button>,
            ]
          : undefined
      }
    >
      <Show when={isLoading()}>
        <div>
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
              filteredCategories={filteredCategories()}
              parseResult={parseResult()}
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
    </ModalContainer>
  );
}

type BrowsePhaseProps = {
  searchText: string;
  onSearchChange: (v: string) => void;
  filteredCategories: PromptCategory[];
  parseResult: ParseResult;
  onSelectPrompt: (prompt: PromptItem, category: string) => void;
};

function BrowsePhase(p: BrowsePhaseProps) {
  const isSearching = () => p.searchText.trim().length > 0;

  return (
    <>
      <Input
        value={p.searchText}
        onChange={p.onSearchChange}
        placeholder={t("Search prompts...")}
        autoFocus
        fullWidth
      />
      <div
        class="mt-1 text-xs"
        classList={{
          "text-success": p.parseResult.status === "ok",
          "text-danger":
            p.parseResult.status === "warning" ||
            p.parseResult.status === "error",
        }}
      >
        {p.parseResult.message}
      </div>
      <div class="mt-3 flex-1 overflow-y-auto">
        <Show
          when={p.filteredCategories.length > 0}
          fallback={
            <div class="text-base-content/60 py-8 text-center">
              {t("No prompts found matching your search.")}
            </div>
          }
        >
          <div class="flex flex-col gap-2">
            <For each={p.filteredCategories}>
              {(cat) => (
                <CollapsibleSection
                  title={
                    <div class="flex items-center gap-2">
                      <span>{cat.title}</span>
                      <span class="text-base-content/50 text-xs">
                        ({cat.prompts.length})
                      </span>
                    </div>
                  }
                  defaultOpen={isSearching()}
                  borderStyle="full"
                  rounded
                  padding="sm"
                >
                  <div>
                    <For each={cat.prompts}>
                      {(prompt) => (
                        <button
                          type="button"
                          class="hover:bg-base-200 block w-full cursor-pointer px-3 py-2 text-left"
                          onClick={() => p.onSelectPrompt(prompt, cat.title)}
                        >
                          <div class="font-700">{prompt.title}</div>
                          <div class="text-base-content/60 truncate text-sm">
                            {prompt.content.slice(0, 120)}...
                          </div>
                        </button>
                      )}
                    </For>
                  </div>
                </CollapsibleSection>
              )}
            </For>
          </div>
        </Show>
      </div>
    </>
  );
}

type EditPhaseProps = {
  prompt: FlattenedPrompt;
  editedContent: string;
  onContentChange: (v: string) => void;
  onBack: () => void;
  onRunCurrent: () => void;
  onRunNew: () => void;
  onCancel: () => void;
};

function EditPhase(p: EditPhaseProps) {
  return (
    <div class="flex flex-1 flex-col">
      <div class="font-700 mb-2">{p.prompt.title}</div>
      <TextArea
        value={p.editedContent}
        onChange={p.onContentChange}
        fullWidth
        height="300px"
      />
      <div class="mt-4 flex gap-2">
        <Button outline iconName="chevronLeft" onClick={p.onBack}>
          {t("Back")}
        </Button>
        <div class="flex-1"></div>
        <Button onClick={p.onRunCurrent} intent="primary">
          {t("Run in current chat")}
        </Button>
        <Button onClick={p.onRunNew} intent="success">
          {t("Run as new chat")}
        </Button>
        <Button onClick={p.onCancel} intent="neutral">
          {t("Cancel")}
        </Button>
      </div>
    </div>
  );
}
