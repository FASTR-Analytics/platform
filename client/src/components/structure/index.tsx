import {
  t3,
  TC,
  type FacilityFamily,
  type StructureUploadAttemptDetail,
} from "lib";
import {
  Button,
  Csv,
  FrameRight,
  FrameTop,
  HeadingBar,
  getEditorWrapper,
  createButtonAction,
  createDeleteAction,
  toNum0,
} from "panther";
import { For, Match, Show, Switch, createSignal, onMount } from "solid-js";
import { StructureUploadAttemptForm } from "~/components/structure_import";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { instanceState, structureSchemaForFamily } from "~/state/instance/t1_store";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { StructureWithCsv } from "./with_csv";

type Props = {
  family: FacilityFamily;
  backToInstance: () => void;
};

function familyLabel(family: FacilityFamily) {
  return family === "hmis"
    ? t3({ en: "HMIS facilities", fr: "Établissements SNIS", pt: "Estabelecimentos SNIS" })
    : t3({ en: "HFA facilities", fr: "Établissements Enquêtes FOSA", pt: "Estabelecimentos FOSA" });
}

// Admin areas are DERIVED from the facility rows — each facility carries its
// admin area path, and this registry's tree is exactly the distinct paths in
// it. They are created and removed by facility imports alone, so they are
// reported here rather than as a surface of their own.
function AdminAreaSummary(p: { family: FacilityFamily }) {
  const counts = () =>
    p.family === "hmis"
      ? instanceState.structure?.hmis
      : instanceState.structure?.hfa;
  const depth = () => structureSchemaForFamily(p.family).adminDepth;

  return (
    <Show when={counts()} keyed>
      {(keyedCounts) => (
        <Show when={keyedCounts.adminArea1s > 0}>
          <div class="ui-spy-sm border-t pt-3 text-sm">
            <div class="font-700">
              {t3({
                en: "Admin areas",
                fr: "Unités administratives",
                pt: "Zonas administrativas",
              })}
            </div>
            <For each={([2, 3, 4] as const).filter((l) => depth() >= l)}>
              {(level) => (
                <div class="ui-gap flex justify-between">
                  <span>{t3(getAdminAreaLabel(level))}:</span>
                  <span class="font-mono">
                    {toNum0(keyedCounts[`adminArea${level}s`])}
                  </span>
                </div>
              )}
            </For>
            <div class="ui-text-caption">
              {t3({
                en: "Derived from the facility rows — created and removed automatically by imports.",
                fr: "Dérivées des lignes d'établissements — créées et supprimées automatiquement par les importations.",
                pt: "Derivadas das linhas de estabelecimentos — criadas e removidas automaticamente pelas importações.",
              })}
            </div>
          </div>
        </Show>
      )}
    </Show>
  );
}

export function Facilities(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [csvDataIsReady, setCsvDataIsReady] = createSignal<Csv<any> | null>(null);

  const [uploadAttempt, setUploadAttempt] = createSignal<
    StructureUploadAttemptDetail | undefined
  >(undefined);

  async function fetchUploadAttempt() {
    try {
      const res = await serverActions.getStructureUploadAttempt({
        family: p.family,
      });
      if (res.success) {
        setUploadAttempt(res.data);
      } else {
        setUploadAttempt(undefined);
      }
    } catch {
      setUploadAttempt(undefined);
    }
  }

  onMount(() => {
    fetchUploadAttempt();
  });

  const attemptCreateStructureUA = createButtonAction(
    () => serverActions.addStructureUploadAttempt({ datasetFamily: p.family }),
    fetchUploadAttempt,
    openUploadAttempt,
  );

  async function openUploadAttempt() {
    const res = await openEditor({
      element: StructureUploadAttemptForm,
      props: {
        family: p.family,
        structureSchema: structureSchemaForFamily(p.family),
        silentRefreshInstance: fetchUploadAttempt,
      },
    });
    if (res?.needsReload) {
      await fetchUploadAttempt();
    }
  }

  async function attemptDeleteItems() {
    const deleteAction = createDeleteAction(
      p.family === "hmis"
        ? t3({
            en: "Are you sure you want to delete all HMIS facilities?",
            fr: "Êtes-vous sûr de vouloir supprimer tous les établissements SNIS ?",
            pt: "Tem a certeza de que pretende eliminar todos os estabelecimentos SNIS?",
          })
        : t3({
            en: "Are you sure you want to delete all HFA facilities?",
            fr: "Êtes-vous sûr de vouloir supprimer tous les établissements Enquêtes FOSA ?",
            pt: "Tem a certeza de que pretende eliminar todos os estabelecimentos FOSA?",
          }),
      () => serverActions.deleteFamilyFacilities({ family: p.family }),
      fetchUploadAttempt,
    );
    await deleteAction.click();
  }

  const facilityCount = () =>
    (p.family === "hmis"
      ? instanceState.structure?.hmis.facilities
      : instanceState.structure?.hfa.facilities) ?? 0;

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar tonal onBack={p.backToInstance} heading={familyLabel(p.family)}>
            <Show when={csvDataIsReady()}>
              <Button
                iconName="download"
                href={`${_SERVER_HOST}/structure/facilities/export/csv/${p.family}?t=${Date.now()}`}
                newTab
              >
                {t3(TC.download)}
              </Button>
            </Show>
          </HeadingBar>
        }
      >
        <FrameRight
          panelChildren={
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto">
                <div class="font-700 text-lg">
                  {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                </div>
                <Switch>
                  {/* Fetched per family, so any returned attempt is this family's. */}
                  <Match when={uploadAttempt()}>
                    <Button onClick={openUploadAttempt} iconName="upload" fullWidth>
                      {t3({ en: "Resume importing", fr: "Reprendre l'importation", pt: "Retomar a importação" })}
                    </Button>
                  </Match>
                  <Match when={true}>
                    <Button
                      onClick={attemptCreateStructureUA.click}
                      state={attemptCreateStructureUA.state()}
                      iconName="upload"
                      fullWidth
                    >
                      {t3({ en: "Import facilities", fr: "Importer des établissements", pt: "Importar estabelecimentos" })}
                    </Button>
                  </Match>
                </Switch>
                <Show when={facilityCount() > 0}>
                  <Button
                    onClick={attemptDeleteItems}
                    intent="danger"
                    outline
                    iconName="trash"
                    fullWidth
                  >
                    {t3({ en: "Delete facilities", fr: "Supprimer les établissements", pt: "Eliminar estabelecimentos" })}
                  </Button>
                </Show>

                <AdminAreaSummary family={p.family} />
              </div>
            </Show>
          }
        >
          <div class="h-full w-full">
            <Show
              when={facilityCount() > 0}
              fallback={
                <div class="ui-pad">
                  {t3({ en: "No facilities imported", fr: "Aucun établissement importé", pt: "Nenhum estabelecimento importado" })}
                </div>
              }
            >
              <StructureWithCsv
                family={p.family}
                onCsvReady={(csv) => setCsvDataIsReady(csv)}
              />
            </Show>
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}
