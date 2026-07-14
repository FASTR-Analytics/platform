import { DatasetUploadAttemptDetail,
  DatasetUploadAttemptDetailCsv,
  DatasetUploadAttemptStatus,
  DatasetUploadAttemptStatusLight,
  t3 } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  StateHolderWrapper,
  StepperNavigationVisual,
  getStepper,
  createDeleteAction,
  createButtonAction,
  createQuery,
} from "panther";
import { Match, Switch, createSignal, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { ProgressComplete } from "./progress_complete";
import { ProgressIntegrating } from "./progress_integrating";
import { ProgressStaging_Csv } from "./progress_staging_csv";
import { Step1_Csv } from "./step_1_csv";
import { Step2_Csv } from "./step_2_csv";
import { Step3 } from "./step_3";
import { Step4_Csv } from "./step_4_csv";

type Props = EditorComponentProps<
  {
    silentFetch: () => Promise<void>;
  },
  undefined
>;

export function DatasetHmisUploadAttemptForm(p: Props) {
  // Query state

  const uploadAttempt = createQuery(async () => {
    let res = await serverActions.getDatasetUpload({});
    // The wizard is CSV-only (DHIS2 imports are runs): a fresh attempt at
    // step 0 gets its source set immediately so the wizard starts at step 1.
    if (res.success === true && res.data.step === 0) {
      await serverActions.setDatasetUploadSourceType({ sourceType: "csv" });
      res = await serverActions.getDatasetUpload({});
    }
    if (res.success === true) {
      stepper.setCurrentStep(res.data.step);
    }
    return res as
      | {
          success: false;
          err: string;
        }
      | {
          success: true;
          data: DatasetUploadAttemptDetail;
        };
  }, t3({ en: "Loading import info...", fr: "Chargement des informations d'importation...", pt: "A carregar as informações de importação..." }));

  // Temp state

  const [pollingStatus, setPollingStatus] =
    createSignal<DatasetUploadAttemptStatusLight | null>(null);

  // Stepper state

  const stepper = getStepper(() => uploadAttempt.state(), {
    initialStep: 0,
    minStep: 0,
    maxStep: 4,
    getValidation: (currentStep, state) => {
      if (state.status !== "ready") {
        return { canGoPrev: false, canGoNext: false };
      }
      const dua = state.data;

      if (currentStep === 0) {
        if (dua.sourceType) {
          return { canGoPrev: false, canGoNext: true };
        }
        return { canGoPrev: false, canGoNext: false };
      }
      if (currentStep === 1) {
        if (dua.sourceType && dua.step1Result) {
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
      }
      if (currentStep === 2) {
        if (dua.sourceType && dua.step1Result && dua.step2Result) {
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
      }
      if (currentStep === 3) {
        if (
          dua.sourceType &&
          dua.step1Result &&
          dua.step2Result &&
          dua.step3Result
        ) {
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
      }
      if (currentStep === 4) {
        return { canGoPrev: true, canGoNext: false };
      }
      return { canGoPrev: false, canGoNext: false };
    },
  });

  // Polling logic for staging/integrating progress
  let pollingIntervalId: ReturnType<typeof setInterval> | undefined;
  let currentStatus: string | null = null;

  onMount(() => {
    pollingIntervalId = setInterval(async () => {
      if (uploadAttempt.state().status === "ready") {
        // Always poll the server to get the current status
        const statusRes = await serverActions.getDatasetUploadStatus({});

        if (statusRes.success) {
          // Check if backend status changed
          if (
            currentStatus !== null &&
            currentStatus !== statusRes.data.status.status
          ) {
            currentStatus = statusRes.data.status.status;
            await uploadAttempt.silentFetch();
            return; // Skip updating pollingStatus since UI will refresh
          }

          // Update currentStatus if it was null (first poll)
          if (currentStatus === null) {
            currentStatus = statusRes.data.status.status;
          }

          if (statusRes.data.isActive) {
            // Update the polling status for progress display
            setPollingStatus(statusRes.data.status);
          } else {
            // Not active - clear polling status
            setPollingStatus(null);
          }
        }
      }
    }, 2000); // Poll every 2 seconds for more responsive updates
  });

  onCleanup(() => {
    if (pollingIntervalId !== undefined) {
      clearInterval(pollingIntervalId);
    }
  });

  // Actions

  async function attemptDeleteUploadAttempt() {
    const deleteAction = createDeleteAction(
      t3({ en: "Are you sure you want to delete this import?", fr: "Voulez-vous vraiment supprimer cette importation ?", pt: "Tem a certeza de que pretende eliminar esta importação?" }),
      () => serverActions.deleteDatasetUploadAttempt({}),
      p.silentFetch,
      () => p.close(undefined),
    );

    await deleteAction.click();
  }

  const deleteSafe = createButtonAction(
    () => serverActions.deleteDatasetUploadAttempt({}),
    p.silentFetch,
    () => p.close(undefined),
  );

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          back={() => p.close(undefined)}
          heading={
            <>
              {t3({ en: "IMPORT IN PROGRESS", fr: "IMPORTATION EN COURS", pt: "IMPORTAÇÃO EM CURSO" })}
              <span class="font-400 ml-4">{t3({ en: "HMIS Data", fr: "Données HMIS", pt: "Dados HMIS" })}</span>
            </>
          }
        >
          <div class="ui-gap-sm flex flex-none items-center">
            <StepperNavigationVisual
              stepper={stepper}
              stepLabelFormatter={(step) => `${step + 1}`}
            />
            <Button iconName="refresh" onClick={uploadAttempt.fetch} />
            <Button
              onClick={attemptDeleteUploadAttempt}
              intent="danger"
              iconName="trash"
            >
              {t3({ en: "Discard import", fr: "Annuler l'importation", pt: "Descartar a importação" })}
            </Button>
          </div>
        </HeaderBarCanGoBack>
      }
    >
      <StateHolderWrapper
        state={uploadAttempt.state()}
        onErrorButton={{
          label: t3({ en: "Back to dataset", fr: "Retour au jeu de données", pt: "Voltar ao conjunto de dados" }),
          onClick: () => p.close(undefined),
        }}
      >
        {(keyedUploadAttempt) => {
          return (
            <Switch
              fallback={
                <div class="ui-pad text-danger">
                  {t3({ en: "Something went wrong: Bad step in dataset upload attempt", fr: "Une erreur est survenue : étape incorrecte dans la tentative d'importation", pt: "Ocorreu um erro: etapa inválida na tentativa de carregamento do conjunto de dados" })}
                </div>
              }
            >
              <Match
                when={
                  keyedUploadAttempt.status.status === "error" &&
                  keyedUploadAttempt.status.err
                }
                keyed
              >
                {(errorMsg) => {
                  return (
                    <div class="ui-pad text-danger">ERROR! {errorMsg}</div>
                  );
                }}
              </Match>
              <Match when={keyedUploadAttempt.status.status === "complete"}>
                <ProgressComplete deleteSafe={deleteSafe} />
              </Match>
              <Match when={keyedUploadAttempt.status.status === "staging"}>
                <ProgressStaging_Csv
                  status={
                    (pollingStatus() || keyedUploadAttempt.status) as Extract<
                      DatasetUploadAttemptStatus,
                      { status: "staging" }
                    >
                  }
                />
              </Match>
              <Match when={keyedUploadAttempt.status.status === "integrating"}>
                <ProgressIntegrating
                  status={
                    (pollingStatus() || keyedUploadAttempt.status) as Extract<
                      DatasetUploadAttemptStatus,
                      { status: "integrating" }
                    >
                  }
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() === 4 &&
                  keyedUploadAttempt.sourceType &&
                  keyedUploadAttempt.step3Result &&
                  keyedUploadAttempt.step2Result &&
                  keyedUploadAttempt.step1Result
                }
              >
                <Step4_Csv
                  silentFetch={uploadAttempt.silentFetch}
                  step3Result={
                    (keyedUploadAttempt as DatasetUploadAttemptDetailCsv)
                      .step3Result!
                  }
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() >= 3 &&
                  keyedUploadAttempt.sourceType &&
                  keyedUploadAttempt.step2Result &&
                  keyedUploadAttempt.step1Result
                }
              >
                <Step3
                  silentFetch={uploadAttempt.silentFetch}
                  step3Result={keyedUploadAttempt.step3Result}
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() >= 2 &&
                  keyedUploadAttempt.sourceType &&
                  keyedUploadAttempt.step1Result
                }
              >
                <Step2_Csv
                  step1Result={
                    (keyedUploadAttempt as DatasetUploadAttemptDetailCsv)
                      .step1Result!
                  }
                  step2Result={
                    (keyedUploadAttempt as DatasetUploadAttemptDetailCsv)
                      .step2Result
                  }
                  silentFetch={uploadAttempt.silentFetch}
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() >= 1 && keyedUploadAttempt.sourceType
                }
              >
                <Step1_Csv
                  step1Result={
                    (keyedUploadAttempt as DatasetUploadAttemptDetailCsv)
                      .step1Result
                  }
                  silentFetch={uploadAttempt.silentFetch}
                />
              </Match>
            </Switch>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
