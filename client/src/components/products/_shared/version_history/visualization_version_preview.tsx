import {
  canonicalJson,
  type FigureBundle,
  t3,
  type VisualizationVersionDetail,
} from "lib";
import {
  Button,
  ButtonGroup,
  createQuery,
  openAlert,
  openComponent,
  openConfirm,
  StateHolderWrapper,
} from "panther";
import { createSignal, type JSX, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { productById } from "~/state/instance/t1_store";
import { ReportFigureEmbed } from "../mod.ts";
import { CopyVersionModal } from "./copy_version_modal";

type PreviewMode = "edits" | "preview";

// Read-only render of one visualization version: what its editing session
// changed (the figure before and after, and a rename), or the figure as the
// version froze it. A version's figure keeps the package and scope it was
// drawn from, so an old version shows the data it showed then.
export function VisualizationVersionPreview(p: {
  productId: string;
  versionId: string;
  /** The version immediately BEFORE this one: the session view compares
   *  against it. undefined = this is the oldest stored version. */
  previousVersionId?: string;
  canRestore: boolean;
  onRestored: () => void;
}) {
  const version = createQuery(
    () =>
      serverActions.getVisualizationVersion({
        product_id: p.productId,
        version_id: p.versionId,
      }),
    t3({
      en: "Loading version...",
      fr: "Chargement de la version...",
      pt: "A carregar a versão...",
    }),
  );

  const [mode, setMode] = createSignal<PreviewMode>("edits");

  async function restore() {
    const ok = await openConfirm({
      title: t3({
        en: "Restore this version?",
        fr: "Restaurer cette version ?",
        pt: "Restaurar esta versão?",
      }),
      text: t3({
        en:
          "The visualization will be reset to this version. Its current state is saved as a version first, so nothing is lost. If this version was drawn from a different results package or scope, the visualization is updated to its current one the next time someone opens it to edit.",
        fr:
          "La visualisation sera réinitialisée à cette version. Son état actuel est d'abord enregistré comme version, rien n'est donc perdu. Si cette version provient d'un autre paquet de résultats ou d'une autre portée, la visualisation est mise à jour vers les actuels la prochaine fois que quelqu'un l'ouvre pour la modifier.",
        pt:
          "A visualização será reposta para esta versão. O seu estado atual é primeiro guardado como versão, por isso nada se perde. Se esta versão foi criada a partir de outro pacote de resultados ou âmbito, a visualização é atualizada para os atuais da próxima vez que alguém a abrir para editar.",
      }),
      confirmButtonLabel: t3({
        en: "Restore",
        fr: "Restaurer",
        pt: "Restaurar",
      }),
    });
    if (!ok) {
      return;
    }
    const res = await serverActions.restoreVisualizationVersion({
      product_id: p.productId,
      version_id: p.versionId,
    });
    if (!res.success) {
      await openAlert({ text: res.err, intent: "danger" });
      return;
    }
    p.onRestored();
  }

  async function restoreAsCopy(v: VisualizationVersionDetail) {
    await openComponent({
      element: CopyVersionModal,
      props: {
        header: t3({
          en: "Restore as copy",
          fr: "Restaurer comme copie",
          pt: "Restaurar como cópia",
        }),
        initialLabel: `${v.label} (${
          new Date(v.createdAt).toLocaleDateString()
        })`,
        save: (label: string) =>
          serverActions.copyVisualizationVersion({
            product_id: p.productId,
            version_id: p.versionId,
            label,
            folderId: productById(p.productId)?.folderId ?? null,
          }),
      },
    });
  }

  return (
    <StateHolderWrapper state={version.state()} loadingAndErrorPad="md">
      {(v) => (
        <div class="flex h-full min-h-0 flex-col">
          <div class="ui-pad flex items-center gap-4 border-b">
            <ButtonGroup<PreviewMode>
              items={[
                {
                  id: "edits",
                  label: t3({
                    en: "Edits in this session",
                    fr: "Modifications de cette session",
                    pt: "Edições desta sessão",
                  }),
                },
                {
                  id: "preview",
                  label: t3({
                    en: "Preview",
                    fr: "Aperçu",
                    pt: "Pré-visualização",
                  }),
                },
              ]}
              value={mode()}
              onChange={(m) => m && setMode(m)}
            />
          </div>
          <div class="bg-base-200 min-h-0 flex-1 overflow-auto px-8 py-6">
            <Show
              when={mode() === "edits"}
              fallback={
                <div class="bg-base-100 mx-auto w-full max-w-4xl rounded border p-4">
                  <ReportFigureEmbed
                    figure={{ type: "figure", bundle: v.bundle }}
                  />
                </div>
              }
            >
              <SessionEdits
                productId={p.productId}
                version={v}
                previousVersionId={p.previousVersionId}
              />
            </Show>
          </div>
          <div class="ui-pad ui-gap-sm flex items-center border-t">
            <div class="flex-1" />
            <Button outline onClick={() => restoreAsCopy(v)}>
              {t3({
                en: "Restore as copy",
                fr: "Restaurer comme copie",
                pt: "Restaurar como cópia",
              })}
            </Button>
            <Show when={p.canRestore}>
              <Button onClick={() => void restore()}>
                {t3({ en: "Restore", fr: "Restaurer", pt: "Restaurar" })}
              </Button>
            </Show>
          </div>
        </div>
      )}
    </StateHolderWrapper>
  );
}

// This version against the one before it. The oldest version has nothing
// before it: its session made the visualization.
function SessionEdits(p: {
  productId: string;
  version: VisualizationVersionDetail;
  previousVersionId?: string;
}) {
  // Wrapped in an object: StateHolderWrapper renders nothing for falsy
  // ready-data, and the oldest version has no predecessor.
  const previous = createQuery<
    { label: string; bundle: FigureBundle } | { none: true }
  >(
    async () => {
      if (!p.previousVersionId) {
        return { success: true as const, data: { none: true as const } };
      }
      const res = await serverActions.getVisualizationVersion({
        product_id: p.productId,
        version_id: p.previousVersionId,
      });
      return res.success
        ? {
          success: true as const,
          data: { label: res.data.label, bundle: res.data.bundle },
        }
        : res;
    },
    t3({
      en: "Loading session edits...",
      fr: "Chargement des modifications...",
      pt: "A carregar as edições...",
    }),
  );

  const figure = (bundle: FigureBundle) => (
    <ReportFigureEmbed figure={{ type: "figure", bundle }} />
  );

  return (
    <StateHolderWrapper state={previous.state()} loadingAndErrorPad="md">
      {(prev) => {
        if ("none" in prev) {
          return (
            <div class="mx-auto w-full max-w-4xl">
              <div class="ui-text-caption mb-2">
                {t3({
                  en:
                    "First version: the visualization was created in this session.",
                  fr:
                    "Première version : la visualisation a été créée dans cette session.",
                  pt:
                    "Primeira versão: a visualização foi criada nesta sessão.",
                })}
              </div>
              <Card>{figure(p.version.bundle)}</Card>
            </div>
          );
        }
        const renamed = prev.label !== p.version.label;
        const figureChanged = bundleContent(prev.bundle) !==
          bundleContent(p.version.bundle);
        const redrawn = prev.bundle.provenance.runId !==
            p.version.bundle.provenance.runId ||
          prev.bundle.scope.definitionHash !==
            p.version.bundle.scope.definitionHash;
        return (
          <div class="ui-spy mx-auto w-full max-w-4xl">
            <Show when={renamed}>
              <Card>
                <div class="text-sm">
                  {t3({
                    en: "Renamed from",
                    fr: "Renommée depuis",
                    pt: "Renomeada de",
                  })} <span class="font-700">“{prev.label}”</span>{" "}
                  {t3({ en: "to", fr: "en", pt: "para" })}{" "}
                  <span class="font-700">“{p.version.label}”</span>
                </div>
              </Card>
            </Show>
            <Show when={figureChanged}>
              <Card>
                <Show when={redrawn}>
                  <div class="ui-text-caption mb-2">
                    {t3({
                      en:
                        "Drawn from a different results package or scope than the version before.",
                      fr:
                        "Créée à partir d'un autre paquet de résultats ou d'une autre portée que la version précédente.",
                      pt:
                        "Criada a partir de outro pacote de resultados ou âmbito que a versão anterior.",
                    })}
                  </div>
                </Show>
                <div class="grid grid-cols-2 gap-3">
                  <div class="opacity-60">
                    <div class="ui-text-caption mb-1">
                      {t3({ en: "Before", fr: "Avant", pt: "Antes" })}
                    </div>
                    {figure(prev.bundle)}
                  </div>
                  <div>
                    <div class="ui-text-caption mb-1">
                      {t3({ en: "After", fr: "Après", pt: "Depois" })}
                    </div>
                    {figure(p.version.bundle)}
                  </div>
                </div>
              </Card>
            </Show>
            <Show when={!renamed && !figureChanged}>
              <div class="text-base-content-muted py-8 text-center text-sm">
                {t3({
                  en: "No changes in this session.",
                  fr: "Aucune modification dans cette session.",
                  pt: "Sem alterações nesta sessão.",
                })}
              </div>
            </Show>
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}

function Card(p: { children: JSX.Element }) {
  return <div class="bg-base-100 rounded border p-3">{p.children}</div>;
}

// What a version's figure shows, as the server's content hash reads it: the
// bundle without the stamp every data refetch renews.
function bundleContent(bundle: FigureBundle): string {
  const { snapshotAt: _snapshotAt, ...rest } = bundle;
  return canonicalJson(rest);
}
