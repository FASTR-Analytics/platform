import {
  ALL_ADMIN_AREA_LEVELS,
  type FacilityFamily,
  type StructureUploadAttemptDetail,
  t3,
  TC,
} from "lib";
import {
  Button,
  createButtonAction,
  createDeleteAction,
  Csv,
  FrameRight,
  FrameTop,
  getEditorWrapper,
  HeadingBar,
  toNum0,
} from "panther";
import { createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import {
  HfaRegistryTable,
  removeUnreferencedHfaFacilities,
} from "./hfa_registry/mod.ts";
import { StructureUploadAttemptForm } from "./import/mod.ts";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import {
  instanceState,
  structureSchemaForFamily,
} from "~/state/instance/t1_store";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { StructureWithCsv } from "./with_csv";
import { can } from "~/state/instance/permissions";

type Props = {
  family: FacilityFamily;
  close: (v: undefined) => void;
};

function familyLabel(family: FacilityFamily) {
  return family === "hmis"
    ? t3({
      en: "HMIS facilities",
      fr: "Établissements SNIS",
      pt: "Estabelecimentos SNIS",
    })
    : t3({
      en: "HFA facilities",
      fr: "Établissements Enquêtes FOSA",
      pt: "Estabelecimentos FOSA",
    });
}

// Admin areas are DERIVED from the facility rows: each facility carries its
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
            <div class="ui-text-heading">
              {t3({
                en: "Admin areas",
                fr: "Unités administratives",
                pt: "Zonas administrativas",
              })}
            </div>
            <For each={ALL_ADMIN_AREA_LEVELS.filter((l) => depth() >= l)}>
              {(level) => (
                <div class="ui-gap flex justify-between">
                  <span>{t3(getAdminAreaLabel(level))}:</span>
                  <span>
                    {toNum0(keyedCounts[`adminArea${level}s`])}
                  </span>
                </div>
              )}
            </For>
            <div class="ui-text-caption">
              {t3({
                en:
                  "Derived from the facility rows — created and removed automatically by imports.",
                fr:
                  "Dérivées des lignes d'établissements — créées et supprimées automatiquement par les importations.",
                pt:
                  "Derivadas das linhas de estabelecimentos — criadas e removidas automaticamente pelas importações.",
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

  const [csvDataIsReady, setCsvDataIsReady] = createSignal<Csv<any> | null>(
    null,
  );

  const [uploadAttempt, setUploadAttempt] = createSignal<
    StructureUploadAttemptDetail | undefined
  >(undefined);

  // HFA facilities come from each round's data import, never from here, and
  // only the Imports panel, a configure control, reads the attempt.
  async function fetchUploadAttempt() {
    if (p.family !== "hmis" || !can("can_configure_data")) {
      return;
    }
    try {
      const res = await serverActions.getStructureUploadAttempt({});
      if (res.success) {
        setUploadAttempt(res.data);
      } else {
        setUploadAttempt(undefined);
      }
    } catch {
      setUploadAttempt(undefined);
    }
  }

  onMount(fetchUploadAttempt);

  const attemptCreateStructureUA = createButtonAction(
    () => serverActions.addStructureUploadAttempt({}),
    fetchUploadAttempt,
    openUploadAttempt,
  );

  async function openUploadAttempt() {
    const res = await openEditor({
      element: StructureUploadAttemptForm,
      props: {
        structureSchema: structureSchemaForFamily("hmis"),
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
          fr:
            "Êtes-vous sûr de vouloir supprimer tous les établissements SNIS ?",
          pt:
            "Tem a certeza de que pretende eliminar todos os estabelecimentos SNIS?",
        })
        : t3({
          en: "Are you sure you want to delete all HFA facilities?",
          fr:
            "Êtes-vous sûr de vouloir supprimer tous les établissements Enquêtes FOSA ?",
          pt:
            "Tem a certeza de que pretende eliminar todos os estabelecimentos FOSA?",
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

  // The HMIS CSV table runs edge to edge, as every TableFromCsv page does.
  const csvTableShown = () => p.family === "hmis" && facilityCount() > 0;

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            onBack={() => p.close(undefined)}
            heading={familyLabel(p.family)}
          >
            <Show
              when={p.family === "hfa" ? facilityCount() > 0 : csvDataIsReady()}
            >
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
          pad={csvTableShown() ? undefined : "md"}
          panelChildren={
            <Show when={can("can_configure_data")}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto">
                <Switch>
                  <Match when={p.family === "hfa"}>
                    <div class="text-base-content-muted text-sm">
                      {t3({
                        en:
                          "HFA facilities are added and updated by each time point's data import. Click a facility to edit it.",
                        fr:
                          "Les établissements HFA sont ajoutés et mis à jour par l'importation des données de chaque point temporel. Cliquez sur un établissement pour le modifier.",
                        pt:
                          "Os estabelecimentos HFA são acrescentados e atualizados pela importação de dados de cada ponto temporal. Clique num estabelecimento para o editar.",
                      })}
                    </div>
                    <Show when={facilityCount() > 0}>
                      <div class="ui-spy-sm">
                        <div class="ui-text-heading">
                          {t3({
                            en: "Unused facilities",
                            fr: "Établissements inutilisés",
                            pt: "Estabelecimentos não utilizados",
                          })}
                        </div>
                        <div class="text-base-content-muted text-sm">
                          {t3({
                            en:
                              "Facilities with no data and no weights can be removed.",
                            fr:
                              "Les établissements sans données ni pondérations peuvent être supprimés.",
                            pt:
                              "Os estabelecimentos sem dados nem ponderações podem ser removidos.",
                          })}
                        </div>
                        <Button
                          onClick={() => void removeUnreferencedHfaFacilities()}
                          intent="danger"
                          outline
                          iconName="trash"
                          fullWidth
                        >
                          {t3({ en: "Remove", fr: "Supprimer", pt: "Remover" })}
                        </Button>
                      </div>
                    </Show>
                  </Match>
                  <Match when={p.family === "hmis"}>
                    <div class="ui-text-heading">
                      {t3({
                        en: "Imports",
                        fr: "Importations",
                        pt: "Importações",
                      })}
                    </div>
                    <Switch>
                      <Match when={uploadAttempt()}>
                        <Button
                          onClick={openUploadAttempt}
                          iconName="upload"
                          fullWidth
                        >
                          {t3({
                            en: "Resume importing",
                            fr: "Reprendre l'importation",
                            pt: "Retomar a importação",
                          })}
                        </Button>
                      </Match>
                      <Match when={true}>
                        <Button
                          onClick={attemptCreateStructureUA.click}
                          state={attemptCreateStructureUA.state()}
                          iconName="upload"
                          fullWidth
                        >
                          {t3({
                            en: "Import facilities",
                            fr: "Importer des établissements",
                            pt: "Importar estabelecimentos",
                          })}
                        </Button>
                      </Match>
                    </Switch>
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
                    {t3({
                      en: "Delete facilities",
                      fr: "Supprimer les établissements",
                      pt: "Eliminar estabelecimentos",
                    })}
                  </Button>
                </Show>

                <AdminAreaSummary family={p.family} />
              </div>
            </Show>
          }
        >
          <Show
            when={facilityCount() > 0}
            fallback={t3({
              en: "No facilities imported",
              fr: "Aucun établissement importé",
              pt: "Nenhum estabelecimento importado",
            })}
          >
            <Switch>
              <Match when={p.family === "hfa"}>
                <HfaRegistryTable />
              </Match>
              <Match when={p.family === "hmis"}>
                <StructureWithCsv
                  family={p.family}
                  onCsvReady={(csv) => setCsvDataIsReady(csv)}
                />
              </Match>
            </Switch>
          </Show>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}
