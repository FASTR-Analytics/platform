import { createSignal, createMemo, Show, For, onMount } from "solid-js";
import {
  AlertComponentProps,
  Button,
  CollapsibleSection,
  Input,
  Loading,
  ModalContainer,
  TextArea,
  openComponent,
  openConfirm,
} from "panther";
import { isFrench, t3, TC } from "lib";
import type {
  PromptCategory,
  PromptItem,
  FlattenedPrompt,
  ParseResult,
} from "./types";
import type { CustomPrompt } from "lib";
import { parsePromptsMarkdown } from "./parse_prompts";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { SaveToPromptLibraryModal, type SaveToPromptLibraryResult } from "./SaveToPromptLibraryModal";

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
  const [customPrompts, setCustomPrompts] = createSignal<CustomPrompt[]>([]);
  const [searchText, setSearchText] = createSignal("");
  const [selectedPrompt, setSelectedPrompt] =
    createSignal<FlattenedPrompt | null>(null);
  const [editedContent, setEditedContent] = createSignal("");

  const currentUserEmail = () => instanceState.currentUserEmail;

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

  const myCustomPrompts = createMemo(() => {
    const search = searchText().toLowerCase().trim();
    const prompts = customPrompts().filter(
      (pr) => pr.scope === "user" && pr.createdBy === currentUserEmail(),
    );
    if (!search) return prompts;
    return prompts.filter(
      (pr) =>
        pr.name.toLowerCase().includes(search) ||
        pr.content.toLowerCase().includes(search) ||
        pr.category.toLowerCase().includes(search),
    );
  });

  const countryCustomPrompts = createMemo(() => {
    const search = searchText().toLowerCase().trim();
    const prompts = customPrompts().filter((pr) => pr.scope === "country");
    if (!search) return prompts;
    return prompts.filter(
      (pr) =>
        pr.name.toLowerCase().includes(search) ||
        pr.content.toLowerCase().includes(search) ||
        pr.category.toLowerCase().includes(search),
    );
  });

  async function loadCustomPrompts() {
    const res = await serverActions.getCustomPrompts({});
    if (res.success && res.data) {
      setCustomPrompts(res.data);
    }
  }

  onMount(async () => {
    const base = `https://raw.githubusercontent.com/FASTR-Analytics/fastr-resource-hub/refs/heads/main`;
    const cacheBust = `?t=${Date.now()}`;
    await Promise.all([
      (async () => {
        try {
          let markdown: string | undefined;
          if (isFrench()) {
            const frRes = await fetch(`${base}/prompts_fr.md${cacheBust}`, { cache: "no-store" });
            if (frRes.ok) markdown = await frRes.text();
          }
          if (!markdown) {
            const enRes = await fetch(`${base}/prompts.md${cacheBust}`, { cache: "no-store" });
            if (!enRes.ok) throw new Error("Failed to load prompts");
            markdown = await enRes.text();
          }
          setParseResult(parsePromptsMarkdown(markdown));
        } catch (err) {
          console.error("Failed to load prompt library:", err);
          setParseResult({
            categories: [],
            status: "error",
            message: "Failed to load prompt library",
          });
        }
      })(),
      loadCustomPrompts(),
    ]);
    setIsLoading(false);
  });

  const handleSelectPrompt = (prompt: PromptItem, category: string) => {
    setSelectedPrompt({ ...prompt, category });
    setEditedContent(prompt.content);
  };

  const handleSelectCustomPrompt = (prompt: CustomPrompt) => {
    setSelectedPrompt({ id: prompt.id, title: prompt.name, content: prompt.content, category: prompt.category });
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

  const handleNewCustomPrompt = async () => {
    const result = await openComponent<{ initialContent: string }, SaveToPromptLibraryResult>({
      element: SaveToPromptLibraryModal,
      props: { initialContent: "" },
    });
    if (result?.saved) {
      await loadCustomPrompts();
    }
  };

  const handleEditCustomPrompt = async (prompt: CustomPrompt) => {
    const result = await openComponent<{ initialContent: string; existingPrompt: CustomPrompt }, SaveToPromptLibraryResult>({
      element: SaveToPromptLibraryModal,
      props: { initialContent: prompt.content, existingPrompt: prompt },
    });
    if (result?.saved) {
      await loadCustomPrompts();
    }
  };

  const handleDeleteCustomPrompt = async (prompt: CustomPrompt) => {
    const confirmed = await openConfirm({
      title: t3({ en: "Delete prompt", fr: "Supprimer le prompt" }),
      text: t3({
        en: `Are you sure you want to delete "${prompt.name}"?`,
        fr: `Êtes-vous sûr de vouloir supprimer « ${prompt.name} » ?`,
      }),
      intent: "danger",
      confirmButtonLabel: t3(TC.delete),
    });
    if (!confirmed) return;
    const res = await serverActions.deleteCustomPrompt({ id: prompt.id });
    if (res.success) {
      await loadCustomPrompts();
    }
  };

  return (
    <ModalContainer
      title={
        selectedPrompt()
          ? t3({ en: "Edit prompt", fr: "Modifier le prompt" })
          : t3({ en: "Prompt library", fr: "Bibliothèque de prompts" })
      }
      width="xl"
      scroll="content"
      rightButtons={
        !isLoading() && !selectedPrompt()
          ? // eslint-disable-next-line jsx-key
            [
              <Button onClick={() => p.close(undefined)} intent="neutral">
                {t3({ en: "Cancel", fr: "Annuler" })}
              </Button>,
              <Button onClick={handleNewCustomPrompt} intent="primary" iconName="plus">
                {t3({ en: "New prompt", fr: "Nouveau prompt" })}
              </Button>,
            ]
          : undefined
      }
    >
      <Show when={isLoading()}>
        <div>
          <Loading
            msg={t3({
              en: "Loading prompts...",
              fr: "Chargement des prompts...",
            })}
            noPad
          />
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
              myCustomPrompts={myCustomPrompts()}
              countryCustomPrompts={countryCustomPrompts()}
              onSelectCustomPrompt={handleSelectCustomPrompt}
              onEditCustomPrompt={handleEditCustomPrompt}
              onDeleteCustomPrompt={handleDeleteCustomPrompt}
              currentUserEmail={currentUserEmail()}
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
  myCustomPrompts: CustomPrompt[];
  countryCustomPrompts: CustomPrompt[];
  onSelectCustomPrompt: (prompt: CustomPrompt) => void;
  onEditCustomPrompt: (prompt: CustomPrompt) => void;
  onDeleteCustomPrompt: (prompt: CustomPrompt) => void;
  currentUserEmail: string;
};

function BrowsePhase(p: BrowsePhaseProps) {
  const isSearching = () => p.searchText.trim().length > 0;

  return (
    <>
      <Input
        value={p.searchText}
        onChange={p.onSearchChange}
        placeholder={t3({
          en: "Search prompts...",
          fr: "Rechercher des prompts...",
        })}
        autoFocus
        fullWidth
      />

      <div class="mt-3 flex-1 overflow-y-auto">
        <div class="flex flex-col gap-2">
          <Show when={p.myCustomPrompts.length > 0}>
            <CollapsibleSection
              title={
                <div class="flex items-center gap-2">
                  <span>{t3({ en: "My prompts", fr: "Mes prompts" })}</span>
                  <span class="text-base-content/50 text-xs">
                    ({p.myCustomPrompts.length})
                  </span>
                </div>
              }
              defaultOpen={false}
              borderStyle="full"
              rounded
              padding="sm"
            >
              <div>
                <For each={p.myCustomPrompts}>
                  {(prompt) => (
                    <CustomPromptItem
                      prompt={prompt}
                      onSelect={() => p.onSelectCustomPrompt(prompt)}
                      onEdit={() => p.onEditCustomPrompt(prompt)}
                      onDelete={() => p.onDeleteCustomPrompt(prompt)}
                      canEdit={true}
                    />
                  )}
                </For>
              </div>
            </CollapsibleSection>
          </Show>

          <Show when={p.countryCustomPrompts.length > 0}>
            <CollapsibleSection
              title={
                <div class="flex items-center gap-2">
                  <span>{t3({ en: "Country prompts", fr: "Prompts pays" })}</span>
                  <span class="text-base-content/50 text-xs">
                    ({p.countryCustomPrompts.length})
                  </span>
                </div>
              }
              defaultOpen={false}
              borderStyle="full"
              rounded
              padding="sm"
            >
              <div>
                <For each={p.countryCustomPrompts}>
                  {(prompt) => (
                    <CustomPromptItem
                      prompt={prompt}
                      onSelect={() => p.onSelectCustomPrompt(prompt)}
                      onEdit={() => p.onEditCustomPrompt(prompt)}
                      onDelete={() => p.onDeleteCustomPrompt(prompt)}
                      canEdit={prompt.createdBy === p.currentUserEmail}
                    />
                  )}
                </For>
              </div>
            </CollapsibleSection>
          </Show>

          <Show
            when={p.filteredCategories.length > 0}
            fallback={
              p.myCustomPrompts.length === 0 && p.countryCustomPrompts.length === 0 ? (
                <div class="text-base-content/60 py-8 text-center">
                  {t3({
                    en: "No prompts found matching your search.",
                    fr: "Aucun prompt correspondant à votre recherche.",
                  })}
                </div>
              ) : null
            }
          >
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
          </Show>
        </div>

        <Show when={p.filteredCategories.length === 0 && p.myCustomPrompts.length === 0 && p.countryCustomPrompts.length === 0}>
          <div class="text-base-content/60 mt-4">
            <div class="text-xs">{p.parseResult.message}</div>
          </div>
        </Show>
      </div>
    </>
  );
}

function CustomPromptItem(p: {
  prompt: CustomPrompt;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
}) {
  return (
    <div class="hover:bg-base-200 group flex w-full items-start px-3 py-2">
      <button
        type="button"
        class="min-w-0 flex-1 cursor-pointer text-left"
        onClick={p.onSelect}
      >
        <div class="font-700">{p.prompt.name}</div>
        <Show when={p.prompt.category}>
          <div class="text-base-content/50 text-xs">{p.prompt.category}</div>
        </Show>
        <div class="text-base-content/60 truncate text-sm">
          {p.prompt.content.slice(0, 120)}...
        </div>
      </button>
      <Show when={p.canEdit}>
        <div class="ml-2 flex shrink-0 gap-1 opacity-0 group-hover:opacity-100">
          <button
            type="button"
            title={t3({ en: "Edit", fr: "Modifier" })}
            onClick={(e) => { e.stopPropagation(); p.onEdit(); }}
            class="text-base-content/50 hover:text-base-content rounded p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            title={t3({ en: "Delete", fr: "Supprimer" })}
            onClick={(e) => { e.stopPropagation(); p.onDelete(); }}
            class="text-base-content/50 hover:text-danger rounded p-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </Show>
    </div>
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
          {t3({ en: "Back", fr: "Retour" })}
        </Button>
        <div class="flex-1"></div>
        <Button onClick={p.onRunCurrent} intent="primary">
          {t3({
            en: "Run in current chat",
            fr: "Exécuter dans le chat actuel",
          })}
        </Button>
        <Button onClick={p.onRunNew} intent="success">
          {t3({ en: "Run as new chat", fr: "Exécuter dans un nouveau chat" })}
        </Button>
        <Button onClick={p.onCancel} intent="neutral">
          {t3({ en: "Cancel", fr: "Annuler" })}
        </Button>
      </div>
    </div>
  );
}
