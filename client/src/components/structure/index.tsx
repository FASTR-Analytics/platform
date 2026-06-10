import {
  t3,
  TC,
  type FacilityFamily,
  type StructureUploadAttemptDetail,
} from "lib";
import {
  Button,
  Csv,
  FrameTop,
  getEditorWrapper,
  timActionButton,
  timActionDelete,
} from "panther";
import { Match, Show, Switch, createSignal, onMount } from "solid-js";
import { StructureUploadAttemptForm } from "~/components/structure_import";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { StructureWithCsv } from "./with_csv";

type Props = {
  family: FacilityFamily;
  backToInstance: () => void;
};

function familyLabel(family: FacilityFamily) {
  return family === "hmis"
    ? t3({ en: "HMIS facilities", fr: "Établissements SNIS" })
    : t3({ en: "HFA facilities", fr: "Établissements Enquêtes FOSA" });
}

export function Facilities(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [csvDataIsReady, setCsvDataIsReady] = createSignal<Csv<any> | null>(
    null,
  );

  const [uploadAttempt, setUploadAttempt] = createSignal<
    StructureUploadAttemptDetail | undefined
  >(undefined);
  async function fetchUploadAttempt() {
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

  onMount(() => {
    fetchUploadAttempt();
  });

  const attemptCreateStructureUA = timActionButton(
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
    const deleteAction = timActionDelete(
      p.family === "hmis"
        ? t3({
            en: "Are you sure you want to delete all HMIS facilities?",
            fr: "Êtes-vous sûr de vouloir supprimer tous les établissements SNIS ?",
          })
        : t3({
            en: "Are you sure you want to delete all HFA facilities?",
            fr: "Êtes-vous sûr de vouloir supprimer tous les établissements Enquêtes FOSA ?",
          }),
      () => serverActions.deleteFamilyFacilities({ family: p.family }),
      fetchUploadAttempt,
    );

    await deleteAction.click();
  }

  // The single-row attempt is shared across families: only offer "resume" for
  // an attempt that targets this family
  const resumableAttempt = () => {
    const ua = uploadAttempt();
    return ua && ua.datasetFamily === p.family ? ua : undefined;
  };
  const blockingAttempt = () => {
    const ua = uploadAttempt();
    return ua && ua.datasetFamily !== p.family ? ua : undefined;
  };

  const BlockingAttemptNotice = () => (
    <div class="max-w-56 text-xs">
      {t3({
        en: "Another facility import is in progress. Finish or discard it before importing here.",
        fr: "Une autre importation d'établissements est en cours. Terminez-la ou annulez-la avant d'importer ici.",
      })}
    </div>
  );

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 flex-1 truncate text-xl">
              {familyLabel(p.family)}
            </div>
            <div class="ui-gap-sm flex items-center">
              <Show when={csvDataIsReady()}>
                <Button
                  iconName="download"
                  href={`${_SERVER_HOST}/structure/facilities/export/csv/${p.family}?t=${Date.now()}`}
                  newTab
                >
                  {t3(TC.download)}
                </Button>
              </Show>
              <Button
                iconName="refresh"
                onClick={fetchUploadAttempt}
              />
            </div>
          </div>
        }
      >
        <div class="flex h-full w-full">
          <Switch>
            <Match when={instanceState.structure}>
              <Show when={instanceState.currentUserIsGlobalAdmin}>
                <div class="ui-pad ui-gap-sm border-base-300 flex h-full flex-none flex-col overflow-auto border-r">
                  <Switch>
                    <Match when={blockingAttempt()}>
                      <BlockingAttemptNotice />
                    </Match>
                    <Match when={resumableAttempt()}>
                      <Button
                        onClick={openUploadAttempt}
                        iconName="upload"
                      >
                        {t3({ en: "Resume importing facilities", fr: "Reprendre l'importation des établissements" })}
                      </Button>
                    </Match>
                    <Match when={true}>
                      <Button
                        onClick={attemptCreateStructureUA.click}
                        state={attemptCreateStructureUA.state()}
                        iconName="plus"
                      >
                        {t3({ en: "Import facilities", fr: "Importer des établissements" })}
                      </Button>
                    </Match>
                  </Switch>
                  <Button
                    onClick={attemptDeleteItems}
                    intent="danger"
                    outline
                    iconName="trash"
                  >
                    {t3({ en: "Delete these facilities", fr: "Supprimer ces établissements" })}
                  </Button>
                </div>
              </Show>
              <div class="h-full w-0 flex-1">
                <StructureWithCsv
                  family={p.family}
                  onCsvReady={(csv) => setCsvDataIsReady(csv)}
                />
              </div>
            </Match>
            <Match when={true}>
              <div class="ui-pad ui-gap-sm flex h-full flex-none flex-col overflow-auto border-l">
                <Switch>
                  <Match when={!instanceState.currentUserIsGlobalAdmin}>
                    {t3({ en: "Waiting for admin to add facilities", fr: "En attente de l'ajout des établissements par l'administrateur" })}
                  </Match>
                  <Match when={blockingAttempt()}>
                    <BlockingAttemptNotice />
                  </Match>
                  <Match when={resumableAttempt()}>
                    <Button onClick={openUploadAttempt} iconName="upload">
                      {t3({ en: "Resume importing", fr: "Reprendre l'importation" })}
                    </Button>
                  </Match>
                  <Match when={true}>
                    <Button
                      onClick={attemptCreateStructureUA.click}
                      state={attemptCreateStructureUA.state()}
                      iconName="upload"
                    >
                      {t3({ en: "Start importing facilities", fr: "Commencer l'importation des établissements" })}
                    </Button>
                  </Match>
                </Switch>
              </div>
            </Match>
          </Switch>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
