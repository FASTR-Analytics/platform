import {
  canonicalJson,
  type FigureBlock,
  findReportEmbeds,
  type ImageBlock,
  type ReportFormat,
  type ReportVersionDetail,
  t3,
} from "lib";
import {
  Button,
  ButtonGroup,
  createQuery,
  MarkdownPresentationJsx,
  openAlert,
  openComponent,
  openConfirm,
  StateHolderWrapper,
} from "panther";
import { createSignal, For, type JSX, onCleanup, Show } from "solid-js";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { ReportFigureEmbed } from "../report/ReportFigureEmbed";
import { REPORT_MARKDOWN_STYLE } from "../report/report_markdown_style";
import { ReportHtmlPreview } from "../report/report_html_preview";
import {
  createFigureRasterCache,
  type FigureInkTheme,
} from "../report/report_figure_raster";
import { CopyVersionModal } from "./copy_version_modal";
import {
  buildAuthorNames,
  DiffLegend,
  DiffSegments,
  editorDisplayNames,
} from "./diff_segments";
import { ReportVersionCompare } from "./report_version_compare";
import { computeAttributedDiff, type DiffSegment } from "./version_diff";

type PreviewMode = "edits" | "preview";

// Read-only render of one report version — the same markdown funnel as the
// report View mode, but embed tokens resolve against the version's SNAPSHOT
// figure/image registries, so the preview shows the document as it was then.
export function ReportVersionPreview(p: {
  projectId: string;
  reportId: string;
  versionId: string;
  /** The version immediately BEFORE this one — the session-edits view diffs
   *  against it. undefined = this is the oldest stored version. */
  previousVersionId?: string;
  canRestore: boolean;
  /** Live body accessor for "Compare with current". */
  getCurrentBody?: () => string;
  /** The report's body format (fixed at creation; every version shares it). */
  format: ReportFormat;
  /** fastr only: the CURRENT theme stylesheet. The theme is not part of a
   *  version snapshot (it lives in config, not the body), so an old version
   *  renders in whatever theme the report wears today. */
  fastrThemeCss?: string;
  figureInkTheme?: FigureInkTheme;
  onRestored: () => void;
}) {
  const version = createQuery(
    () =>
      serverActions.getReportVersion({
        projectId: p.projectId,
        report_id: p.reportId,
        version_id: p.versionId,
      }),
    t3({ en: "Loading version...", fr: "Chargement de la version...", pt: "A carregar a versão..." }),
  );

  // What the selected session changed, shown by default (Google-Docs-style);
  // toggle to the rendered preview of the snapshot.
  const [mode, setMode] = createSignal<PreviewMode>("edits");

  function renderEmbedFor(v: ReportVersionDetail) {
    return (src: string, alt: string, line?: number): JSX.Element | undefined => {
      const fig = /^figure:(.+)$/.exec(src);
      if (fig) {
        const fb = v.figures[fig[1]];
        return fb ? (
          <div class="ui-pad my-4 rounded border" data-line={line}>
            <ReportFigureEmbed figure={fb} />
          </div>
        ) : (
          <div class="text-danger text-xs" data-line={line}>
            {t3({
              en: "Missing visualization:",
              fr: "Visualisation manquante :",
              pt: "Visualização em falta:",
            })}{" "}
            {fig[1]}
          </div>
        );
      }
      const img = /^image:(.+)$/.exec(src);
      if (img) {
        const ib = v.images[img[1]];
        return ib ? (
          <img
            class="w-full"
            src={`${_SERVER_HOST}/${ib.imgFile}`}
            alt={alt}
            data-line={line}
          />
        ) : (
          <div class="text-danger text-xs" data-line={line}>
            {t3({ en: "Missing image:", fr: "Image manquante :", pt: "Imagem em falta:" })} {img[1]}
          </div>
        );
      }
      return undefined;
    };
  }

  async function compareWithCurrent(v: ReportVersionDetail) {
    await openComponent({
      element: ReportVersionCompare,
      props: {
        projectId: p.projectId,
        reportId: p.reportId,
        versionId: v.id,
        currentBody: p.getCurrentBody?.() ?? "",
      },
    });
  }

  async function restore(v: ReportVersionDetail) {
    const ok = await openConfirm({
      title: t3({ en: "Restore this version?", fr: "Restaurer cette version ?", pt: "Restaurar esta versão?" }),
      text: t3({
        en: "The report will be reset to this version. Your current content is saved as a version first — nothing is lost.",
        fr: "Le rapport sera réinitialisé à cette version. Votre contenu actuel est d'abord enregistré comme version — rien n'est perdu.",
        pt: "O relatório será reposto para esta versão. O seu conteúdo atual é primeiro guardado como versão — nada se perde.",
      }),
      confirmButtonLabel: t3({ en: "Restore", fr: "Restaurer", pt: "Restaurar" }),
    });
    if (!ok) {
      return;
    }
    const res = await serverActions.restoreReportVersion({
      projectId: p.projectId,
      report_id: p.reportId,
      version_id: v.id,
    });
    if (!res.success) {
      await openAlert({ text: res.err, intent: "danger" });
      return;
    }
    p.onRestored();
  }

  async function restoreAsCopy(v: ReportVersionDetail) {
    await openComponent({
      element: CopyVersionModal,
      props: {
        header: t3({ en: "Restore as copy", fr: "Restaurer comme copie", pt: "Restaurar como cópia" }),
        initialLabel: `${v.label} (${new Date(v.createdAt).toLocaleDateString()})`,
        save: (label: string) =>
          serverActions.copyReportVersion({
            projectId: p.projectId,
            report_id: p.reportId,
            version_id: p.versionId,
            label,
          }),
      },
    });
  }

  return (
    <StateHolderWrapper state={version.state()}>
      {(v) => (
        <div class="flex h-full min-h-0 flex-col">
          <div class="ui-pad flex items-center gap-4 border-b">
            <ButtonGroup<PreviewMode>
              items={[
                {
                  id: "edits",
                  label: t3({ en: "Edits in this session", fr: "Modifications de cette session", pt: "Edições desta sessão" }),
                },
                {
                  id: "preview",
                  label: t3({ en: "Preview", fr: "Aperçu", pt: "Pré-visualização" }),
                },
              ]}
              value={mode()}
              onChange={(m) => m && setMode(m)}
            />
            <Show when={mode() === "edits"}>
              <DiffLegend />
            </Show>
          </div>
          <Show
            when={mode() === "edits"}
            fallback={
              <Show
                when={p.format !== "markdown"}
                fallback={
                  <div class="bg-base-200 min-h-0 flex-1 overflow-auto px-8 py-10">
                    <div class="bg-base-100 md-dark-adapt mx-auto min-h-full w-full max-w-4xl rounded px-6 py-10 shadow-floating">
                      <MarkdownPresentationJsx
                        markdown={v.body}
                        renderImage={renderEmbedFor(v)}
                        style={REPORT_MARKDOWN_STYLE}
                      />
                    </div>
                  </div>
                }
              >
                <HtmlVersionPreview
                  version={v}
                  format={p.format}
                  themeCss={p.fastrThemeCss}
                  inkTheme={p.figureInkTheme}
                />
              </Show>
            }
          >
            <SessionEdits
              projectId={p.projectId}
              reportId={p.reportId}
              version={v}
              previousVersionId={p.previousVersionId}
              format={p.format}
            />
          </Show>
          <div class="ui-pad ui-gap-sm flex items-center border-t">
            <Show when={p.getCurrentBody}>
              <Button outline onClick={() => compareWithCurrent(v)}>
                {t3({ en: "Compare with current", fr: "Comparer avec l'actuel", pt: "Comparar com o atual" })}
              </Button>
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
      )}
    </StateHolderWrapper>
  );
}

// Read-only render of an HTML-format version — the same sandboxed-iframe
// funnel as the report's View mode, against the version's SNAPSHOT registries,
// with its own raster cache (disposed with the pane).
function HtmlVersionPreview(p: {
  version: ReportVersionDetail;
  format: ReportFormat;
  themeCss?: string;
  inkTheme?: FigureInkTheme;
}) {
  const [rasterTick, setRasterTick] = createSignal(0);
  const rasters = createFigureRasterCache(() => setRasterTick((t) => t + 1));
  onCleanup(() => rasters.dispose());
  return (
    <div class="bg-base-200 min-h-0 flex-1 overflow-hidden px-8 py-10">
      <ReportHtmlPreview
        class="shadow-floating mx-auto block h-full w-full max-w-4xl rounded border-0 bg-white"
        body={p.version.body}
        title={p.version.label}
        figures={p.version.figures}
        images={p.version.images}
        assetUrl={(imgFile) => `${_SERVER_HOST}/${imgFile}`}
        rasters={rasters}
        rasterVersion={rasterTick()}
        lightInk={p.inkTheme}
        format={p.format}
        themeCss={p.themeCss}
        lineAnchors={false}
      />
    </div>
  );
}

// The diff this version's editing session produced, i.e. this version vs the
// one immediately before it. The oldest version diffs against an empty
// document — the session that created the report.
function SessionEdits(p: {
  projectId: string;
  reportId: string;
  version: ReportVersionDetail;
  previousVersionId?: string;
  format: ReportFormat;
}) {
  // The snapshot is wrapped in an object because StateHolderWrapper renders
  // nothing for falsy ready-data — a bare "" (the oldest version's base)
  // would blank the whole pane. Figures/images ride along so the session view
  // can show visualization changes, not just body text.
  const previous = createQuery<{
    body: string;
    figures: Record<string, FigureBlock>;
    images: Record<string, ImageBlock>;
  }>(
    async () => {
      if (!p.previousVersionId) {
        return { success: true as const, data: { body: "", figures: {}, images: {} } };
      }
      const res = await serverActions.getReportVersion({
        projectId: p.projectId,
        report_id: p.reportId,
        version_id: p.previousVersionId,
      });
      return res.success
        ? {
          success: true as const,
          data: {
            body: res.data.body,
            figures: res.data.figures,
            images: res.data.images,
          },
        }
        : res;
    },
    t3({ en: "Loading session edits...", fr: "Chargement des modifications...", pt: "A carregar as edições..." }),
  );

  return (
    <StateHolderWrapper state={previous.state()}>
      {(prev) => {
        const segments = computeAttributedDiff([
          { body: prev.body, label: "" },
          {
            body: p.version.body,
            label: editorDisplayNames(p.version.editors),
            labelExact: p.version.editors.length === 1,
            labelEmail: p.version.editors.length === 1
              ? p.version.editors[0].email
              : undefined,
            authors: p.version.bodyAuthors,
            names: buildAuthorNames(p.version.editors, p.version.bodyAuthors),
          },
        ]);
        const figChanges = diffRegistry(prev.figures, p.version.figures);
        const imgChanges = diffRegistry(prev.images, p.version.images);
        const hasVizChanges = figChanges.length > 0 || imgChanges.length > 0;
        // Embed tokens of in-place-edited figures/images read as unchanged
        // text — mark them so the body diff highlights WHERE the changed
        // visualization sits (session-level attribution; registries have no
        // per-editor ledger).
        const editedKeys = new Set(
          [...figChanges, ...imgChanges]
            .filter((c) => c.kind === "edited")
            .map((c) => c.key),
        );
        const marked = markEditedEmbeds(segments, editedKeys, p.format, {
          who: editorDisplayNames(p.version.editors) || undefined,
          whoExact: p.version.editors.length === 1,
          whoEmail: p.version.editors.length === 1
            ? p.version.editors[0].email
            : undefined,
        });
        const hasChanges = marked.some((s) => s.kind !== "same");
        // key -> the embed's alt text, so each change card carries the same
        // name as its highlighted token in the body diff (current body first —
        // freshest alt; prev body covers removed embeds).
        const embedLabels = collectEmbedLabels([p.version.body, prev.body], p.format);
        return (
          <div class="bg-base-200 min-h-0 flex-1 overflow-auto px-8 py-6">
            <Show when={!p.previousVersionId}>
              <div class="ui-text-caption mx-auto mb-2 w-full max-w-4xl">
                {t3({
                  en: "First version — the whole document was created in this session.",
                  fr: "Première version — l'ensemble du document a été créé dans cette session.",
                  pt: "Primeira versão — todo o documento foi criado nesta sessão.",
                })}
              </div>
            </Show>
            <Show when={hasChanges}>
              <div class="bg-base-100 mx-auto w-full max-w-4xl rounded border p-4">
                <DiffSegments segments={marked} />
              </div>
            </Show>
            <Show when={!hasChanges && !hasVizChanges}>
              <div class="text-neutral py-8 text-center text-sm">
                {t3({
                  en: "No text changes in this session.",
                  fr: "Aucune modification de texte dans cette session.",
                  pt: "Sem alterações de texto nesta sessão.",
                })}
              </div>
            </Show>
            <Show when={hasVizChanges}>
              <div
                class="mx-auto w-full max-w-4xl"
                classList={{ "mt-6": hasChanges }}
              >
                <div class="mb-2 text-sm font-semibold">
                  {t3({
                    en: "Visualization & image changes",
                    fr: "Modifications des visualisations et des images",
                    pt: "Alterações de visualizações e imagens",
                  })}
                </div>
                <For each={figChanges}>
                  {(ch) => (
                    <VizChangeRow
                      kind={ch.kind}
                      what="figure"
                      label={embedLabels.get(ch.key) ??
                        (ch.newVal ?? ch.oldVal)?.bundle?.config.t.caption}
                      old={ch.oldVal && <ReportFigureEmbed figure={ch.oldVal} />}
                      neu={ch.newVal && <ReportFigureEmbed figure={ch.newVal} />}
                    />
                  )}
                </For>
                <For each={imgChanges}>
                  {(ch) => (
                    <VizChangeRow
                      kind={ch.kind}
                      what="image"
                      label={embedLabels.get(ch.key)}
                      old={ch.oldVal && (
                        <img
                          class="max-h-64 w-full object-contain"
                          src={`${_SERVER_HOST}/${ch.oldVal.imgFile}`}
                          alt=""
                        />
                      )}
                      neu={ch.newVal && (
                        <img
                          class="max-h-64 w-full object-contain"
                          src={`${_SERVER_HOST}/${ch.newVal.imgFile}`}
                          alt=""
                        />
                      )}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}

type RegistryChange<T> = {
  key: string;
  kind: "added" | "removed" | "edited";
  oldVal?: T;
  newVal?: T;
};

// Key-by-key comparison of a version's figure/image registry against its
// predecessor's — canonicalJson kills key-order nondeterminism, mirroring the
// version content hash.
function diffRegistry<T>(
  prev: Record<string, T>,
  next: Record<string, T>,
): RegistryChange<T>[] {
  const out: RegistryChange<T>[] = [];
  for (const [key, val] of Object.entries(next)) {
    const old = prev[key];
    if (old === undefined) {
      out.push({ key, kind: "added", newVal: val });
    } else if (canonicalJson(old) !== canonicalJson(val)) {
      out.push({ key, kind: "edited", oldVal: old, newVal: val });
    }
  }
  for (const [key, val] of Object.entries(prev)) {
    if (!(key in next)) {
      out.push({ key, kind: "removed", oldVal: val });
    }
  }
  return out;
}

// key -> caption of the first embed token referencing it, across the given
// bodies in priority order.
function collectEmbedLabels(
  bodies: string[],
  format: ReportFormat,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const body of bodies) {
    for (const ref of findReportEmbeds(body, format)) {
      if (ref.caption && !out.has(ref.id)) {
        out.set(ref.id, ref.caption);
      }
    }
  }
  return out;
}

// Split "same" segments around embed tokens whose figure/image was edited in
// place, re-tagging the token as an "edited" span — the body diff then shows
// where the changed visualization sits. Tokens whose surrounding text also
// changed are already highlighted by the text diff itself.
function markEditedEmbeds(
  segments: DiffSegment[],
  editedKeys: Set<string>,
  format: ReportFormat,
  who: { who?: string; whoExact?: boolean; whoEmail?: string },
): DiffSegment[] {
  if (editedKeys.size === 0) {
    return segments;
  }
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    if (seg.kind !== "same") {
      out.push(seg);
      continue;
    }
    let pos = 0;
    for (const ref of findReportEmbeds(seg.text, format)) {
      if (!editedKeys.has(ref.id)) {
        continue;
      }
      if (ref.start > pos) {
        out.push({ text: seg.text.slice(pos, ref.start), kind: "same" });
      }
      out.push({ text: ref.raw, kind: "edited", ...who });
      pos = ref.end;
    }
    if (pos === 0) {
      out.push(seg);
    } else if (pos < seg.text.length) {
      out.push({ text: seg.text.slice(pos), kind: "same" });
    }
  }
  return out;
}

// One changed figure/image: a labeled card with the before/after snapshots
// side by side (only the surviving side for adds/removals). Attribution stays
// session-level — registries have no per-editor ledger.
function VizChangeRow(p: {
  kind: "added" | "removed" | "edited";
  what: "figure" | "image";
  /** The embed's alt text (or bundle caption) — ties the card to its
   *  highlighted token in the body diff. */
  label?: string;
  old?: JSX.Element;
  neu?: JSX.Element;
}) {
  const whatLabel = p.what === "figure"
    ? t3({ en: "Visualization", fr: "Visualisation", pt: "Visualização" })
    : t3({ en: "Image", fr: "Image", pt: "Imagem" });
  const kindLabel = p.kind === "added"
    ? t3({ en: "added in this session", fr: "ajoutée dans cette session", pt: "adicionada nesta sessão" })
    : p.kind === "removed"
    ? t3({ en: "removed in this session", fr: "supprimée dans cette session", pt: "removida nesta sessão" })
    : t3({ en: "edited in this session", fr: "modifiée dans cette session", pt: "editada nesta sessão" });
  return (
    <div class="bg-base-100 mb-4 rounded border p-3">
      <div class="ui-text-caption mb-2">
        {whatLabel}
        <Show when={p.label}>
          {" "}<span class="font-semibold">“{p.label}”</span>
        </Show>
        {" "}— {kindLabel}
      </div>
      <div classList={{ "grid grid-cols-2 gap-3": p.kind === "edited" }}>
        <Show when={p.old}>
          <div class="opacity-60">
            <Show when={p.kind === "edited"}>
              <div class="ui-text-caption mb-1">
                {t3({ en: "Before", fr: "Avant", pt: "Antes" })}
              </div>
            </Show>
            {p.old}
          </div>
        </Show>
        <Show when={p.neu}>
          <div>
            <Show when={p.kind === "edited"}>
              <div class="ui-text-caption mb-1">
                {t3({ en: "After", fr: "Après", pt: "Depois" })}
              </div>
            </Show>
            {p.neu}
          </div>
        </Show>
      </div>
    </div>
  );
}
