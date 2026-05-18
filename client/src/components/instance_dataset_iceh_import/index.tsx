import {
  type IcehUploadAttemptSummary,
  type IcehUploadAttemptStatus,
  type IcehStep1Result,
  t3,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  StateHolderWrapper,
  StepperNavigationVisual,
  getStepper,
  timActionDelete,
  timActionButton,
  timQuery,
} from "panther";
import { Match, Switch, createSignal, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { ProgressComplete } from "./progress_complete";
import { ProgressIntegrating } from "./progress_integrating";
import { ProgressStaging } from "./progress_staging";
import { Step1 } from "./step_1";
import { Step2 } from "./step_2";

type Props = EditorComponentProps<
  {
    silentFetch: () => Promise<void>;
  },
  undefined
>;

export function DatasetIcehUploadAttemptForm(p: Props) {
  const uploadAttempt = timQuery(async () => {
    const res = await serverActions.getDatasetIcehUploadAttempt({});
    if (res.success === true && res.data) {
      stepper.setCurrentStep(res.data.step);
    }
    return res as
      | { success: false; err: string }
      | { success: true; data: IcehUploadAttemptSummary | undefined };
  }, t3({ en: "Loading import info...", fr: "Chargement des informations d'importation..." }));

  const [pollingStatus, setPollingStatus] = createSignal<IcehUploadAttemptStatus | null>(null);
  const [step1Result, setStep1Result] = createSignal<IcehStep1Result | undefined>(undefined);

  const stepper = getStepper(() => uploadAttempt.state(), {
    initialStep: 1,
    minStep: 1,
    maxStep: 3,
    getValidation: (currentStep, state) => {
      if (state.status !== "ready") {
        return { canGoPrev: false, canGoNext: false };
      }
      if (currentStep === 1) {
        return { canGoPrev: false, canGoNext: !!step1Result() };
      }
      if (currentStep === 2) {
        return { canGoPrev: true, canGoNext: false };
      }
      return { canGoPrev: false, canGoNext: false };
    },
  });

  let pollingIntervalId: ReturnType<typeof setInterval> | undefined;
  let currentStatus: string | null = null;

  onMount(() => {
    pollingIntervalId = setInterval(async () => {
      if (uploadAttempt.state().status === "ready") {
        const statusRes = await serverActions.getDatasetIcehUploadAttempt({});
        if (statusRes.success && statusRes.data) {
          const newStatus = statusRes.data.status.status;
          if (currentStatus !== null && currentStatus !== newStatus) {
            currentStatus = newStatus;
            await uploadAttempt.silentFetch();
            return;
          }
          if (currentStatus === null) {
            currentStatus = newStatus;
          }
          if (newStatus === "staging" || newStatus === "integrating") {
            setPollingStatus(statusRes.data.status);
          } else {
            setPollingStatus(null);
          }
        }
      }
    }, 2000);
  });

  onCleanup(() => {
    if (pollingIntervalId !== undefined) {
      clearInterval(pollingIntervalId);
    }
  });

  async function attemptDeleteUploadAttempt() {
    const deleteAction = timActionDelete(
      t3({ en: "Are you sure you want to cancel this import?", fr: "Êtes-vous sûr de vouloir annuler cette importation ?" }),
      () => serverActions.deleteDatasetIcehUploadAttempt({}),
      p.silentFetch,
      () => p.close(undefined)
    );
    await deleteAction.click();
  }

  const deleteSafe = timActionButton(
    () => serverActions.deleteDatasetIcehUploadAttempt({}),
    p.silentFetch,
    () => p.close(undefined)
  );

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          back={() => p.close(undefined)}
          heading={
            <>
              {t3({ en: "IMPORT IN PROGRESS", fr: "IMPORTATION EN COURS" })}
              <span class="font-400 ml-4">
                {t3({ en: "ICEH Equity Data", fr: "Données d'équité ICEH" })}
              </span>
            </>
          }
        >
          <div class="ui-gap-sm flex flex-none items-center">
            <StepperNavigationVisual
              stepper={stepper}
              stepLabelFormatter={(step) => `${step}`}
            />
            <Button iconName="refresh" onClick={uploadAttempt.fetch} />
            <Button onClick={attemptDeleteUploadAttempt} intent="danger" iconName="trash">
              {t3({ en: "Discard import", fr: "Annuler l'importation" })}
            </Button>
          </div>
        </HeaderBarCanGoBack>
      }
    >
      <StateHolderWrapper
        state={uploadAttempt.state()}
        onErrorButton={{
          label: t3({ en: "Back to dataset", fr: "Retour au jeu de données" }),
          onClick: () => p.close(undefined),
        }}
      >
        {(data) => {
          const ua = data;
          if (!ua) {
            return (
              <div class="ui-pad text-danger">
                {t3({ en: "No upload attempt found", fr: "Aucune tentative de téléchargement trouvée" })}
              </div>
            );
          }

          return (
            <Switch
              fallback={
                <div class="ui-pad text-danger">
                  {t3({ en: "Something went wrong", fr: "Une erreur s'est produite" })}
                </div>
              }
            >
              <Match when={ua.status.status === "error"}>
                <div class="ui-pad">
                  <div class="text-danger mb-4">
                    {t3({ en: "ERROR!", fr: "ERREUR !" })}{" "}
                    {(ua.status as { status: "error"; err: string }).err}
                  </div>
                  <Button onClick={() => deleteSafe.click()} intent="danger">
                    {t3({ en: "Discard and start over", fr: "Annuler et recommencer" })}
                  </Button>
                </div>
              </Match>
              <Match when={ua.status.status === "complete"}>
                <ProgressComplete
                  nRowsIntegrated={(ua.status as { status: "complete"; nRowsIntegrated: number }).nRowsIntegrated}
                  deleteSafe={deleteSafe}
                />
              </Match>
              <Match when={ua.status.status === "staging"}>
                <ProgressStaging
                  status={
                    (pollingStatus() || ua.status) as Extract<
                      IcehUploadAttemptStatus,
                      { status: "staging" }
                    >
                  }
                />
              </Match>
              <Match when={ua.status.status === "staged"}>
                <ProgressStaging
                  status={{ status: "staging", progress: 100 }}
                  staged={(ua.status as { status: "staged"; result: any }).result}
                />
              </Match>
              <Match when={ua.status.status === "integrating"}>
                <ProgressIntegrating
                  status={
                    (pollingStatus() || ua.status) as Extract<
                      IcehUploadAttemptStatus,
                      { status: "integrating" }
                    >
                  }
                />
              </Match>
              <Match when={stepper.currentStep() === 1}>
                <Step1
                  step1Result={step1Result()}
                  setStep1Result={setStep1Result}
                  silentFetch={uploadAttempt.silentFetch}
                  goNext={() => stepper.setCurrentStep(2)}
                />
              </Match>
              <Match when={stepper.currentStep() === 2 && step1Result()}>
                <Step2
                  step1Result={step1Result()!}
                  silentFetch={uploadAttempt.silentFetch}
                  goPrev={() => stepper.setCurrentStep(1)}
                />
              </Match>
            </Switch>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
