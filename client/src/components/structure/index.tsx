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
  getEditorWrapper,
  createButtonAction,
  createDeleteAction,
} from "panther";
import { Match, Show, Switch, createSignal, onMount } from "solid-js";
import { StructureUploadAttemptForm } from "~/components/structure_import";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
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
        maxAdminArea: instanceState.maxAdminArea,
        facilityColumns: instanceState.facilityColumns,
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
      ? instanceState.structure?.facilitiesHmis
      : instanceState.structure?.facilitiesHfa) ?? 0;

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 flex-1 truncate text-xl">
              {familyLabel(p.family)}
            </div>
            <Show when={csvDataIsReady()}>
              <Button
                iconName="download"
                href={`${_SERVER_HOST}/structure/facilities/export/csv/${p.family}?t=${Date.now()}`}
                newTab
              >
                {t3(TC.download)}
              </Button>
            </Show>
          </div>
        }
      >
        <FrameRight
          panelChildren={
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-pad ui-spy border-base-300 flex h-full w-64 flex-col overflow-auto border-l">
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
