import { t3, TC, type InstanceDetail } from "lib";
import {
  Button,
  Csv,
  FrameTop,
  StateHolderWrapper,
  getEditorWrapper,
  timActionButton,
  timActionDelete,
  type TimQuery,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { StructureUploadAttemptForm } from "~/components/structure_import";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions/config";
import { StructureWithCsv } from "./with_csv";

type Props = {
  backToInstance: () => void;
  instanceDetail: TimQuery<InstanceDetail>;
  isGlobalAdmin: boolean;
};

export function Structure(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  // State for CSV data
  const [csvDataIsReady, setCsvDataIsReady] = createSignal<Csv<any> | null>(
    null,
  );

  return (
    <StateHolderWrapper
      state={p.instanceDetail.state()}
      onErrorButton={{
        label: t3(TC.goBackToProject),
        onClick: p.backToInstance,
      }}
    >
      {(keyedInstanceDetail) => {
        const attemptCreateStructureUA = timActionButton(
          () => serverActions.addStructureUploadAttempt({}),
          p.instanceDetail.silentFetch,
          openUploadAttempt,
        );

        async function openUploadAttempt() {
          const res = await openEditor({
            element: StructureUploadAttemptForm,
            props: {
              maxAdminArea: keyedInstanceDetail.maxAdminArea,
              facilityColumns: keyedInstanceDetail.facilityColumns,
              silentRefreshInstance: p.instanceDetail.silentFetch,
            },
          });
          if (res?.needsReload) {
            await p.instanceDetail.fetch();
          }
        }

        async function attemptDeleteItems() {
          const deleteAction = timActionDelete(
            t3({ en: "Are you sure you want to clear all admin areas and facilities?", fr: "Êtes-vous sûr de vouloir supprimer toutes les unités administratives et les établissements de santé ?" }),
            () => serverActions.deleteAllStructureData({}),
            p.instanceDetail.silentFetch,
          );

          await deleteAction.click();
        }

        return (
          <EditorWrapper>
            <FrameTop
              panelChildren={
                <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
                  <Button iconName="chevronLeft" onClick={p.backToInstance} />
                  <div class="font-700 flex-1 truncate text-xl">
                    {t3({ en: "Admin areas and facilities", fr: "Unités administratives et établissements de santé" })}
                  </div>
                  <div class="ui-gap-sm flex items-center">
                    <Show when={csvDataIsReady()}>
                      <Button
                        iconName="download"
                        href={`${_SERVER_HOST}/structure/facilities/export/csv?t=${Date.now()}`}
                        newTab
                      >
                        {t3(TC.download)}
                      </Button>
                    </Show>
                    <Button
                      iconName="refresh"
                      onClick={p.instanceDetail.fetch}
                    />
                  </div>
                </div>
              }
            >
              <div class="flex h-full w-full">
                <Switch>
                  <Match when={keyedInstanceDetail.structure}>
                    <Show when={p.isGlobalAdmin}>
                      <div class="ui-pad ui-gap-sm border-base-300 flex h-full flex-none flex-col overflow-auto border-r">
                        <Switch>
                          <Match
                            when={keyedInstanceDetail.structureUploadAttempt}
                          >
                            <Button
                              onClick={openUploadAttempt}
                              iconName="upload"
                            >
                              {t3({ en: "Resume adding admin areas and facilities", fr: "Reprendre l'ajout d'unités administratives et d'établissements de santé" })}
                            </Button>
                          </Match>
                          <Match when={true}>
                            <Button
                              onClick={attemptCreateStructureUA.click}
                              state={attemptCreateStructureUA.state()}
                              iconName="plus"
                            >
                              {t3({ en: "Add more admin areas and facilities", fr: "Ajouter des unités administratives et des établissements de santé" })}
                            </Button>
                          </Match>
                        </Switch>
                        <Button
                          onClick={attemptDeleteItems}
                          intent="danger"
                          outline
                          iconName="trash"
                        >
                          {t3({ en: "Clear admin areas and facilities", fr: "Supprimer les unités administratives et les établissements de santé" })}
                        </Button>
                      </div>
                    </Show>
                    <div class="h-full w-0 flex-1">
                      <StructureWithCsv
                        onCsvReady={(csv) => setCsvDataIsReady(csv)}
                      />
                    </div>
                  </Match>
                  <Match when={true}>
                    <div class="ui-pad ui-gap-sm flex h-full flex-none flex-col overflow-auto border-l">
                      <Switch>
                        <Match when={!p.isGlobalAdmin}>
                          {t3({ en: "Waiting for admin to add admin areas and facilities", fr: "En attente de l'ajout des unités administratives et des établissements de santé par l'administrateur" })}
                        </Match>
                        <Match
                          when={keyedInstanceDetail.structureUploadAttempt}
                        >
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
                            {t3({ en: "Start importing admin areas and facilities", fr: "Commencer l'importation des unités administratives et des établissements de santé" })}
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
      }}
    </StateHolderWrapper>
  );
}
