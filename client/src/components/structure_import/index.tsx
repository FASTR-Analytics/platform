import {
  t3,
  _RECODABLE_FACILITY_COLUMNS,
  type FacilityFamily,
  type InstanceConfigFacilityColumns,
  type StructureUploadAttemptDetail,
} from "lib";
import { createStore } from "solid-js/store";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  Spinner,
  StateHolderWrapper,
  StepperNavigationVisual,
  getStepper,
  createDeleteAction,
  createQuery,
} from "panther";
import { Match, Show, Switch, createSignal, onCleanup, onMount } from "solid-js";
import type {
  StructureCsvStep1Result,
  StructureUploadAttemptStatus,
  StructureDhis2ConnectionSnapshot,
  StructureColumnMappings,
  StructureDhis2OrgUnitSelection,
  StructureStagingResult,
} from "lib";
import { Step0 } from "./step_0";
import { Step1_Csv } from "./step_1_csv";
import { Step2_Csv } from "./step_2_csv";
import { Step3_Csv } from "./step_3_csv";
import { Step1_Dhis2 } from "./step_1_dhis2";
import { Step2_Dhis2 } from "./step_2_dhis2";
import { Step3_Dhis2 } from "./step_3_dhis2";
import { serverActions } from "~/server_actions";
import {
  Step4Recode,
  emptyRecodeUiState,
  type RecodeUiState,
} from "./step_4_recode";
import { Step5Import } from "./step_5_import";

const _STATUS_POLL_INTERVAL_MS = 2000;

// The review step only applies to a staged, configuring attempt with at least
// one recodable column staged (DHIS2 stages only facility_name, so it lands
// straight on import).
function reviewApplies(sua: StructureUploadAttemptDetail): boolean {
  if (sua.step !== 4 || sua.status.status !== "configuring") {
    return false;
  }
  const staged = sua.step3Result?.stagedOptionalColumns ?? [];
  return _RECODABLE_FACILITY_COLUMNS.some((c) => staged.includes(c));
}

type Props = EditorComponentProps<
  {
    family: FacilityFamily;
    maxAdminArea: number;
    facilityColumns: InstanceConfigFacilityColumns;
    silentRefreshInstance: () => Promise<void>;
  },
  { needsReload: true }
>;

export function StructureUploadAttemptForm(p: Props) {
  // Review-step working state, hoisted above the keyed StateHolderWrapper:
  // every attempt refetch (including the one the review step's own save
  // triggers) remounts the whole step subtree, which would otherwise wipe the
  // user's column choice, checkboxes, page, and unsaved assignments.
  const [recodeUi, setRecodeUi] = createStore<RecodeUiState>(
    emptyRecodeUiState(),
  );

  // Query state
  const uploadAttempt = createQuery(async () => {
    const res = await serverActions.getStructureUploadAttempt({
      family: p.family,
    });
    if (res.success === true) {
      // Fresh staging run = fresh review: reset the hoisted state and hydrate
      // the working assignments from the attempt's saved recodes.
      const stagingNonce = res.data.step3Result?.stagingNonce;
      if (stagingNonce !== recodeUi.stagingNonce) {
        setRecodeUi({
          ...emptyRecodeUiState(),
          stagingNonce,
          assignments: res.data.recodes ?? {},
        });
      }
      // Landing rule: DB step 4 covers both review (client step 4) and import
      // (client step 5). A silent refetch never yanks a user on import back
      // to review; attempts with nothing to recode land straight on import.
      stepper.setCurrentStep((prev) =>
        res.data.step === 4
          ? prev > 4
            ? prev
            : reviewApplies(res.data)
              ? 4
              : 5
          : res.data.step,
      );
    }
    return res;
  }, t3({ en: "Loading import info...", fr: "Chargement des informations d'importation...", pt: "A carregar as informações de importação..." }));

  const [dismissedError, setDismissedError] = createSignal<string | undefined>(
    undefined,
  );

  // HFA facilities only come from CSV, so the source-type step is skipped
  const minStep = p.family === "hfa" ? 1 : 0;

  // Stepper state
  const stepper = getStepper(() => uploadAttempt.state(), {
    initialStep: minStep,
    minStep,
    maxStep: 5,
    getValidation: (currentStep, state) => {
      if (state.status !== "ready") {
        return { canGoPrev: false, canGoNext: false };
      }
      const sua = state.data;

      if (currentStep === 0) {
        if (sua.sourceType) {
          return { canGoPrev: false, canGoNext: true };
        }
        return { canGoPrev: false, canGoNext: false };
      }
      if (currentStep === 1) {
        if (sua.sourceType && sua.step1Result) {
          return { canGoPrev: currentStep > minStep, canGoNext: true };
        }
        return { canGoPrev: currentStep > minStep, canGoNext: false };
      }
      if (currentStep === 2) {
        if (sua.sourceType && sua.step1Result && sua.step2Result) {
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
      }
      if (currentStep === 3) {
        // step3Result is only defined at DB step 4 (staged, ready), so this
        // opens the path forward without letting a mid-staging attempt through.
        return { canGoPrev: true, canGoNext: !!sua.step3Result };
      }
      if (currentStep === 4) {
        // Review is skippable
        return { canGoPrev: true, canGoNext: true };
      }
      if (currentStep === 5) {
        return {
          canGoPrev: sua.status.status === "configuring",
          canGoNext: false,
        };
      }
      return { canGoPrev: false, canGoNext: false };
    },
  });

  // Actions
  async function attemptDeleteStructureUploadAttempt() {
    const deleteAction = createDeleteAction(
      t3({ en: "Are you sure you want to delete this import?", fr: "Êtes-vous sûr de vouloir supprimer cette importation ?", pt: "Tem a certeza de que pretende eliminar esta importação?" }),
      () => serverActions.deleteStructureUploadAttempt({ family: p.family }),
      () => p.close({ needsReload: true }),
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          heading={
            p.family === "hmis"
              ? t3({
                  en: "Import HMIS facilities",
                  fr: "Importation des établissements SNIS",
                  pt: "Importação de estabelecimentos SNIS",
                })
              : t3({
                  en: "Import HFA facilities",
                  fr: "Importation des établissements Enquêtes FOSA",
                  pt: "Importação de estabelecimentos FOSA",
                })
          }
          onBack={() => p.close(undefined)}
        >
          <div class="ui-gap-sm flex flex-none items-center">
            <StepperNavigationVisual
              stepper={stepper}
              stepLabelFormatter={(step) => `${step - minStep + 1}`}
            />
            <Button iconName="refresh" onClick={uploadAttempt.fetch} />
            <Button
              onClick={attemptDeleteStructureUploadAttempt}
              intent="danger"
              iconName="trash"
            >
              {t3({ en: "Discard upload", fr: "Annuler le téléversement", pt: "Descartar o carregamento" })}
            </Button>
          </div>
        </HeadingBar>
      }
    >
      <StateHolderWrapper
        state={uploadAttempt.state()}
        onErrorButton={{
          label: t3({ en: "Back to structure", fr: "Retour à la structure", pt: "Voltar à estrutura" }),
          onClick: () => p.close(undefined),
        }}
      >
        {(keyedUploadAttempt) => {
          return (
            <>
              <Show
                when={
                  keyedUploadAttempt.status.status === "error" &&
                  keyedUploadAttempt.status.error
                }
                keyed
              >
                {(errorMsg) => (
                  <Show when={dismissedError() !== errorMsg}>
                    <div class="border-danger bg-danger-subtle ui-spy-sm m-4 rounded border p-4">
                      <div class="ui-gap flex items-start">
                        <div class="ui-spy-sm flex-1">
                          <div class="text-danger font-700">
                            {t3({ en: "The last import step failed", fr: "La dernière étape d'importation a échoué", pt: "A última etapa de importação falhou" })}
                          </div>
                          <div class="text-danger text-sm">{errorMsg}</div>
                          <div class="text-sm">
                            {t3({
                              en: "Fix the configuration in the steps below and re-save, or discard the upload. If the final step was rejected, you can also choose a different import mode and run it again.",
                              fr: "Corrigez la configuration dans les étapes ci-dessous et enregistrez de nouveau, ou annulez le téléversement. Si la dernière étape a été rejetée, vous pouvez aussi choisir un autre mode d'importation et relancer.",
                              pt: "Corrija a configuração nas etapas abaixo e guarde novamente, ou descarte o carregamento. Se a última etapa foi rejeitada, pode também escolher outro modo de importação e executá-la novamente.",
                            })}
                          </div>
                        </div>
                        <Button
                          iconName="x"
                          onClick={() => setDismissedError(errorMsg)}
                        />
                      </div>
                    </div>
                  </Show>
                )}
              </Show>
              <Switch
                fallback={
                  <div class="ui-pad text-danger">
                    {t3({ en: "Something went wrong: Bad step in structure upload attempt", fr: "Une erreur est survenue : étape incorrecte lors de la tentative d'importation de structure", pt: "Ocorreu um erro: etapa inválida na tentativa de importação de estrutura" })}
                  </div>
                }
              >
              <Match
                when={
                  keyedUploadAttempt.status.status === "importing" ||
                  keyedUploadAttempt.status.status === "importing_dhis2"
                }
              >
                <ImportInProgress
                  family={p.family}
                  initialStatus={keyedUploadAttempt.status}
                  silentRefreshAttempt={uploadAttempt.silentFetch}
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() === 5 &&
                  keyedUploadAttempt.sourceType &&
                  keyedUploadAttempt.step1Result &&
                  keyedUploadAttempt.step2Result &&
                  keyedUploadAttempt.step3Result
                }
              >
                <Step5Import
                  step3Result={keyedUploadAttempt.step3Result as StructureStagingResult}
                  recodes={keyedUploadAttempt.recodes}
                  family={p.family}
                  facilityColumns={p.facilityColumns}
                  close={() => p.close({ needsReload: true })}
                  silentRefresUploadAttempt={uploadAttempt.silentFetch}
                  silentRefreshInstance={p.silentRefreshInstance}
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() === 4 &&
                  keyedUploadAttempt.sourceType &&
                  keyedUploadAttempt.step1Result &&
                  keyedUploadAttempt.step2Result &&
                  keyedUploadAttempt.step3Result
                }
              >
                <Step4Recode
                  ui={recodeUi}
                  setUi={setRecodeUi}
                  family={p.family}
                  step3Result={keyedUploadAttempt.step3Result as StructureStagingResult}
                  recodes={keyedUploadAttempt.recodes}
                  facilityColumns={p.facilityColumns}
                  csvDetails={
                    keyedUploadAttempt.sourceType === "csv"
                      ? (keyedUploadAttempt.step1Result as StructureCsvStep1Result)
                          .csv
                      : undefined
                  }
                  columnMappings={
                    keyedUploadAttempt.sourceType === "csv"
                      ? (keyedUploadAttempt.step2Result as StructureColumnMappings)
                      : undefined
                  }
                  silentFetch={uploadAttempt.silentFetch}
                  goNext={stepper.goNext}
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() === 3 &&
                  keyedUploadAttempt.sourceType &&
                  keyedUploadAttempt.step1Result &&
                  keyedUploadAttempt.step2Result
                }
              >
                <Switch>
                  <Match when={keyedUploadAttempt.sourceType === "csv"}>
                    <Step3_Csv
                      family={p.family}
                      silentRefresUploadAttempt={uploadAttempt.silentFetch}
                      silentRefreshInstance={p.silentRefreshInstance}
                    />
                  </Match>
                  <Match when={keyedUploadAttempt.sourceType === "dhis2"}>
                    <Step3_Dhis2
                      family={p.family}
                      silentRefresUploadAttempt={uploadAttempt.silentFetch}
                      silentRefreshInstance={p.silentRefreshInstance}
                    />
                  </Match>
                </Switch>
              </Match>
              <Match
                when={
                  stepper.currentStep() >= 2 &&
                  keyedUploadAttempt.sourceType &&
                  keyedUploadAttempt.step1Result
                }
              >
                <Switch>
                  <Match when={keyedUploadAttempt.sourceType === "csv"}>
                    <Step2_Csv
                      step1Result={
                        (keyedUploadAttempt.step1Result as StructureCsvStep1Result)
                          .csv
                      }
                      step2Result={
                        keyedUploadAttempt.step2Result as
                          | StructureColumnMappings
                          | undefined
                      }
                      family={p.family}
                      maxAdminArea={p.maxAdminArea}
                      facilityColumns={p.facilityColumns}
                      silentFetch={uploadAttempt.silentFetch}
                    />
                  </Match>
                  <Match when={keyedUploadAttempt.sourceType === "dhis2"}>
                    <Step2_Dhis2
                      step2Result={
                        keyedUploadAttempt.step2Result as
                          | StructureDhis2OrgUnitSelection
                          | undefined
                      }
                      family={p.family}
                      silentFetch={uploadAttempt.silentFetch}
                    />
                  </Match>
                </Switch>
              </Match>
              <Match
                when={
                  stepper.currentStep() >= 1 && keyedUploadAttempt.sourceType
                }
              >
                <Switch>
                  <Match when={keyedUploadAttempt.sourceType === "csv"}>
                    <Step1_Csv
                      step1Result={
                        keyedUploadAttempt.step1Result as
                          | StructureCsvStep1Result
                          | undefined
                      }
                      family={p.family}
                      silentFetch={uploadAttempt.silentFetch}
                    />
                  </Match>
                  <Match when={keyedUploadAttempt.sourceType === "dhis2"}>
                    <Step1_Dhis2
                      step1Result={
                        keyedUploadAttempt.step1Result as
                          | StructureDhis2ConnectionSnapshot
                          | undefined
                      }
                      family={p.family}
                      silentFetch={uploadAttempt.silentFetch}
                    />
                  </Match>
                </Switch>
              </Match>
              <Match when={stepper.currentStep() === 0}>
                <Step0
                  sourceType={keyedUploadAttempt.sourceType}
                  family={p.family}
                  silentFetch={uploadAttempt.silentFetch}
                />
              </Match>
              </Switch>
            </>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}

type ImportInProgressProps = {
  family: FacilityFamily;
  initialStatus: StructureUploadAttemptStatus;
  silentRefreshAttempt: () => Promise<void>;
};

function ImportInProgress(p: ImportInProgressProps) {
  const [status, setStatus] = createSignal<StructureUploadAttemptStatus>(
    p.initialStatus,
  );

  onMount(() => {
    let pollInFlight = false;
    const intervalId = setInterval(async () => {
      if (pollInFlight) {
        return;
      }
      pollInFlight = true;
      const res = await serverActions.getStructureUploadStatus({
        family: p.family,
      });
      pollInFlight = false;
      if (!res.success) {
        return;
      }
      if (res.data.isActive) {
        setStatus(res.data.status);
      } else {
        clearInterval(intervalId);
        await p.silentRefreshAttempt();
      }
    }, _STATUS_POLL_INTERVAL_MS);
    onCleanup(() => clearInterval(intervalId));
  });

  const progressPercent = () => {
    const s = status();
    if (s.status !== "importing" && s.status !== "importing_dhis2") {
      return undefined;
    }
    return s.progress === undefined ? undefined : Math.round(s.progress * 100);
  };

  const orgUnitProgress = () => {
    const s = status();
    if (
      s.status === "importing_dhis2" &&
      s.processedOrgUnits !== undefined &&
      s.totalOrgUnits !== undefined
    ) {
      return `${s.processedOrgUnits} / ${s.totalOrgUnits}`;
    }
    return undefined;
  };

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-gap-sm flex items-center">
        <div class="h-6 w-6 flex-none">
          <Spinner intent="primary" />
        </div>
        <div class="font-700 text-lg">
          {t3({
            en: "A structure import is running...",
            fr: "Une importation de structure est en cours...",
            pt: "Está em curso uma importação de estrutura...",
          })}
        </div>
      </div>
      <Show when={progressPercent() !== undefined}>
        <div class="text-sm">{progressPercent()}%</div>
      </Show>
      <Show when={orgUnitProgress()} keyed>
        {(msg) => (
          <div class="text-sm">
            {t3({
              en: "Organisation units processed",
              fr: "Unités organisationnelles traitées",
              pt: "Unidades organizacionais processadas",
            })}
            : {msg}
          </div>
        )}
      </Show>
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "This screen will update automatically when the import finishes. It is safe to leave and come back.",
          fr: "Cet écran se mettra à jour automatiquement à la fin de l'importation. Vous pouvez quitter cette page et revenir plus tard.",
          pt: "Este ecrã atualiza-se automaticamente quando a importação terminar. Pode sair desta página e voltar mais tarde.",
        })}
      </div>
    </div>
  );
}
