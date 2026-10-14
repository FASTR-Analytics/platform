import {
  buildFastrReportCss,
  canonicalJson,
  COLLAB_NO_EDIT_PERMISSION,
  fastrChartPalette,
  fastrThemeTokens,
  type FigureBlock,
  type FigureBundle,
  findReportBodyText,
  findReportFigureConfigMap,
  getFastrReportTemplate,
  getFastrReportTheme,
  getReportCustomStyle,
  type ImageBlock,
  isRetiredReportFormat,
  materializeReport,
  type PackageScope,
  productScope,
  type ProductSummary,
  referencedReportEmbedIds,
  type ReportConfig,
  type ReportCustomStyle,
  type ReportDocContent,
  type ReportStyleColors,
  type ResolvedPackageScope,
  type RunAuthoringContext,
  t3,
} from "lib";
import {
  base64ToBytes,
  type FigureViewProps,
  formatLineRanges,
  HeaderRows,
  MenuDivider,
  MenuRow,
  openModal,
  PopoverRow,
  type RenderReportPdf,
  ReportForge,
  type ReportForgeApi,
  type ReportForgeFigureHost,
  type ReportForgeImageHost,
  type ReportForgeSettings,
  ReportMarkdownDiff,
  type ReportPalette,
  type SkippedRange,
  ToolbarPillButton,
  ToolbarPopover,
} from "report-forge";
import { REPORT_EDIT_UNCHANGED_MESSAGE } from "report-forge/ai";
import {
  AIToolFailure,
  Button,
  type EditorComponentProps,
  FrameTop,
  getEditorWrapper,
  HeadingBar,
  Icon,
  openAlert,
  openComponent,
  plural,
  type StateHolder,
  StateHolderWrapper,
} from "panther";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";
import { serverActions } from "~/server_actions";
import {
  FASTR_LOGO_VALUES,
  FASTR_LOGOS,
  resolveLogoUrl,
} from "~/generate_slide_deck/fastr_logos";
import {
  collabSocketOpen,
  docSaveFailing,
  openReportSession,
  otherPeers,
  reconnectForStaleEditAuth,
  type ReportSession,
  setCollabView,
} from "~/state/instance/collab";
import { ProductTitle } from "~/components/products/_shared/mod.ts";
import { registerReportPageLayout } from "~/exports/export_report_as_paged_pdf";
import { reportExportHostOf } from "~/exports/export_report_as_html";
import {
  PresenceAvatars,
  requestImageAssetUpload,
} from "~/components/_shared/mod.ts";
import { ReportEditorCursors } from "./cursors";
import { addLastUpdatedListener } from "~/state/instance/t1_sse";
import {
  createResolvedScope,
  instanceState,
  productById,
  resolveScope,
} from "~/state/instance/t1_store";
import { canEditProduct } from "~/state/instance/product_access";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import { getReportDetailFromCacheOrFetch } from "~/state/products/t2_report_detail";
import {
  pendingVisualizationOpen,
  reportOutlineClosed,
  setPendingVisualizationOpen,
  setReportOutlineClosed,
} from "~/state/t4_ui";
import {
  findStaleFiguresInReport,
  resolveFigureBundleInteractively,
} from "~/generate_visualization/mod";
import {
  UpdateAllFiguresButton,
  updateFigureToScope,
  VisualizationEditor,
  type VizFigureCollabBinding,
} from "~/components/_shared/figure_editor/mod.ts";
import {
  DuplicateProductsModal,
  type FigureStaleContext,
  InsertFigureModal,
  manageAccessLabel,
  PackageScopeChip,
  PackageScopeModal,
  ProductAccessModal,
  ProductSettings,
  ReportFigureEmbed,
} from "~/components/products/_shared/mod.ts";
import type {
  ReportEditProposal,
  ReportEditProposalResult,
} from "~/components/instance/copilot/mod.ts";
import {
  copilotViewController,
  holdCopilotView,
} from "~/components/instance/copilot/mod.ts";
import { ReportImagePicker } from "./image_picker";
import { ShareReport } from "./share_report";
import { ReportStyleEditor } from "./report_style_editor";
import {
  createFigureSizeCache,
  figureLightInkForColors,
} from "~/generate_report/mod";
import { VersionHistoryEditor } from "~/components/products/_shared/version_history/mod.ts";

type EmbedKind = "figure" | "image";
type EmbedSelection = { kind: EmbedKind; id: string };

// The report editor takes ONE thing: the product id. Label, package and
// scope are read LIVE from the T1 products row; a report IS its product, so
// the product id is also the collab document id.
type Props = EditorComponentProps<{ productId: string }, undefined>;

const AUTOSAVE_MS = 800;

export function ReportEditor(p: Props) {
  const product = (): ProductSummary | undefined => productById(p.productId);
  const scope = (): PackageScope | undefined => {
    const row = product();
    return row === undefined ? undefined : productScope(row);
  };
  const label = () => product()?.label ?? "";
  // The pair with its scope's definition hash, as the authoring context and
  // the copilot's package views read it. Write tools read it through the
  // view context, so a missing row (the product was deleted, which closes
  // the editor) is a tool failure, not an optional value.
  const resolvedScope = createResolvedScope(scope);
  const requireScope = (): ResolvedPackageScope => {
    const s = resolvedScope();
    if (s === undefined) {
      throw new AIToolFailure("This product no longer exists.");
    }
    return s;
  };
  const getRunId = () => requireScope().runId;

  // The copilot's views: the report holds the view it opened over, sets
  // `opening_product` now and `editing_report` once loaded; the hold
  // restores the covered view when the report unmounts.
  holdCopilotView();
  copilotViewController.setView(
    "opening_product",
    { productId: p.productId },
    { getLabel: label, getScope: requireScope, getRunId },
  );
  const { openEditor: openInnerEditor, EditorWrapper: InnerEditorWrapper } =
    getEditorWrapper();
  // Count of sub-editors (figure modal, pickers, version history) currently
  // covering the panes. While > 0 the report cursor broadcaster is off: the
  // figure modal broadcasts fig:-scoped pointers on this SAME session
  // awareness, and two broadcasters must not fight over the "pointer" field.
  const [panesCovered, setPanesCovered] = createSignal(0);
  async function withPanesCovered<T>(opening: Promise<T>): Promise<T> {
    setPanesCovered((n) => n + 1);
    try {
      return await opening;
    } finally {
      setPanesCovered((n) => n - 1);
    }
  }

  const [isLoading, setIsLoading] = createSignal(true);
  // A detail read that fails at mount: the error replaces the editor, nothing
  // is written and the copilot stays on `opening_product`. Loading itself is
  // `isLoading`, so this is ready or error; `true` is the data because the
  // wrapper's ready branch needs truthy data.
  const [loadState, setLoadState] = createSignal<StateHolder<true>>({
    status: "ready",
    data: true,
  });
  const [body, setBody] = createSignal("");
  // A report still stored in a format that no longer has an editor: it opens
  // to a notice and nothing else (isRetiredReportFormat).
  const [retiredFormat, setRetiredFormat] = createSignal(false);
  // The stored config: the report's look is read off it, and it is re-sent
  // whole on a theme change so no sibling field is dropped (updateReportConfig
  // re-imposes format and style, not the rest).
  const [config, setConfig] = createSignal<ReportConfig>({});
  const [figures, setFigures] = createSignal<Record<string, FigureBlock>>({});
  const [images, setImages] = createSignal<Record<string, ImageBlock>>({});
  // The theme is changeable after creation: the body carries no CSS, so
  // nothing can be invalidated by a re-theme. A custom style contributes its
  // palette.
  const fastrTheme = () => getFastrReportTheme(config());
  const customStyle = () => getReportCustomStyle(config());
  const fastrColors = (): ReportStyleColors | undefined =>
    customStyle()?.colors ?? undefined;
  // What Report Forge is told of the look.
  const settings = createMemo<ReportForgeSettings>(() => ({
    theme: fastrTheme(),
    colors: fastrColors(),
    paletteId: customStyle()?.id,
    template: getFastrReportTemplate(config()),
    themeChosen: config().themeChosen,
  }));
  // The theme's series palette for every figure the report embeds; a custom
  // palette's accent leads it.
  const chartPalette = createMemo(() =>
    fastrChartPalette(fastrTheme(), fastrColors())
  );
  // For the version history's preview: the report's stylesheet, and the
  // light ink its figures take on a dark ground.
  const themeCss = createMemo(() =>
    buildFastrReportCss(fastrTheme(), fastrColors())
  );
  const inkTheme = createMemo(() => {
    const tok = fastrThemeTokens(fastrTheme());
    return figureLightInkForColors(
      fastrColors() ?? { page: tok.page, ink: tok.ink, accent: tok.accent },
    );
  });
  // The lastUpdated we last saw from the server — round-tripped for optimistic
  // concurrency.
  const [lastUpdated, setLastUpdated] = createSignal<string>("");
  const [showConflictBanner, setShowConflictBanner] = createSignal(false);
  const [saveError, setSaveError] = createSignal<string | undefined>();
  // Autosave indicator. "unsaved" = an edit is pending in the debounce window.
  const [saveStatus, setSaveStatus] = createSignal<
    "saved" | "unsaved" | "saving" | "error"
  >("saved");
  const [lastSavedAt, setLastSavedAt] = createSignal<string>("");
  // The embed selected in the editor (Report Forge owns the selection; this
  // mirrors it for presence and the figure actions).
  const [selectedEmbed, setSelectedEmbed] = createSignal<
    EmbedSelection | undefined
  >();
  // Live collab (Yjs). collabReady LATCHES at the first report_sync: from then
  // on the room's checkpoints own persistence and the REST autosave is off for
  // good: even while disconnected (edits accumulate in the local doc and the
  // reconnect catch-up ships them; a parallel REST save would double-apply).
  const [collabReady, setCollabReady] = createSignal(false);
  // A FATAL collab error (report deleted / room gone): further edits would be
  // silently dropped by the server, so the editor locks read-only and says so.
  const [collabFatal, setCollabFatal] = createSignal<string | undefined>();
  // The figure registry id whose editor modal is open (co-editing its config
  // live in the shared doc). While set, the figure-registry push skips that
  // figure's config (the modal owns it); presence advertises it to peers.
  const [editingFigureId, setEditingFigureId] = createSignal<
    string | undefined
  >(undefined);
  const [session, setSession] = createSignal<ReportSession | null>(null);
  // Bumped when the session swaps its doc for one of the server's lineage
  // (collab.ts, onLineageReset): everything that binds to the doc re-reads it.
  const [lineage, setLineage] = createSignal(0);
  // Content as fetched at mount, for the first-sync merge rule.
  let loadedSnapshot: ReportDocContent | undefined;
  let removeLastUpdatedListener: (() => void) | undefined;
  // "You can't edit" alerted at most once per editor instance (each rejected
  // op repeats the same non-fatal error).
  let permErrorShown = false;

  // The mounted editor's handle (Report Forge), once it is up.
  let forge: ReportForgeApi | undefined;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  // Suppresses the "user edited" AI notification while an AI-accepted edit is
  // applied through the editor (which reports it like any other change).
  let applyingProposal = false;

  // stillValid()'s unmount half (see proposeEdit below): flips false in
  // onCleanup, before the view controller leaves editing_report. Checked ONLY at
  // accept time by panther's approval engine, so a stale accept auto-declines
  // instead of committing against a torn-down editor.
  let mounted = true;

  const canConfigure = () => canEditProduct(p.productId);

  // A deleted product closes the editor: its row leaves T1.
  createEffect(() => {
    const row = product();
    const loading = isLoading();
    if (row === undefined && !loading) p.close(undefined);
  });

  // ── Package and scope ───────────────────────────────────────────────────────
  // The authoring context follows the LIVE pair and its scope's definition: a
  // reattach, a scope change or an edit to the scope's module list swaps the
  // metric and preset catalogue the wizard and the update actions author
  // against.
  const [authoringContext, setAuthoringContext] = createSignal<
    RunAuthoringContext | undefined
  >();
  createEffect(() => {
    const resolved = resolvedScope();
    setAuthoringContext(undefined);
    if (resolved === undefined) return;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    void (async () => {
      const res = await getRunAuthoringContextFromCacheOrFetch(resolved);
      if (controller.signal.aborted || !res.success) return;
      setAuthoringContext(res.data);
    })();
  });

  async function openProductSettings() {
    const row = product();
    if (!row) return;
    await openComponent({ element: ProductSettings, props: { product: row } });
  }

  // The chip opens the pair surface with a live count of what the candidate
  // pair would leave stale, off the same registry the header count reads.
  async function openPackageScope() {
    const row = product();
    if (!row) return;
    await openComponent({
      element: PackageScopeModal,
      props: {
        product: row,
        countStaleUnder: (pair: PackageScope) =>
          Promise.resolve(
            findStaleFiguresInReport(figures(), resolveScope(pair)).length,
          ),
      },
    });
  }

  // ── Stale figures ───────────────────────────────────────────────────────────
  const staleContext = () => {
    const pair = scope();
    const context = authoringContext();
    return pair && context ? { scope: pair, context } : undefined;
  };
  // Which of this report's figures were resolved under a different pair
  // than the container now serves from, live off the registry and the pair.
  const staleFigures = () => {
    const pair = scope();
    return pair ? findStaleFiguresInReport(figures(), resolveScope(pair)) : [];
  };
  // What each embed needs to show its own badge and commit its own update.
  function figureStale(id: string): FigureStaleContext | undefined {
    const ctx = staleContext();
    if (!ctx) return undefined;
    return {
      scope: ctx.scope,
      authoringContext: ctx.context,
      canEdit: canConfigure(),
      onUpdated: (bundle) => void updateFigure(id, { type: "figure", bundle }),
    };
  }
  // The figure the editor's widgets draw: the report's own block, with its
  // staleness badge. Report Forge knows a figure only by its id.
  const FigureView = (fp: FigureViewProps) => (
    <Show when={figures()[fp.id]}>
      {(fig) => (
        <ReportFigureEmbed
          figure={fig()}
          stale={figureStale(fp.id)}
          onMeasured={fp.onMeasured}
          inkFor={fp.inkFor}
          chartPalette={fp.chartPalette}
        />
      )}
    </Show>
  );
  const [updatingFigures, setUpdatingFigures] = createSignal(false);

  // Re-resolve them all. Per-figure failures keep the old bundle and are
  // reported together: the update never blocks on one bad figure.
  async function updateAllFigures() {
    const ctx = staleContext();
    const stale = staleFigures();
    if (!ctx || stale.length === 0) return;
    setUpdatingFigures(true);
    const updates: Record<string, FigureBlock> = {};
    const failures: string[] = [];
    for (const s of stale) {
      const res = await updateFigureToScope(ctx.scope, ctx.context, s.bundle);
      if (res.ok) {
        updates[s.figureId] = { type: "figure", bundle: res.bundle };
      } else {
        failures.push(res.reason);
      }
    }
    // Onto the registry as it is NOW: the updates awaited the network, and a
    // figure inserted meanwhile (here or by a collaborator) must survive.
    const current = figures();
    const next = { ...current };
    for (const [id, block] of Object.entries(updates)) {
      if (current[id] !== undefined) next[id] = block;
    }
    setFigures(next);
    await persistFigures(next);
    setUpdatingFigures(false);
    if (failures.length > 0) {
      await openAlert({ text: failures.join("\n"), intent: "danger" });
    }
  }

  /** Whether the body text can be edited: configurable AND the room is alive (a
   *  fatal collab error locks the editor read-only). Gates the CM editor and
   *  the header's undo/redo, which drive the same document. */
  const canEditBody = () => canConfigure() && !collabFatal();

  function assetUrl(imgFile: string) {
    return resolveLogoUrl(imgFile);
  }

  // Never rewind lastUpdated when out-of-order save responses resolve.
  function bumpLastUpdated(ts: string) {
    setLastUpdated((prev) => (ts > prev ? ts : prev));
  }

  const saveIndicator = createMemo(() => {
    // The report/room is gone (deleted, not found): nothing persists anymore.
    if (collabFatal()) {
      return {
        text: t3({
          en: "No longer available",
          fr: "N'est plus disponible",
          pt: "Já não está disponível",
        }),
        dot: "bg-danger",
      };
    }
    // Live collab supersedes the REST autosave states: edits stream to the
    // server continuously and the room checkpoints them.
    if (collabReady() && collabSocketOpen()) {
      // Edits relay live, but the room's checkpoint saves are erroring: say
      // so rather than claiming "Live" while nothing persists.
      if (docSaveFailing("report", p.productId)) {
        return {
          text: t3({
            en: "Not saving — retrying…",
            fr: "Non enregistré — nouvel essai…",
            pt: "Não está a guardar — a tentar novamente…",
          }),
          dot: "bg-danger",
        };
      }
      return {
        text: t3({ en: "Live", fr: "En direct", pt: "Em direto" }),
        dot: "bg-success",
      };
    }
    if (collabReady()) {
      return {
        text: t3({
          en: "Offline — reconnecting…",
          fr: "Hors ligne — reconnexion…",
          pt: "Offline — a reconectar…",
        }),
        dot: "bg-warning",
      };
    }
    switch (saveStatus()) {
      case "saving":
        return {
          text: t3({ en: "Saving…", fr: "Enregistrement…", pt: "A guardar…" }),
          dot: "bg-warning",
        };
      case "unsaved":
        return {
          text: t3({
            en: "Unsaved changes",
            fr: "Modifications non enregistrées",
            pt: "Alterações não guardadas",
          }),
          dot: "bg-base-300",
        };
      case "error":
        return {
          text: t3({
            en: "Save failed",
            fr: "Échec de l'enregistrement",
            pt: "Falha ao guardar",
          }),
          dot: "bg-danger",
        };
      case "saved":
      default:
        return {
          text: lastSavedAt()
            ? t3({
              en: `Saved ${lastSavedAt()}`,
              fr: `Enregistré ${lastSavedAt()}`,
              pt: `Guardado ${lastSavedAt()}`,
            })
            : t3({ en: "Saved", fr: "Enregistré", pt: "Guardado" }),
          dot: "bg-success",
        };
    }
  });

  // Advertise which report this user has open, which embed they have
  // selected (peers draw a presence border around it in their preview), and
  // which figure modal they are inside. One reactive effect: imperative
  // setCollabView calls elsewhere would fight it.
  createEffect(() => {
    setCollabView({
      reportId: p.productId,
      selectedBlockId: selectedEmbed()?.id,
      editingFigureId: editingFigureId(),
    });
  });

  onMount(async () => {
    // Through the T2 cache, like the deck editor's detail read: the entry is
    // keyed by the product's own stamp, so a hit can only be the current row.
    // One-shot on purpose, with no version-keyed refetch effect behind it:
    // once the room syncs, the shared doc owns this content, and a refetch
    // landing mid-session would fight it.
    const res = await getReportDetailFromCacheOrFetch(p.productId);
    if (!mounted) return;
    if (!res.success) {
      setLoadState({ status: "error", err: res.err });
      return;
    }
    if (isRetiredReportFormat(res.data.config)) {
      setRetiredFormat(true);
    } else if (res.success) {
      setConfig(res.data.config);
      setBody(res.data.body);
      setLastUpdated(res.data.lastUpdated);

      // Prune orphan registry entries only at load, when no undo history can
      // bring their tokens back. The loosest scan ("any": both token syntaxes
      // and anything looser) — a kept orphan is harmless, a missed reference
      // deletes a figure. Only a user who can edit writes the prune back; a
      // viewer's stays in memory.
      const refs = referencedReportEmbedIds(res.data.body, "any");
      const prunedFigures = Object.fromEntries(
        Object.entries(res.data.figures).filter(([id]) => refs.figures.has(id)),
      );
      const prunedImages = Object.fromEntries(
        Object.entries(res.data.images).filter(([id]) => refs.images.has(id)),
      );
      setFigures(prunedFigures);
      setImages(prunedImages);
      if (
        canConfigure() &&
        Object.keys(prunedFigures).length !==
          Object.keys(res.data.figures).length
      ) {
        void persistFigures(prunedFigures);
      }
      if (
        canConfigure() &&
        Object.keys(prunedImages).length !== Object.keys(res.data.images).length
      ) {
        void persistImages(prunedImages);
      }

      // Snapshot the UNPRUNED fetch for the first-sync merge rule (the room
      // seeds from the same DB row, so this is what its doc should equal).
      loadedSnapshot = {
        body: res.data.body,
        figures: res.data.figures,
        images: res.data.images,
      };

      // Bind this report to a shared CRDT document for live co-editing.
      const s = openReportSession(
        p.productId,
        p.productId,
        onRemoteReport,
        (errMsg, fatal) => {
          console.warn("Report collab error:", errMsg);
          // Fatal ⇔ the report/room is gone (deleted, not found): the server
          // silently drops every further update, so lock the editor instead of
          // letting the user type into a void that still says "Live".
          if (fatal) {
            setCollabFatal(errMsg);
            return;
          }
          // Edit rejected on the socket's snapshot auth. If the live store
          // says this user CAN edit, the socket is stale (permission granted
          // after connect): reconnect to re-derive auth; the resync then
          // pushes the rejected local ops. Otherwise the user really is
          // read-only: say so once instead of silently dropping their edits.
          if (errMsg === COLLAB_NO_EDIT_PERMISSION) {
            if (canConfigure()) {
              reconnectForStaleEditAuth();
            } else if (!permErrorShown) {
              permErrorShown = true;
              void openAlert({
                text: t3({
                  en:
                    "You don't have permission to edit reports — your changes are not being saved.",
                  fr:
                    "Vous n'avez pas la permission de modifier les rapports — vos modifications ne sont pas enregistrées.",
                  pt:
                    "Não tem permissão para editar relatórios — as suas alterações não estão a ser guardadas.",
                }),
                intent: "danger",
              });
            }
          }
        },
        () => {
          // The room re-seeded its doc (a fresh lineage of the same text) and
          // the session adopted it instead of merging: rebind the editor.
          setLineage((n) => n + 1);
        },
      );
      setSession(s);

      // Keep the optimistic-save timestamp fresh as server-side checkpoints
      // bump the product's stamp (a report IS its product, so it rides the
      // products_upserted summary), so the offline/fallback flush won't raise
      // a spurious conflict against collab's own autosaves; and tell the
      // copilot's digest the report changed (the AI's own writes mark their
      // echo key, so they drop at drain).
      removeLastUpdatedListener = addLastUpdatedListener(
        (tableName, ids, ts) => {
          if (tableName !== "products" || !ids.includes(p.productId)) return;
          bumpLastUpdated(ts);
          const row = product();
          if (row === undefined) return;
          copilotViewController.notify("product_updated", {
            productId: p.productId,
            type: row.type,
            label: row.label,
          });
        },
      );
    }
    setIsLoading(false);

    // A retired report loaded nothing and mounts no editor: the copilot gets
    // no report view, or its tools would read an empty document and stage a
    // proposal into a dialog host that is not there.
    if (retiredFormat()) return;

    copilotViewController.setView(
      "editing_report",
      { reportId: p.productId },
      {
        // Read live from the T1 row: a reattach moves the pair under the view.
        getScope: requireScope,
        getRunId,
        getLabel: () => label(),
        getTemplate: () => getFastrReportTemplate(config()),
        getBody: () => body(),
        getFigures: () => figures(),
        getImages: () => images(),
        getSelection: () => forge?.getSelection(),
        proposeEdit: (proposal): ReportEditProposalResult => {
          // The base the proposal was computed from. Every proposing tool builds
          // newBody from getBody() with only synchronous work before calling
          // proposeEdit (from inside its own approval.propose), so body() here
          // IS that base: captured for the rebase on accept (collaborators may
          // edit while the diff is under review).
          const baseBody = body();
          if (proposal.newBody === baseBody) {
            return {
              skip: REPORT_EDIT_UNCHANGED_MESSAGE,
            };
          }
          return {
            preview: {
              title: proposal.summary,
              diff: { before: baseBody, after: proposal.newBody },
            },
            // Stages the SAME locking modal (openComponent backdrop) as before
            // migration; the signal aborts on an external resolution (Stop) and
            // the modal closes itself (see ReportMarkdownDiff's signal prop):
            // panther has no dismissal API for an already-open dialog otherwise.
            customProposalUI: (signal) =>
              openModal({
                element: ReportMarkdownDiff,
                props: {
                  oldText: baseBody,
                  newText: proposal.newBody,
                  summary: proposal.summary,
                  signal,
                },
              }).then((accepted) => accepted === true),
            // Guards the dangerous half of the proposeEdit orphan: a decision
            // that resolves "accepted" after this editor unmounted (or the AI
            // context moved on to something else while it was still mounted)
            // must NOT run commit against torn-down editor state. Checked only
            // at accept: panther maps a false return to the standardized
            // stale/auto_declined outcome instead of calling commit.
            stillValid: () =>
              mounted &&
              copilotViewController.current().id === "editing_report",
            // Runs ONLY after an accepted, still-valid decision: same rebase-
            // over-collaborator-edits + persist logic as before migration.
            commit: async () => {
              const skipped = await applyProposal(proposal, baseBody);
              return { skipped };
            },
          };
        },
        applyFigureUpdate: (figureId, block) => updateFigure(figureId, block),
      },
    );
  });

  // Flush a pending debounced body save immediately (before unmount/accept) so a
  // save in the autosave window is never dropped.
  function flushBodySave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      return persistBody(body());
    }
    return Promise.resolve();
  }

  // Apply an accepted AI proposal to the editor and persist it. The proposal
  // is REBASED over anything that changed while it was under review, so a
  // collaborator's concurrent edits survive; hunks that collide with a
  // concurrent edit are skipped (returned, surfaced to the user + the AI).
  async function applyProposal(
    prop: ReportEditProposal,
    baseBody: string,
  ): Promise<SkippedRange[]> {
    if (prop.addFigures) {
      // Added before the body so an inserted token never dangles. If the
      // token's hunk ends up skipped, the figure is orphaned: harmless (the
      // load-time prune removes unreferenced registry entries).
      const prev = figures();
      const next = { ...prev, ...prop.addFigures };
      setFigures(next);
      if (!(await persistFigures(next))) {
        // Don't apply a body whose tokens reference figures the server never
        // got: that would surface as "Missing visualization" after reload.
        setFigures(prev);
        throw new AIToolFailure(
          "The user ACCEPTED the edit, but saving its figure(s) to the server FAILED, so the edit was NOT applied. Tell the user to check their connection and try again.",
        );
      }
    }
    // Report Forge applies it rebased and scrolls to the first change.
    applyingProposal = true;
    const res = await forge?.applyBody(baseBody, prop.newBody).finally(() => {
      applyingProposal = false;
    }) ?? { skipped: [] as SkippedRange[] };
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
    }
    // Live collab persists via the room checkpoint (a REST save here would
    // double-apply after a reconnect catch-up: same rule as the autosave).
    // Note body(), not prop.newBody: skipped hunks mean the actual text can
    // differ from the proposal.
    if (!collabReady()) {
      await persistBody(body());
    }
    if (res.skipped.length > 0) {
      const lines = formatLineRanges(res.skipped);
      // One skipped change can still span several lines.
      const where = res.skipped[0].fromLine === res.skipped[0].toLine
        ? t3({ en: "on line", fr: "à la ligne", pt: "na linha" })
        : t3({ en: "on lines", fr: "aux lignes", pt: "nas linhas" });
      void openAlert({
        text: plural(res.skipped.length, {
          one: t3({
            en:
              `The AI's change ${where} ${lines} was not applied because a collaborator is editing that text. Re-run the AI if you still want it.`,
            fr:
              `La modification de l'IA ${where} ${lines} n'a pas été appliquée car un collaborateur modifie ce texte. Relancez l'IA si vous la souhaitez toujours.`,
            pt:
              `A alteração da IA ${where} ${lines} não foi aplicada porque um colaborador está a editar esse texto. Volte a executar a IA se ainda a quiser.`,
          }),
          other: t3({
            en:
              `The AI's changes on lines ${lines} were not applied because a collaborator is editing that text. Re-run the AI if you still want them.`,
            fr:
              `Les modifications de l'IA aux lignes ${lines} n'ont pas été appliquées car un collaborateur modifie ce texte. Relancez l'IA si vous les souhaitez toujours.`,
            pt:
              `As alterações da IA nas linhas ${lines} não foram aplicadas porque um colaborador está a editar esse texto. Volte a executar a IA se ainda as quiser.`,
          }),
        }),
      });
    }
    return res.skipped;
  }

  onCleanup(() => {
    mounted = false;
    const s = session();
    if (collabFatal()) {
      // The report/room is gone: nothing to flush to.
    } else if (!collabReady()) {
      // Collab never became ready: the REST autosave owns persistence.
      void flushBodySave();
    } else if (
      s && !s.isLive() && s.hasUnsentEdits() && canConfigure()
    ) {
      // Collab has edits the server never received (socket down, no reconnect
      // before close): best-effort REST flush of the shared doc's state, by a
      // user who can edit. Only then: the flush writes this client's whole
      // document, so with nothing unsent it would only push a stale copy over
      // what collaborators wrote while this socket was down.
      const content = materializeReport(s.doc);
      void serverActions.updateReportBody({
        product_id: p.productId,
        body: content.body,
        expectedLastUpdated: lastUpdated(),
        overwrite: true,
      });
      void serverActions.updateReportFigures({
        product_id: p.productId,
        figures: content.figures,
      });
      void serverActions.updateReportImages({
        product_id: p.productId,
        images: content.images,
      });
    }
    // Live: nothing to flush, the room finalizes/checkpoints server-side.
    s?.close();
    setSession(null);
    removeLastUpdatedListener?.();
    removeLastUpdatedListener = undefined;
    // Clear the "in this report" presence when the editor closes.
    setCollabView({});
  });

  // ── live collab ──────────────────────────────────────────────────────────

  // Applies shared-doc state to the local signals. Fired on report_sync (first
  // sync + reconnects) and on every relayed remote update.
  function onRemoteReport() {
    const s = session();
    if (!s) return;
    const docContent = materializeReport(s.doc);
    if (!collabReady()) {
      // First sync. Push pre-sync local edits onto the shared doc only while
      // it still equals the content this editor loaded: pushing over a
      // diverged doc would force it to our draft and delete another user's
      // edits. If peers got there first, adopt their state.
      const hasPendingLocal = saveStatus() !== "saved" ||
        saveTimer !== undefined;
      if (
        hasPendingLocal &&
        loadedSnapshot &&
        canonicalJson(docContent) === canonicalJson(loadedSnapshot)
      ) {
        s.pushLocal({ body: body(), figures: figures(), images: images() });
      } else {
        setBody(docContent.body);
        setFigures(docContent.figures);
        setImages(docContent.images);
      }
      // Collab owns persistence from here: cancel any pending REST autosave.
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
      }
      setCollabReady(true); // flips the editor's collab prop → yCollab rebind
      return;
    }
    // Ongoing remote updates: the body flows straight into the editor via the
    // yCollab binding (and back into the body signal via onBodyChange); only
    // the registries need adopting here. Reading the doc builds every figure
    // block afresh, so an unchanged block keeps its previous object: a new
    // object redraws its chart, and this runs on every remote keystroke.
    setFigures((prev) => keepUnchangedBlocks(prev, docContent.figures));
    setImages((prev) => keepUnchangedBlocks(prev, docContent.images));
  }

  // The canonical JSON of a block, computed once per object.
  const blockJson = new WeakMap<object, string>();
  function jsonOf(block: object): string {
    let json = blockJson.get(block);
    if (json === undefined) {
      json = canonicalJson(block);
      blockJson.set(block, json);
    }
    return json;
  }
  function keepUnchangedBlocks<T extends object>(
    prev: Record<string, T>,
    next: Record<string, T>,
  ): Record<string, T> {
    let same = Object.keys(prev).length === Object.keys(next).length;
    const out: Record<string, T> = {};
    for (const [id, block] of Object.entries(next)) {
      const old = prev[id];
      if (old !== undefined && jsonOf(old) === jsonOf(block)) {
        out[id] = old;
      } else {
        out[id] = block;
        same = false;
      }
    }
    return same ? prev : out;
  }

  // ── persistence ────────────────────────────────────────────────────────────

  // Stamp a successful save for the autosave indicator (local clock time).
  function markSaved() {
    setLastSavedAt(
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    );
    setSaveStatus("saved");
  }

  async function persistBody(nextBody: string) {
    setSaveStatus("saving");
    const res = await serverActions.updateReportBody({
      product_id: p.productId,
      body: nextBody,
      expectedLastUpdated: lastUpdated(),
      overwrite: true,
    });
    if (res.success) {
      bumpLastUpdated(res.data.lastUpdated);
      if (res.data.conflicted) setShowConflictBanner(true);
      setSaveError(undefined);
      markSaved();
    } else {
      setSaveError(res.err);
      setSaveStatus("error");
    }
  }

  function handleBodyChange(nextBody: string) {
    setBody(nextBody);
    // Let the AI know the body changed (skip AI-applied edits; while live,
    // remote peer edits land here too: they equally invalidate the AI's read).
    if (!applyingProposal) {
      copilotViewController.notify("edited_report_locally", {
        reportId: p.productId,
      });
    }
    // Live collab: edits stream into the shared doc via yCollab and the room
    // checkpoints them: the REST autosave stays off (see collabReady note).
    if (collabReady()) return;
    setSaveStatus("unsaved");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persistBody(nextBody), AUTOSAVE_MS);
  }

  async function persistFigures(
    next: Record<string, FigureBlock>,
  ): Promise<boolean> {
    // Live collab: the registry change flows through the shared doc (fresh
    // object references: the callers' {...prev, [id]: block} spreads) and the
    // room checkpoint persists it.
    const s = session();
    if (collabReady() && s) {
      // While a figure's editor modal is open, the modal owns that figure's
      // config live in the doc: don't let this registry push revert it.
      const editing = editingFigureId();
      s.pushRegistries(
        next,
        images(),
        editing
          ? { skipFigureConfigForFigureIds: new Set([editing]) }
          : undefined,
      );
      return true;
    }
    setSaveStatus("saving");
    const res = await serverActions.updateReportFigures({
      product_id: p.productId,
      figures: next,
    });
    if (res.success) {
      bumpLastUpdated(res.data.lastUpdated);
      markSaved();
      return true;
    }
    setSaveError(res.err);
    setSaveStatus("error");
    return false;
  }

  async function persistImages(next: Record<string, ImageBlock>) {
    // Live collab: see persistFigures, including the skip set, or this push
    // re-diffs an open figure modal's config from the host's stale copy.
    const s = session();
    if (collabReady() && s) {
      const editing = editingFigureId();
      s.pushRegistries(
        figures(),
        next,
        editing
          ? { skipFigureConfigForFigureIds: new Set([editing]) }
          : undefined,
      );
      return;
    }
    setSaveStatus("saving");
    const res = await serverActions.updateReportImages({
      product_id: p.productId,
      images: next,
    });
    if (res.success) {
      bumpLastUpdated(res.data.lastUpdated);
      markSaved();
    } else {
      setSaveError(res.err);
      setSaveStatus("error");
    }
  }

  async function updateFigure(
    id: string,
    figureBlock: FigureBlock,
  ): Promise<boolean> {
    const next = { ...figures(), [id]: figureBlock };
    setFigures(next);
    return await persistFigures(next);
  }

  // ── toolbar / embed-editor actions ───────────────────────────────────────────

  // The ONE figure-authoring path: the product package's presets and
  // the metric wizard, resolved under the product's pair.
  async function pickFigure() {
    const ctx = staleContext();
    if (!ctx) return undefined;
    return await withPanesCovered(
      openComponent({
        element: InsertFigureModal,
        props: {
          scope: ctx.scope,
          context: ctx.context,
          preselectedMetricId: null,
        },
      }),
    );
  }

  // Report Forge's "Insert > Visualization": make the figure here and hand
  // back its id and caption; the editor inserts the token and selects it.
  async function insertFigure(): Promise<
    { id: string; caption: string } | undefined
  > {
    const ctx = staleContext();
    const picked = await pickFigure();
    if (!ctx || !picked) return undefined;
    const resolved = await resolveFigureBundleInteractively(
      ctx.scope,
      picked.metric,
      picked.config,
    );
    if (!resolved.ok) {
      await openAlert({ text: resolved.reason, intent: "danger" });
      return undefined;
    }
    const id = crypto.randomUUID();
    await updateFigure(id, { type: "figure", bundle: resolved.bundle });
    return { id, caption: picked.metric.label };
  }

  async function replaceSelectedFigure() {
    const sel = selectedEmbed();
    if (!sel || sel.kind !== "figure") return;
    const ctx = staleContext();
    const picked = await pickFigure();
    if (!ctx || !picked) return;
    const resolved = await resolveFigureBundleInteractively(
      ctx.scope,
      picked.metric,
      picked.config,
    );
    if (!resolved.ok) {
      await openAlert({ text: resolved.reason, intent: "danger" });
      return;
    }
    await updateFigure(sel.id, { type: "figure", bundle: resolved.bundle });
  }

  async function handleEdit() {
    const sel = selectedEmbed();
    if (!sel || sel.kind !== "figure") return;
    const bundle = figures()[sel.id]?.bundle;
    const ctx = staleContext();
    if (!bundle || !ctx) return;
    // The metric comes from the product package's authoring context; a
    // figure carried over from another package edits under this one.
    const metric = ctx.context.metrics.find((m) => m.id === bundle.metricId);
    if (!metric) {
      await openAlert({
        text: t3({
          en: "This visualization's metric is not in the product's package",
          fr:
            "L'indicateur de cette visualisation n'est pas dans le paquet du produit",
          pt: "A métrica desta visualização não está no pacote do produto",
        }),
        intent: "danger",
      });
      return;
    }
    // Live co-editing: bind the modal to this figure's config IN the shared
    // report doc. Only when the session is live; else the modal keeps its classic
    // Apply/Cancel flow (graceful degradation).
    const s0 = session();
    const figureOrigin = {}; // per-open origin for the modal's undo tracking
    const collabBinding: VizFigureCollabBinding | undefined = s0 && s0.isLive()
      ? {
        figureId: sel.id,
        hostDoc: { docType: "report", docId: p.productId },
        getConfigMap: () => {
          const ss = session();
          return ss ? findReportFigureConfigMap(ss.doc, sel.id) : undefined;
        },
        awareness: s0.awareness,
        isLive: () => session()?.isLive() ?? false,
        canEdit: () => canConfigure() && !collabFatal(),
        localOrigin: figureOrigin,
        onCoherentBundle: (b: FigureBundle) => {
          void updateFigure(sel.id, { type: "figure", bundle: b });
        },
      }
      : undefined;

    setEditingFigureId(sel.id);
    try {
      const result = await withPanesCovered(
        openInnerEditor({
          element: VisualizationEditor,
          props: {
            label: metric.label,
            scope: ctx.scope,
            metric,
            configSnapshot: structuredClone(bundle.config),
            aiView: {
              id: "editing_report_figure" as const,
              params: { reportId: p.productId, figureId: sel.id },
            },
            authoringContext: ctx.context,
            collabBinding,
            // The theme's chart colours, the ones this figure prints in.
            chartPalette,
          },
        }),
      );
      if (!result?.updated) return;
      // Re-resolve under the product's CURRENT pair, so applying an edit to a
      // stale figure also brings it up to date.
      const rebuilt = await resolveFigureBundleInteractively(
        ctx.scope,
        metric,
        result.updated.config,
      );
      if (!rebuilt.ok) {
        await openAlert({ text: rebuilt.reason, intent: "danger" });
        return;
      }
      await updateFigure(sel.id, { type: "figure", bundle: rebuilt.bundle });
    } finally {
      setEditingFigureId(undefined);
    }
  }

  // Tour catalogue replay: once the report and its package's contents have
  // loaded, open the report's first visualization in the editor. Cleared
  // before opening; a report with no visualization changes nothing, and the
  // waiting tour starts the next time the user opens one themselves.
  createEffect(() => {
    const wanted = pendingVisualizationOpen();
    const loading = isLoading();
    const contextReady = staleContext() !== undefined;
    const registry = figures();
    const mayEdit = canConfigure();
    if (!wanted || loading || !contextReady) return;
    const figureId = Object.keys(registry).find((id) => registry[id]?.bundle);
    setPendingVisualizationOpen(false);
    if (figureId === undefined || !mayEdit) return;
    forge?.selectEmbed({ kind: "figure", id: figureId });
    void handleEdit();
  });

  // The File menu's whole-document actions (FASTR toolbar). Rename and
  // duplicate are the SHARED product surfaces, not report-only modals:
  // the label lives on the product row, so the header follows the store and
  // nothing here has to be told about the new name. A copy lands in the
  // products list; the current report stays open.
  async function duplicateReport() {
    const row = product();
    if (!row) return;
    await openComponent({
      element: DuplicateProductsModal,
      props: { products: [row] },
    });
  }

  async function emailReport() {
    await openComponent({
      element: ShareReport,
      props: {
        productId: p.productId,
        reportLabel: label(),
        userEmails: instanceState.users.map((u) => u.email),
      },
    });
  }

  async function openAccess() {
    await openComponent({
      element: ProductAccessModal,
      props: { mode: "product" as const, productId: p.productId },
    });
  }

  // A report carries a File menu (Download lives there), as a deck does: in
  // Report Forge's menu row for a user who can write the body, and alone in a
  // row of this app's for one who cannot (a viewer, or a dead room), for whom
  // the editor draws no menus.
  const fileMenuAloneShown = () =>
    !isLoading() && !retiredFormat() && !canEditBody();

  async function openVersionHistory() {
    await withPanesCovered(
      openInnerEditor({
        element: VersionHistoryEditor,
        props: {
          kind: "report" as const,
          docId: p.productId,
          currentLabel: label(),
          getCurrentBody: body,
          reportFastrThemeCss: themeCss(),
          figureInkTheme: inkTheme(),
        },
      }),
    );
  }

  // The figures' raster boxes (what the PDF embeds): Report Forge gives each
  // live figure the same box before it draws, and re-boxes when one lands.
  const figureSizes = createFigureSizeCache(() => forge?.refreshEmbedSizes());
  onCleanup(() => figureSizes.dispose());

  // The editor's collab binding: the shared body text, once the room has
  // synced. Re-read when the session adopts a doc of the server's lineage.
  const bodyCollab = createMemo(() => {
    const s = session();
    lineage();
    return collabReady() && s
      ? { yText: findReportBodyText(s.doc), awareness: s.awareness }
      : undefined;
  });

  // ── What Report Forge asks of this app ─────────────────────────────────────
  // Images are instance assets: listed off the store, uploaded through the
  // app's own upload dialog, chosen with its asset picker.
  const imageHost: ReportForgeImageHost = {
    assetUrl,
    library: () =>
      instanceState.assets.filter((a) => a.isImage).map((a) => a.fileName),
    requestUpload: () =>
      requestImageAssetUpload((name) =>
        instanceState.assets.some((a) => a.isImage && a.fileName === name)
      ),
    pick: () => openComponent({ element: ReportImagePicker, props: {} }),
    logosLabel: "FASTR",
    logos: FASTR_LOGOS.map((logo) => ({
      value: logo.value,
      label: t3(logo.label),
      onDark: logo.value === FASTR_LOGO_VALUES[1],
    })),
  };

  // Figures are this app's: drawn by panther from the report's own blocks,
  // authored through the product package's presets and the metric wizard.
  const figureHost: ReportForgeFigureHost = {
    ids: () => Object.keys(figures()),
    View: FigureView,
    size: (id) => {
      const block = figures()[id];
      return block ? figureSizes.get(id, block) : undefined;
    },
    rasterize: (id, ink, palette) =>
      reportExportHostOf(figures()).rasterizeFigure?.(id, ink, palette) ??
        Promise.resolve(undefined),
    insert: insertFigure,
    controls: (id) => (
      <>
        <Show when={figures()[id]?.bundle !== undefined}>
          <ToolbarPillButton onClick={() => void handleEdit()}>
            <Icon iconName="pencil" class="h-4 w-4" />
            {t3({
              en: "Edit visualization",
              fr: "Modifier la visualisation",
              pt: "Editar visualização",
            })}
          </ToolbarPillButton>
        </Show>
        <ToolbarPillButton onClick={() => void replaceSelectedFigure()}>
          <Icon iconName="chart" class="h-4 w-4" />
          {t3({
            en: "Replace visualization",
            fr: "Remplacer la visualisation",
            pt: "Substituir visualização",
          })}
        </ToolbarPillButton>
      </>
    ),
  };

  // The saved custom styles, as the palettes the theme picker offers; the
  // style editor is this app's own dialog.
  let stylesById = new Map<string, ReportCustomStyle>();
  const palettes = {
    list: async (): Promise<ReportPalette[]> => {
      const res = await serverActions.listReportStyles({
        product_id: p.productId,
      });
      if (!res.success) return [];
      stylesById = new Map(res.data.map((style) => [style.id, style]));
      return res.data.map((style) => ({
        id: style.id,
        label: style.label,
        description: style.description,
        colors: style.colors,
      }));
    },
    edit: async (palette: ReportPalette | undefined) => {
      await openComponent({
        element: ReportStyleEditor,
        props: {
          productId: p.productId,
          existing: palette ? stylesById.get(palette.id) : undefined,
        },
      });
    },
  };

  // The report's look changed in the editor. Applying a style (or answering
  // the theme picker for the first time) goes through setReportStyle, which
  // resolves the style snapshot server-side; a plain theme switch or a
  // template choice is a config write. Rejects with the server's reason, and
  // Report Forge shows it.
  //
  // The report carries a SNAPSHOT of its style, so a style edited in the
  // library reaches the report only when it is applied again. The picker
  // hands over the library's colours, the report holds the snapshot's: when
  // the two differ under one id, that is the re-apply, and it must take the
  // snapshot write too.
  async function handleSettingsChange(next: ReportForgeSettings) {
    const cur = settings();
    const stored = config();
    const paletteEdited = next.paletteId !== undefined &&
      (next.colors?.page !== cur.colors?.page ||
        next.colors?.ink !== cur.colors?.ink ||
        next.colors?.accent !== cur.colors?.accent);
    if (
      next.paletteId !== cur.paletteId ||
      next.themeChosen !== cur.themeChosen || paletteEdited
    ) {
      const res = await serverActions.setReportStyle({
        product_id: p.productId,
        fastrTheme: next.theme,
        customStyleId: next.paletteId ?? null,
      });
      if (!res.success) throw new Error(res.err);
      // The stored config comes back with the write, so the palette repaints
      // off what was actually saved without re-reading the report (which
      // would race the products SSE behind the detail cache).
      setConfig(res.data.config);
      bumpLastUpdated(res.data.lastUpdated);
      return;
    }
    if (next.theme === cur.theme && next.template === cur.template) return;
    // Optimistic, reverted on failure. Safe on a live report because the
    // theme is not in the body: nothing the user typed can be invalidated,
    // and every peer picks the new theme up on their next load.
    const wanted: ReportConfig = {
      ...stored,
      fastrTheme: next.theme,
      ...(next.template === undefined ? {} : { template: next.template }),
    };
    setConfig(wanted);
    setSaveStatus("saving");
    const res = await serverActions.updateReportConfig({
      product_id: p.productId,
      config: wanted,
    });
    if (!res.success) {
      setConfig(stored);
      setSaveStatus("error");
      throw new Error(res.err);
    }
    bumpLastUpdated(res.data.lastUpdated);
    markSaved();
  }

  async function handleImagesChange(next: Record<string, ImageBlock>) {
    setImages(next);
    await persistImages(next);
  }

  // Prints the paged document on the server's headless Chrome.
  const renderPdf: RenderReportPdf = async (html, onProgress) => {
    const res = await serverActions.renderReportPdf(
      { product_id: p.productId, html },
      onProgress,
    );
    if (!res.success) throw new Error(res.err);
    return new Blob([base64ToBytes(res.data.pdfBase64)], {
      type: "application/pdf",
    });
  };

  // The Email export (share_report.tsx) prints the saved report and forces
  // the editor's page breaks on it when the two bodies match.
  onCleanup(
    registerReportPageLayout(p.productId, () => forge?.getPageLayout()),
  );

  // This app's banners, above the editing surface.
  const banners = (
    <>
      <Show when={collabFatal()}>
        <div class="bg-danger/10 text-danger ui-pad flex items-center gap-2 text-xs">
          <span class="flex-1">
            {collabFatal()}
            {" — "}
            {t3({
              en: "editing is disabled. Close this editor.",
              fr: "l'édition est désactivée. Fermez cet éditeur.",
              pt: "a edição está desativada. Feche este editor.",
            })}
          </span>
        </div>
      </Show>
      <Show when={showConflictBanner()}>
        <div class="bg-base-200 text-base-content ui-pad flex items-center gap-2 text-xs">
          <span class="flex-1">
            {t3({
              en:
                "Someone else may be editing this report — your changes were saved over theirs.",
              fr:
                "Quelqu'un d'autre modifie peut-être ce rapport — vos modifications ont été enregistrées par-dessus les siennes.",
              pt:
                "Outra pessoa poderá estar a editar este relatório — as suas alterações foram guardadas por cima das dela.",
            })}
          </span>
          <Button
            size="sm"
            outline
            onBackground="base-200"
            onClick={() => setShowConflictBanner(false)}
          >
            {t3({ en: "Dismiss", fr: "Ignorer", pt: "Dispensar" })}
          </Button>
        </div>
      </Show>
      <Show when={saveError()}>
        <div class="text-danger ui-pad text-xs">{saveError()}</div>
      </Show>
    </>
  );

  // A reader's File menu: the whole-document operations their level allows,
  // built from Report Forge's own toolbar parts so it matches the editor's.
  const ReaderFileMenu = () => (
    <HeaderRows>
      <MenuRow ref={() => {}}>
        <ToolbarPopover
          menu
          label={t3({ en: "File", fr: "Fichier", pt: "Ficheiro" })}
          title={t3({ en: "File", fr: "Fichier", pt: "Ficheiro" })}
        >
          {(close) => (
            <div class="ui-spy-sm flex w-56 flex-col">
              <PopoverRow
                active={false}
                onClick={() => {
                  forge?.openDownload();
                  close();
                }}
              >
                {t3({
                  en: "Download…",
                  fr: "Télécharger…",
                  pt: "Transferir…",
                })}
              </PopoverRow>
              <PopoverRow
                active={false}
                onClick={() => {
                  void emailReport();
                  close();
                }}
              >
                {t3({
                  en: "Email this file…",
                  fr: "Envoyer par email…",
                  pt: "Enviar por email…",
                })}
              </PopoverRow>
              <MenuDivider />
              <Show when={canConfigure()}>
                <PopoverRow
                  active={false}
                  onClick={() => {
                    void openProductSettings();
                    close();
                  }}
                >
                  {t3({
                    en: "Rename…",
                    fr: "Renommer…",
                    pt: "Mudar o nome…",
                  })}
                </PopoverRow>
                <PopoverRow
                  active={false}
                  onClick={() => {
                    void openAccess();
                    close();
                  }}
                >
                  {manageAccessLabel()}
                </PopoverRow>
              </Show>
              <PopoverRow
                active={false}
                onClick={() => {
                  void duplicateReport();
                  close();
                }}
              >
                {t3({
                  en: "Make a copy…",
                  fr: "Créer une copie…",
                  pt: "Criar uma cópia…",
                })}
              </PopoverRow>
            </div>
          )}
        </ToolbarPopover>
      </MenuRow>
    </HeaderRows>
  );

  // The content area: Report Forge, or the notice a retired report opens to.
  const MainArea = () => (
    <>
      <Show when={retiredFormat()}>
        <div class="ui-pad text-base-content-muted text-sm">
          {t3({
            en:
              "This report was written in the HTML format, which has been retired. It can no longer be opened or edited.",
            fr:
              "Ce rapport a été rédigé au format HTML, qui a été retiré. Il ne peut plus être ouvert ni modifié.",
            pt:
              "Este relatório foi escrito no formato HTML, que foi descontinuado. Já não pode ser aberto nem editado.",
          })}
        </div>
      </Show>
      <Show when={fileMenuAloneShown()}>
        <ReaderFileMenu />
      </Show>
      <Show when={!isLoading() && !retiredFormat()}>
        <ReportForge
          title={label()}
          body={body()}
          onBodyChange={handleBodyChange}
          settings={settings()}
          onSettingsChange={handleSettingsChange}
          images={images()}
          onImagesChange={handleImagesChange}
          canEdit={canEditBody()}
          lastSaved={lastSavedAt()}
          imageHost={imageHost}
          figures={figureHost}
          palettes={palettes}
          renderPdf={renderPdf}
          collab={bodyCollab()}
          menuItems={[
            {
              menu: "file",
              label: t3({
                en: "Email this file…",
                fr: "Envoyer par email…",
                pt: "Enviar por email…",
              }),
              onClick: () => void emailReport(),
            },
            {
              menu: "file",
              dividerBefore: true,
              label: t3({
                en: "Rename…",
                fr: "Renommer…",
                pt: "Mudar o nome…",
              }),
              onClick: () => void openProductSettings(),
            },
            {
              menu: "file",
              label: manageAccessLabel(),
              onClick: () => void openAccess(),
            },
            {
              menu: "file",
              label: t3({
                en: "Make a copy…",
                fr: "Créer une copie…",
                pt: "Criar uma cópia…",
              }),
              onClick: () => void duplicateReport(),
            },
          ]}
          banner={banners}
          outlineClosed={reportOutlineClosed()}
          onOutlineClosedChange={setReportOutlineClosed}
          onSelectedEmbedChange={setSelectedEmbed}
          ref={(api) => (forge = api)}
        />
      </Show>
    </>
  );

  // Every piece of the header is built ONCE and passed by reference:
  // panther's FrameTop reads `panelChildren` twice (a Show's `when`, then its
  // child), and HeadingBar reads its slots the same way, while an inline JSX
  // prop compiles to a getter, so an inline piece is BUILT twice. The second
  // copy is the one inserted, but the first has already run its refs, and both
  // toolbars then portal their menu row into the host the last ref set: two
  // menu rows in one header.
  // The back button keeps its id (tour anchor), so it rides the left slot
  // rather than HeadingBar's own onBack button.
  const headerBack = (
    <Button
      id="report-back-button"
      iconName="chevronLeft"
      onClick={() => p.close(undefined)}
    />
  );
  // pl-1: the title's rename hover reaches 4px left of its text, and the bar
  // clips its overflow.
  const headerTitle = (
    <div class="flex min-w-0 items-center pl-1">
      <ProductTitle productId={p.productId} label={label()} />
    </div>
  );
  // Each control centred on the buttons' height: the save dot is 15px
  // against a 36px button.
  const headerActions = (
    <div class="ui-gap-sm flex items-center">
      <PackageScopeChip
        product={product()}
        onClick={canConfigure() ? () => void openPackageScope() : undefined}
        tour="report-package-scope"
      />
      {/* Who else is currently in THIS report (live presence). */}
      <PresenceAvatars
        peers={otherPeers().filter(
          (pe) => pe.reportId === p.productId,
        )}
        size="sm"
      />
      <div
        class="ui-text-caption mr-2 flex items-center gap-1.5"
        data-tour="report-save-status"
      >
        <div
          class="h-1.5 w-1.5 flex-none rounded-full"
          classList={{
            [saveIndicator().dot]: true,
            "animate-pulse": saveStatus() === "saving",
          }}
        />
        <span>{saveIndicator().text}</span>
      </div>
      <Show when={canConfigure()}>
        <UpdateAllFiguresButton
          count={staleFigures().length}
          busy={updatingFigures()}
          onClick={() => void updateAllFigures()}
        />
      </Show>
      <Button
        id="report-history-button"
        outline
        onBackground="base-300"
        iconName="rotate"
        onClick={openVersionHistory}
      >
        {t3({ en: "History", fr: "Historique", pt: "Histórico" })}
      </Button>
    </div>
  );
  // The title bar: back, the name and the report's actions in panther's
  // HeadingBar. The menus and the formatting pill under it are Report
  // Forge's, the first rows of the content area below.
  const headerPanel = (
    <div
      class="h-full w-full"
      data-cursor-zone="header"
    >
      <HeadingBar
        tonal
        data-tour="report-toolbar"
        leftChildren={headerBack}
        heading={headerTitle}
      >
        {headerActions}
      </HeadingBar>
    </div>
  );

  return (
    <InnerEditorWrapper>
      <FrameTop panelChildren={headerPanel}>
        <StateHolderWrapper state={loadState()}>
          {() => <MainArea />}
        </StateHolderWrapper>
      </FrameTop>
      <ReportEditorCursors
        reportId={p.productId}
        awareness={() => session()?.awareness}
        enabled={() =>
          !!session() && collabReady() && panesCovered() === 0 &&
          canConfigure()}
        covered={() => panesCovered() > 0}
      />
      <ReportPeerSelectionOverlay
        reportId={p.productId}
        suppressed={panesCovered() > 0}
      />
    </InnerEditorWrapper>
  );
}

// Presence borders around report embeds: the report counterpart of the
// slide editor's PeerSelectionOverlay: a colored border + name tags around
// the figure/image each peer currently has selected (their embed selection,
// broadcast via presence `selectedBlockId`). DOM-anchored: embeds are located
// by [data-embed-id] on the editor's figure widgets, clipped to the pane's
// visible viewport.
function ReportPeerSelectionOverlay(p: {
  reportId: string;
  suppressed: boolean;
}) {
  const [tick, setTick] = createSignal(0);
  const bump = () => setTick((t) => t + 1);
  onMount(() => {
    window.addEventListener("resize", bump);
    window.addEventListener("scroll", bump, true);
    const sweep = setInterval(bump, 1000);
    onCleanup(() => {
      window.removeEventListener("resize", bump);
      window.removeEventListener("scroll", bump, true);
      clearInterval(sweep);
    });
  });
  const boxes = () => {
    tick();
    if (p.suppressed) return [];
    const peers = otherPeers().filter(
      (peer) => peer.reportId === p.reportId && peer.selectedBlockId,
    );
    if (peers.length === 0) return [];
    const panes = [
      {
        el: document.querySelector('[data-report-cursor="code-pane"]'),
        find: (pane: Element, id: string) =>
          pane.querySelector(`[data-embed-id="${CSS.escape(id)}"]`)
            ?.getBoundingClientRect(),
      },
    ].filter((pane): pane is { el: Element; find: typeof pane.find } => {
      if (!pane.el) return false;
      const r = pane.el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (panes.length === 0) return [];
    const out: {
      key: string;
      left: number;
      top: number;
      width: number;
      height: number;
      editors: { name: string; color: string; editingFigure: boolean }[];
    }[] = [];
    // One box per embed (not per peer): co-selectors share the box, their
    // name tags sit side by side (mirrors the slide editor's overlay).
    const byTarget = new Map<string, (typeof out)[number]>();
    for (const [paneIdx, pane] of panes.entries()) {
      const paneRect = pane.el.getBoundingClientRect();
      for (const peer of peers) {
        const id = peer.selectedBlockId!;
        const key = `${paneIdx}:${id}`;
        let entry = byTarget.get(key);
        if (!entry) {
          const r = pane.find(pane.el, id);
          if (!r || r.width === 0 || r.height === 0) continue;
          // Clip to the pane's viewport so a scrolled-away embed's border
          // doesn't float over the header or the neighbouring pane.
          const top = Math.max(r.top, paneRect.top);
          const bottom = Math.min(r.bottom, paneRect.bottom);
          if (bottom - top < 8) continue;
          entry = {
            key,
            left: r.left,
            top,
            width: r.width,
            height: bottom - top,
            editors: [],
          };
          byTarget.set(key, entry);
          out.push(entry);
        }
        // Same user in two tabs = two connections; show their name once.
        if (!entry.editors.some((e) => e.name === peer.name)) {
          entry.editors.push({
            name: peer.name,
            color: peer.color,
            editingFigure: peer.editingFigureId === id,
          });
        }
      }
    }
    // Stable label order so tags don't swap places between presence updates.
    for (const entry of out) {
      entry.editors.sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  };

  return (
    <Portal mount={document.body}>
      <div class="pointer-events-none fixed inset-0 z-[80]">
        <For each={boxes()}>
          {(b) => (
            <div
              class="pointer-events-none absolute rounded-sm"
              style={{
                left: `${b.left}px`,
                top: `${b.top}px`,
                width: `${b.width}px`,
                height: `${b.height}px`,
                border: `2px solid ${b.editors[0].color}`,
              }}
            >
              {
                /* Additional co-selectors get concentric inset borders so every
                  editor's color stays visible on the shared embed. */
              }
              <For each={b.editors.slice(1)}>
                {(e, i) => (
                  <div
                    class="pointer-events-none absolute rounded-sm"
                    style={{
                      inset: `${(i() + 1) * 2}px`,
                      border: `2px solid ${e.color}`,
                    }}
                  />
                )}
              </For>
              <div class="absolute -top-[18px] left-0 flex gap-1">
                <For each={b.editors}>
                  {(e) => (
                    <div
                      class="font-700 rounded px-1 text-xs whitespace-nowrap"
                      style={{ "background-color": e.color, color: "#ffffff" }}
                    >
                      {e.name}
                      {e.editingFigure
                        ? " " +
                          t3({
                            en: "\u270e visualization",
                            fr: "\u270e visualisation",
                            pt: "\u270e visualização",
                          })
                        : ""}
                    </div>
                  )}
                </For>
              </div>
            </div>
          )}
        </For>
      </div>
    </Portal>
  );
}
