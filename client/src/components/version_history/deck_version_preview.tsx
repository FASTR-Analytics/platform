import {
  canonicalJson,
  type DeckVersionDetail,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
  type Slide,
  type SlideDeckConfig,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Button,
  createQuery,
  LoadingIndicator,
  ModalContainer,
  openAlert,
  openComponent,
  openConfirm,
  PageHolder,
  type PageInputs,
  StateHolderWrapper,
  type StateHolder,
} from "panther";
import { createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { convertSlideToPageInputs } from "~/generate_slide_deck/convert_slide_to_page_inputs";
import { serverActions } from "~/server_actions";
import { CopyVersionModal } from "./copy_version_modal";
import { editorDisplayNames } from "./diff_segments";

type SlideSessionStatus = "new" | "edited" | undefined;

// Live canvases are expensive (panther warns around 12-14 mounted at once, and
// the deck UI underneath this panel keeps its own) — page the grid at 6.
const SLIDES_PER_PAGE = 6;

// Read-only render of one deck version: each slide's snapshot config renders
// through the normal deck pipeline (convertSlideToPageInputs -> PageHolder)
// against the version's snapshot deck config.
export function DeckVersionPreview(p: {
  projectId: string;
  deckId: string;
  versionId: string;
  /** The version immediately BEFORE this one — session badges (New/Edited)
   *  and the summary line diff against it. undefined = oldest version. */
  previousVersionId?: string;
  canRestore: boolean;
  onRestored: () => void;
}) {
  const version = createQuery(
    async (): Promise<
      | { success: true; data: { v: DeckVersionDetail; prev: DeckVersionDetail | null } }
      | { success: false; err: string }
    > => {
      const res = await serverActions.getDeckVersion({
        projectId: p.projectId,
        deck_id: p.deckId,
        version_id: p.versionId,
      });
      if (!res.success) return res;
      let prev: DeckVersionDetail | null = null;
      if (p.previousVersionId) {
        // Badges degrade gracefully when the previous version can't load.
        const prevRes = await serverActions.getDeckVersion({
          projectId: p.projectId,
          deck_id: p.deckId,
          version_id: p.previousVersionId,
        });
        if (prevRes.success) prev = prevRes.data;
      }
      return { success: true, data: { v: res.data, prev } };
    },
    t3({ en: "Loading version...", fr: "Chargement de la version...", pt: "A carregar a versão..." }),
  );

  const [page, setPage] = createSignal(0);

  async function restore(v: DeckVersionDetail) {
    const ok = await openConfirm({
      title: t3({ en: "Restore this version?", fr: "Restaurer cette version ?", pt: "Restaurar esta versão?" }),
      text: t3({
        en: "The slide deck will be reset to this version. Your current content is saved as a version first — nothing is lost.",
        fr: "La présentation sera réinitialisée à cette version. Votre contenu actuel est d'abord enregistré comme version — rien n'est perdu.",
        pt: "A apresentação será reposta para esta versão. O seu conteúdo atual é primeiro guardado como versão — nada se perde.",
      }),
      confirmButtonLabel: t3({ en: "Restore", fr: "Restaurer", pt: "Restaurar" }),
    });
    if (!ok) return;
    const res = await serverActions.restoreDeckVersion({
      projectId: p.projectId,
      deck_id: p.deckId,
      version_id: v.id,
    });
    if (!res.success) {
      await openAlert({ text: res.err, intent: "danger" });
      return;
    }
    p.onRestored();
  }

  async function restoreAsCopy(v: DeckVersionDetail) {
    await openComponent({
      element: CopyVersionModal,
      props: {
        header: t3({ en: "Restore as copy", fr: "Restaurer comme copie", pt: "Restaurar como cópia" }),
        initialLabel: `${v.label} (${new Date(v.createdAt).toLocaleDateString()})`,
        save: (label: string) =>
          serverActions.copyDeckVersion({
            projectId: p.projectId,
            deck_id: p.deckId,
            version_id: p.versionId,
            label,
          }),
      },
    });
  }

  return (
    <StateHolderWrapper state={version.state()}>
      {({ v, prev }) => {
        const orderedSlides = v.slides
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const totalPages = Math.max(
          1,
          Math.ceil(orderedSlides.length / SLIDES_PER_PAGE),
        );
        const pageSlides = () =>
          orderedSlides.slice(
            page() * SLIDES_PER_PAGE,
            (page() + 1) * SLIDES_PER_PAGE,
          );

        // What this version's editing session changed, vs the previous one.
        const prevById = new Map(
          (prev?.slides ?? []).map((s) => [s.id, s] as const),
        );
        const currentIds = new Set(orderedSlides.map((s) => s.id));
        const statusOf = (slideId: string, config: Slide): SlideSessionStatus => {
          const old = prevById.get(slideId);
          if (!old) return "new";
          return canonicalJson(old.config) !== canonicalJson(config)
            ? "edited"
            : undefined;
        };
        const addedCount = orderedSlides.filter((s) => !prevById.has(s.id)).length;
        const editedCount = orderedSlides.filter(
          (s) => statusOf(s.id, s.config) === "edited",
        ).length;
        const removedCount = (prev?.slides ?? []).filter(
          (s) => !currentIds.has(s.id),
        ).length;
        const survivorOrderChanged = prev !== null &&
          orderedSlides
              .filter((s) => prevById.has(s.id))
              .map((s) => s.id)
              .join(",") !==
            prev.slides
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .filter((s) => currentIds.has(s.id))
              .map((s) => s.id)
              .join(",");
        const settingsChanged = prev !== null &&
          (prev.label !== v.label ||
            canonicalJson(prev.deckConfig) !== canonicalJson(v.deckConfig));
        const summaryParts = prev === null ? [] : [
          addedCount > 0
            ? `${addedCount} ${t3({ en: "added", fr: "ajoutée(s)", pt: "adicionado(s)" })}`
            : "",
          editedCount > 0
            ? `${editedCount} ${t3({ en: "edited", fr: "modifiée(s)", pt: "editado(s)" })}`
            : "",
          removedCount > 0
            ? `${removedCount} ${t3({ en: "removed", fr: "supprimée(s)", pt: "removido(s)" })}`
            : "",
          survivorOrderChanged
            ? t3({ en: "slides reordered", fr: "diapositives réordonnées", pt: "diapositivos reordenados" })
            : "",
          settingsChanged
            ? t3({ en: "deck settings changed", fr: "paramètres de la présentation modifiés", pt: "definições da apresentação alteradas" })
            : "",
        ].filter(Boolean);
        const sessionEditors = editorDisplayNames(v.editors);

        return (
          <div class="flex h-full min-h-0 flex-col">
            <div class="border-base-300 ui-pad text-neutral border-b text-xs">
              <Show
                when={prev !== null}
                fallback={
                  <span>
                    {t3({
                      en: "First version — every slide is new in this session.",
                      fr: "Première version — chaque diapositive est nouvelle dans cette session.",
                      pt: "Primeira versão — todos os diapositivos são novos nesta sessão.",
                    })}
                  </span>
                }
              >
                <span class="font-semibold">
                  {t3({ en: "Edits in this session", fr: "Modifications de cette session", pt: "Edições desta sessão" })}
                  {sessionEditors ? ` (${sessionEditors})` : ""}
                  {": "}
                </span>
                <span>
                  {summaryParts.length > 0
                    ? summaryParts.join(" · ")
                    : t3({
                      en: "no slide changes",
                      fr: "aucune modification des diapositives",
                      pt: "sem alterações de diapositivos",
                    })}
                </span>
              </Show>
            </div>
            <div class="bg-base-200 ui-pad min-h-0 flex-1 overflow-auto">
              <Show
                when={orderedSlides.length > 0}
                fallback={
                  <div class="text-neutral w-full py-16 text-center">
                    {t3({
                      en: "This version has no slides",
                      fr: "Cette version n'a aucune diapositive",
                      pt: "Esta versão não tem diapositivos",
                    })}
                  </div>
                }
              >
                <div class="grid grid-cols-2 gap-4 2xl:grid-cols-3">
                  <For each={pageSlides()}>
                    {(s) => (
                      <VersionSlideThumb
                        projectId={p.projectId}
                        slide={s.config}
                        deckConfig={v.deckConfig}
                        status={statusOf(s.id, s.config)}
                        statusTitle={sessionEditors}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <div class="border-base-300 ui-pad ui-gap-sm flex items-center border-t">
              <Show when={totalPages > 1}>
                <Button
                  iconName="chevronLeft"
                  outline
                  disabled={page() === 0}
                  onClick={() => setPage(page() - 1)}
                />
                <span class="text-neutral text-xs">
                  {page() + 1} / {totalPages}
                </span>
                <Button
                  iconName="chevronRight"
                  outline
                  disabled={page() >= totalPages - 1}
                  onClick={() => setPage(page() + 1)}
                />
              </Show>
              <div class="flex-1" />
              <Show when={p.canRestore}>
                <Button outline onClick={() => restoreAsCopy(v)}>
                  {t3({ en: "Restore as copy", fr: "Restaurer comme copie", pt: "Restaurar como cópia" })}
                </Button>
                <Button onClick={() => restore(v)}>
                  {t3({ en: "Restore", fr: "Restaurer", pt: "Restaurar" })}
                </Button>
              </Show>
            </div>
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}

function VersionSlideThumb(p: {
  projectId: string;
  slide: Slide;
  deckConfig: SlideDeckConfig;
  /** Session badge: what this version's session did to this slide. */
  status?: SlideSessionStatus;
  /** Who edited in the session (badge hover). */
  statusTitle?: string;
}) {
  const [state, setState] = createSignal<StateHolder<PageInputs>>({
    status: "loading",
  });

  onMount(async () => {
    try {
      const res = await convertSlideToPageInputs(
        p.projectId,
        p.slide,
        undefined,
        p.deckConfig,
      );
      setState(
        res.success
          ? { status: "ready", data: res.data }
          : { status: "error", err: res.err },
      );
    } catch (err) {
      setState({
        status: "error",
        err: err instanceof Error ? err.message : "Failed to render slide",
      });
    }
  });

  function openExpandedView() {
    const s = state();
    if (s.status !== "ready") return;
    openComponent<{ pageInputs: PageInputs }, void>({
      element: ExpandedVersionSlideModal,
      props: { pageInputs: s.data },
    });
  }

  return (
    <div
      class="border-base-300 bg-base-100 relative cursor-pointer rounded border p-1.5 transition-opacity hover:opacity-80"
      onClick={openExpandedView}
    >
      <Show when={p.status}>
        <div
          class={`text-base-100 absolute top-2.5 left-2.5 z-10 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            p.status === "new" ? "bg-success" : "bg-warning"
          }`}
          title={p.statusTitle
            ? `${
              p.status === "new"
                ? t3({ en: "Added in this session by", fr: "Ajoutée dans cette session par", pt: "Adicionado nesta sessão por" })
                : t3({ en: "Edited in this session by", fr: "Modifiée dans cette session par", pt: "Editado nesta sessão por" })
            } ${p.statusTitle}`
            : undefined}
        >
          {p.status === "new"
            ? t3({ en: "New", fr: "Nouvelle", pt: "Novo" })
            : t3({ en: "Edited", fr: "Modifiée", pt: "Editado" })}
        </div>
      </Show>
      <div class="pointer-events-none">
        <Switch>
          <Match when={state().status === "loading"}>
            <div class="aspect-video text-xs">
              <LoadingIndicator noPad />
            </div>
          </Match>
          <Match when={state().status === "error"}>
            <div class="text-danger aspect-video text-xs">
              {(state() as { err?: string }).err ?? "Error"}
            </div>
          </Match>
          <Match when={state().status === "ready"} keyed>
            <div class="aspect-video overflow-hidden">
              <PageHolder
                pageInputs={(state() as { data: PageInputs }).data}
                pageWidthDu={PAGE_WIDTH_DU}
                pageHeightDu={PAGE_HEIGHT_DU}
              />
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}

function ExpandedVersionSlideModal(
  p: AlertComponentProps<{ pageInputs: PageInputs }, void>,
) {
  return (
    <ModalContainer
      width="2xl"
      rightButtons={
        <Button onClick={() => p.close(undefined)}>
          {t3({ en: "Close", fr: "Fermer", pt: "Fechar" })}
        </Button>
      }
    >
      <div class="border-base-300 aspect-video overflow-hidden rounded border">
        <PageHolder
          pageInputs={p.pageInputs}
          pageWidthDu={PAGE_WIDTH_DU}
          pageHeightDu={PAGE_HEIGHT_DU}
        />
      </div>
    </ModalContainer>
  );
}
