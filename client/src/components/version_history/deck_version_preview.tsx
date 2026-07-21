import {
  type AuthorRun,
  canonicalJson,
  type DeckSlideEditors,
  type DeckVersionDetail,
  PAGE_HEIGHT_DU,
  PAGE_WIDTH_DU,
  presenceColorForKey,
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
import {
  DiffSegments,
  editorDisplayName,
  editorDisplayNames,
  UNKNOWN_COLOR,
} from "./diff_segments";
import {
  diffSlideElements,
  type SlideElementChange,
} from "./slide_element_diff";
import { computeAttributedDiff } from "./version_diff";

// Live canvases are expensive (panther warns around 12-14 mounted at once, and
// the deck UI underneath this panel keeps its own) — page the grid at 6.
const SLIDES_PER_PAGE = 6;

type SlideBadge = {
  text: string;
  color: string;
  title: string;
};

// One row of the expanded modal's "Changes in this session" list.
type ElementRow = {
  heading: string;
  color: string;
  oldText?: string;
  newText?: string;
  authorLabel: string;
  authorExact: boolean;
  authorEmail?: string;
  /** Exact attribution for the REMOVED spans of the row's text diff (from the
   *  ledger's per-element deleter set); absent = fall back to authorLabel. */
  removedLabel?: string;
  removedExact?: boolean;
  removedEmail?: string;
  /** Per-character authorship of newText (runs incl. tombstones). Where the
   *  ledger covers a span the diff attributes it exactly (even with several
   *  deleters in one element); gaps, null-author runs and misaligned ledgers
   *  fall back to the labels above. */
  authors?: AuthorRun[];
  authorNames?: Record<string, string>;
};

// One grid cell: a current slide (possibly badged New/Edited) or a ghost of a
// slide REMOVED in this session, rendered dimmed from the previous version.
type DisplayEntry = {
  slideId: string;
  config: Slide;
  deckConfig: SlideDeckConfig;
  ghost: boolean;
  status?: "new" | "edited" | "removed";
  badge?: SlideBadge;
  /** Element-level change list for EDITED slides (shown in the expanded view). */
  rows?: ElementRow[];
};

// Read-only render of one deck version: each slide's snapshot config renders
// through the normal deck pipeline (convertSlideToPageInputs -> PageHolder).
// Session changes are shown Google-style: per-slide badges naming who added/
// edited each slide (their presence color), ghost thumbnails for slides
// removed in the session, and a summary line.
export function DeckVersionPreview(p: {
  projectId: string;
  deckId: string;
  versionId: string;
  /** The version immediately BEFORE this one — session badges and ghosts
   *  diff against it. undefined = oldest version. */
  previousVersionId?: string;
  canRestore: boolean;
  onRestored: () => void;
}) {
  const version = createQuery(
    async (): Promise<
      | {
        success: true;
        data: {
          v: DeckVersionDetail;
          prev: DeckVersionDetail | null;
          prevFailed: boolean;
        };
      }
      | { success: false; err: string }
    > => {
      const res = await serverActions.getDeckVersion({
        projectId: p.projectId,
        deck_id: p.deckId,
        version_id: p.versionId,
      });
      if (!res.success) return res;
      // A failed previous-version load is NOT the same as "oldest version" —
      // conflating them would positively badge every slide "New — Added by …".
      let prev: DeckVersionDetail | null = null;
      let prevFailed = false;
      if (p.previousVersionId) {
        const prevRes = await serverActions.getDeckVersion({
          projectId: p.projectId,
          deck_id: p.deckId,
          version_id: p.previousVersionId,
        });
        if (prevRes.success) prev = prevRes.data;
        else prevFailed = true;
      }
      return { success: true, data: { v: res.data, prev, prevFailed } };
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
      {({ v, prev, prevFailed }) => {
        const orderedSlides = v.slides
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const prevOrdered = (prev?.slides ?? [])
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder);
        const prevById = new Map(prevOrdered.map((s) => [s.id, s] as const));
        const currentIds = new Set(orderedSlides.map((s) => s.id));

        // email -> display name (live project users preferred), covering the
        // session's editors plus anyone in the per-slide ledger.
        const names: Record<string, string> = {};
        const addName = (email: string) => {
          if (!(email in names)) {
            names[email] = editorDisplayName({ email, name: email });
          }
        };
        for (const e of v.editors) {
          names[e.email] = editorDisplayName(e);
        }
        const se: DeckSlideEditors | null = v.slideEditors;
        for (const touch of Object.values(se?.slides ?? {})) {
          for (const email of [
            ...(touch.edited ?? []),
            ...(touch.added ?? []),
            ...(touch.removed ?? []),
            ...Object.values(touch.elements ?? {}).flat(),
            ...Object.values(touch.elementsAdded ?? {}).flat(),
            ...Object.values(touch.elementsRemoved ?? {}).flat(),
            ...Object.values(touch.elementsTextDeleted ?? {}).flat(),
          ]) {
            addName(email);
          }
          for (const runs of Object.values(touch.elementAuthors ?? {})) {
            for (const r of runs) {
              if (r.email) addName(r.email);
              if (r.deletedBy) addName(r.deletedBy);
            }
          }
        }
        for (const email of [...(se?.settings ?? []), ...(se?.reordered ?? [])]) {
          addName(email);
        }

        const sessionEditors = editorDisplayNames(v.editors);

        // Attribution resolution: exact email list -> names + color, session
        // fallback otherwise.
        function whoOf(
          emails: string[] | undefined,
        ): { label: string; exact: boolean; color: string; email?: string } {
          if (emails && emails.length > 0) {
            return {
              label: emails.map((e) => names[e] ?? e).join(", "),
              exact: true,
              color: emails.length === 1
                ? presenceColorForKey(emails[0])
                : UNKNOWN_COLOR,
              email: emails.length === 1 ? emails[0] : undefined,
            };
          }
          return {
            label: sessionEditors,
            exact: v.editors.length === 1,
            color: v.editors.length === 1
              ? presenceColorForKey(v.editors[0].email)
              : UNKNOWN_COLOR,
            email: v.editors.length === 1 ? v.editors[0].email : undefined,
          };
        }

        // Exact per-slide attribution from the ledger, session fallback else.
        function whoFor(
          slideId: string,
          kind: "edited" | "added" | "removed",
        ): { label: string; exact: boolean; color: string; email?: string } {
          return whoOf(se?.slides[slideId]?.[kind]);
        }

        // Human labels for element keys (see slide_element_diff.ts).
        const FIELD_LABELS: Record<string, string> = {
          header: t3({ en: "Header", fr: "En-tête", pt: "Cabeçalho" }),
          subHeader: t3({ en: "Subheader", fr: "Sous-en-tête", pt: "Subcabeçalho" }),
          date: t3({ en: "Date", fr: "Date", pt: "Data" }),
          footer: t3({ en: "Footer", fr: "Pied de page", pt: "Rodapé" }),
          title: t3({ en: "Title", fr: "Titre", pt: "Título" }),
          subtitle: t3({ en: "Subtitle", fr: "Sous-titre", pt: "Subtítulo" }),
          presenter: t3({ en: "Presenter", fr: "Présentateur", pt: "Apresentador" }),
          sectionTitle: t3({ en: "Section title", fr: "Titre de section", pt: "Título da secção" }),
          sectionSubtitle: t3({ en: "Section subtitle", fr: "Sous-titre de section", pt: "Subtítulo da secção" }),
        };

        function elementLabel(ch: SlideElementChange): string {
          if (ch.field) return FIELD_LABELS[ch.field] ?? ch.field;
          if (ch.key === "props") {
            return t3({ en: "Slide settings", fr: "Paramètres de la diapositive", pt: "Definições do diapositivo" });
          }
          if (ch.key === "layout") {
            return t3({ en: "Block arrangement", fr: "Disposition des blocs", pt: "Disposição dos blocos" });
          }
          return ch.blockType === "figure"
            ? t3({ en: "Visualization", fr: "Visualisation", pt: "Visualização" })
            : ch.blockType === "image"
            ? t3({ en: "Image", fr: "Image", pt: "Imagem" })
            : t3({ en: "Text block", fr: "Bloc de texte", pt: "Bloco de texto" });
        }

        function elementRows(
          slideId: string,
          changes: SlideElementChange[],
        ): ElementRow[] {
          const sl = se?.slides[slideId];
          return changes.map((ch) => {
            // Deletions/additions attribute from the classified ledger buckets
            // (exactly who removed/added the element) before falling back to
            // the element's whole editor set.
            const who = whoOf(
              (ch.kind === "removed"
                ? sl?.elementsRemoved?.[ch.key]
                : ch.kind === "added"
                ? sl?.elementsAdded?.[ch.key]
                : undefined) ??
                sl?.elements?.[ch.key] ??
                sl?.edited,
            );
            // Exact deleters of text INSIDE the element — attributes the
            // removed spans of an edited row's mini diff. Marked exact only
            // for a single deleter (two deleters can't be told apart per span).
            const textDeleters = sl?.elementsTextDeleted?.[ch.key];
            const removedBy = ch.kind === "edited" && textDeleters &&
                textDeleters.length > 0
              ? {
                label: textDeleters.map((e) => names[e] ?? e).join(", "),
                exact: textDeleters.length === 1,
                email: textDeleters.length === 1 ? textDeleters[0] : undefined,
              }
              : undefined;
            const verb = ch.kind === "added"
              ? t3({ en: "added by", fr: "ajouté par", pt: "adicionado por" })
              : ch.kind === "removed"
              ? t3({ en: "removed by", fr: "supprimé par", pt: "removido por" })
              : t3({ en: "edited by", fr: "modifié par", pt: "editado por" });
            const oneOf = !who.exact && who.label.includes(",")
              ? `${t3({ en: "one of:", fr: "l'une de ces personnes :", pt: "uma destas pessoas:" })} `
              : "";
            return {
              heading: `${elementLabel(ch)} — ${verb} ${oneOf}${who.label}`,
              color: who.color,
              oldText: ch.oldText,
              newText: ch.newText,
              authorLabel: who.label,
              authorExact: who.exact,
              authorEmail: who.email,
              removedLabel: removedBy?.label,
              removedExact: removedBy?.exact,
              removedEmail: removedBy?.email,
              authors: sl?.elementAuthors?.[ch.key],
              authorNames: names,
            };
          });
        }

        function badgeFor(
          slideId: string,
          kind: "edited" | "added" | "removed",
        ): SlideBadge {
          const who = whoFor(slideId, kind);
          const verb = kind === "added"
            ? t3({ en: "Added by", fr: "Ajoutée par", pt: "Adicionado por" })
            : kind === "edited"
            ? t3({ en: "Edited by", fr: "Modifiée par", pt: "Editado por" })
            : t3({ en: "Removed by", fr: "Supprimée par", pt: "Removido por" });
          const oneOf = !who.exact && who.label.includes(",")
            ? `${t3({ en: "one of:", fr: "l'une de ces personnes :", pt: "uma destas pessoas:" })} `
            : "";
          return {
            text: kind === "added"
              ? t3({ en: "New", fr: "Nouvelle", pt: "Novo" })
              : kind === "edited"
              ? t3({ en: "Edited", fr: "Modifiée", pt: "Editado" })
              : t3({ en: "Removed", fr: "Supprimée", pt: "Removido" }),
            color: who.color,
            title: `${verb} ${oneOf}${who.label}`,
          };
        }

        // Grid entries: current slides (badged vs prev) + ghosts of removed
        // slides inserted near their previous position.
        const entries: DisplayEntry[] = orderedSlides.map((s) => {
          const old = prevById.get(s.id);
          const status: "new" | "edited" | undefined = prevFailed
            ? undefined
            : prev === null
            ? "new"
            : !old
            ? "new"
            : canonicalJson(old.config) !== canonicalJson(s.config)
            ? "edited"
            : undefined;
          return {
            slideId: s.id,
            config: s.config,
            deckConfig: v.deckConfig,
            ghost: false,
            status,
            badge: status === "new"
              ? badgeFor(s.id, "added")
              : status === "edited"
              ? badgeFor(s.id, "edited")
              : undefined,
            rows: status === "edited" && old
              ? elementRows(s.id, diffSlideElements(old.config, s.config))
              : undefined,
          };
        });
        if (prev !== null) {
          prevOrdered.forEach((s, prevIdx) => {
            if (currentIds.has(s.id)) return;
            entries.splice(Math.min(prevIdx, entries.length), 0, {
              slideId: s.id,
              config: s.config,
              deckConfig: prev.deckConfig,
              ghost: true,
              status: "removed",
              badge: badgeFor(s.id, "removed"),
            });
          });
        }

        const totalPages = Math.max(1, Math.ceil(entries.length / SLIDES_PER_PAGE));
        const pageEntries = () =>
          entries.slice(page() * SLIDES_PER_PAGE, (page() + 1) * SLIDES_PER_PAGE);

        // Summary line.
        const addedCount = entries.filter((e) => e.status === "new").length;
        const editedCount = entries.filter((e) => e.status === "edited").length;
        const removedCount = entries.filter((e) => e.status === "removed").length;
        const survivorOrderChanged = prev !== null &&
          orderedSlides
              .filter((s) => prevById.has(s.id))
              .map((s) => s.id)
              .join(",") !==
            prevOrdered
              .filter((s) => currentIds.has(s.id))
              .map((s) => s.id)
              .join(",");
        const settingsChanged = prev !== null &&
          (prev.label !== v.label ||
            canonicalJson(prev.deckConfig) !== canonicalJson(v.deckConfig));
        const namesOf = (emails: string[] | undefined) =>
          emails && emails.length > 0
            ? ` (${emails.map((e) => names[e] ?? e).join(", ")})`
            : "";
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
            ? `${t3({ en: "slides reordered", fr: "diapositives réordonnées", pt: "diapositivos reordenados" })}${namesOf(se?.reordered)}`
            : "",
          settingsChanged
            ? `${t3({ en: "deck settings changed", fr: "paramètres de la présentation modifiés", pt: "definições da apresentação alteradas" })}${namesOf(se?.settings)}`
            : "",
        ].filter(Boolean);

        return (
          <div class="flex h-full min-h-0 flex-col">
            <div class="ui-pad ui-text-caption border-b">
              <Show
                when={prev !== null}
                fallback={
                  <span>
                    {prevFailed
                      ? t3({
                        en: "Could not load the previous version — session changes cannot be highlighted here.",
                        fr: "Impossible de charger la version précédente — les modifications de cette session ne peuvent pas être mises en évidence ici.",
                        pt: "Não foi possível carregar a versão anterior — as alterações desta sessão não podem ser destacadas aqui.",
                      })
                      : t3({
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
                <Show when={removedCount > 0 || addedCount > 0 || editedCount > 0}>
                  <span>
                    {" — "}
                    {t3({
                      en: "hover a badge to see who made the change.",
                      fr: "survolez un badge pour voir qui a fait la modification.",
                      pt: "passe o cursor sobre um selo para ver quem fez a alteração.",
                    })}
                  </span>
                </Show>
              </Show>
            </div>
            <div class="bg-base-200 ui-pad min-h-0 flex-1 overflow-auto">
              <Show
                when={entries.length > 0}
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
                  <For each={pageEntries()}>
                    {(entry) => (
                      <VersionSlideThumb
                        projectId={p.projectId}
                        slide={entry.config}
                        deckConfig={entry.deckConfig}
                        ghost={entry.ghost}
                        badge={entry.badge}
                        rows={entry.rows}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
            <div class="ui-pad ui-gap-sm flex items-center border-t">
              <Show when={totalPages > 1}>
                <Button
                  iconName="chevronLeft"
                  outline
                  disabled={page() === 0}
                  onClick={() => setPage(page() - 1)}
                />
                <span class="ui-text-caption">
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
  /** Ghost = a slide removed in this session, rendered dimmed. */
  ghost?: boolean;
  badge?: SlideBadge;
  /** Element-level change list, shown in the expanded view. */
  rows?: ElementRow[];
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
    openComponent<{ pageInputs: PageInputs; rows?: ElementRow[] }, void>({
      element: ExpandedVersionSlideModal,
      props: { pageInputs: s.data, rows: p.rows },
    });
  }

  return (
    <div
      class="bg-base-100 relative cursor-pointer rounded border p-1.5 transition-opacity hover:opacity-80"
      classList={{ "border-dashed": p.ghost }}
      onClick={openExpandedView}
    >
      <Show when={p.badge}>
        {(badge) => (
          <div
            class="text-white absolute top-2.5 left-2.5 z-10 cursor-help rounded px-1.5 py-0.5 text-[10px] font-semibold"
            style={{ "background-color": badge().color }}
            title={badge().title}
          >
            {badge().text}
          </div>
        )}
      </Show>
      <div
        class="pointer-events-none"
        classList={{ "opacity-50 grayscale": p.ghost }}
      >
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
  p: AlertComponentProps<{ pageInputs: PageInputs; rows?: ElementRow[] }, void>,
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
      <div class="aspect-video overflow-hidden rounded border">
        <PageHolder
          pageInputs={p.pageInputs}
          pageWidthDu={PAGE_WIDTH_DU}
          pageHeightDu={PAGE_HEIGHT_DU}
        />
      </div>
      <Show when={p.rows && p.rows.length > 0}>
        <div class="mt-3 flex max-h-[30vh] flex-col gap-2 overflow-auto">
          <div class="text-sm font-semibold">
            {t3({ en: "Changes in this session", fr: "Modifications de cette session", pt: "Alterações desta sessão" })}
          </div>
          <For each={p.rows}>
            {(row) => (
              <div class="rounded border p-2 text-xs">
                <div class="flex items-center gap-1.5">
                  <span
                    class="inline-block h-2.5 w-2.5 flex-none rounded-full"
                    style={{ "background-color": row.color }}
                  />
                  <span>{row.heading}</span>
                </div>
                <Show when={row.oldText !== undefined || row.newText !== undefined}>
                  <div class="mt-1.5">
                    <DiffSegments
                      segments={computeAttributedDiff([
                        { body: row.oldText ?? "", label: "" },
                        {
                          body: row.newText ?? "",
                          label: row.authorLabel,
                          labelExact: row.authorExact,
                          labelEmail: row.authorEmail,
                          removedLabel: row.removedLabel,
                          removedLabelExact: row.removedExact,
                          removedLabelEmail: row.removedEmail,
                          // Per-character runs (when the session ledger was
                          // live) — exact per-span attribution via the ghost
                          // path, ahead of the label fallbacks above.
                          authors: row.authors,
                          names: row.authorNames,
                        },
                      ])}
                    />
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </ModalContainer>
  );
}
