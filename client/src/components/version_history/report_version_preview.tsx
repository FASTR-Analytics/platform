import { type ReportVersionDetail, t3 } from "lib";
import {
  Button,
  createQuery,
  MarkdownPresentationJsx,
  openAlert,
  openComponent,
  openConfirm,
  StateHolderWrapper,
} from "panther";
import { type JSX, Show } from "solid-js";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { ReportFigureEmbed } from "../report/ReportFigureEmbed";
import { ReportMarkdownDiff } from "../report/ReportMarkdownDiff";
import { REPORT_MARKDOWN_STYLE } from "../report/report_markdown_style";
import { CopyVersionModal } from "./copy_version_modal";

// Read-only render of one report version — the same markdown funnel as the
// report View mode, but embed tokens resolve against the version's SNAPSHOT
// figure/image registries, so the preview shows the document as it was then.
export function ReportVersionPreview(p: {
  projectId: string;
  reportId: string;
  versionId: string;
  canRestore: boolean;
  /** Live body accessor for "Compare with current". */
  getCurrentBody?: () => string;
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

  function renderEmbedFor(v: ReportVersionDetail) {
    return (src: string, alt: string, line?: number): JSX.Element | undefined => {
      const fig = /^figure:(.+)$/.exec(src);
      if (fig) {
        const fb = v.figures[fig[1]];
        return fb ? (
          <div class="border-base-300 ui-pad my-4 rounded border" data-line={line}>
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
      element: ReportMarkdownDiff,
      props: {
        oldText: v.body,
        newText: p.getCurrentBody?.() ?? "",
        summary: t3({
          en: "This version (left) vs current (right)",
          fr: "Cette version (gauche) vs actuelle (droite)",
          pt: "Esta versão (esquerda) vs atual (direita)",
        }),
        mode: "view" as const,
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
    if (!ok) return;
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
          <div class="bg-base-200 min-h-0 flex-1 overflow-auto px-8 py-10">
            <div class="bg-base-100 mx-auto min-h-full w-full max-w-4xl rounded px-6 py-10 shadow-2xl">
              <MarkdownPresentationJsx
                markdown={v.body}
                renderImage={renderEmbedFor(v)}
                style={REPORT_MARKDOWN_STYLE}
              />
            </div>
          </div>
          <div class="border-base-300 ui-pad ui-gap-sm flex items-center border-t">
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
