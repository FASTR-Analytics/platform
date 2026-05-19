import {
  type IcehUploadAttemptDetail,
  type IcehUploadAttemptStatus,
  type IcehUploadAttemptStatusLight,
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
      | { success: true; data: IcehUploadAttemptDetail };
  }, t3({ en: "Loading import info...", fr: "Chargement des informations d'importation..." }));

  const [pollingStatus, setPollingStatus] =
    createSignal<IcehUploadAttemptStatusLight | null>(null);

  const stepper = getStepper(() => uploadAttempt.state(), {
    initialStep: 0,
    minStep: 0,
    maxStep: 2,
    getValidation: (currentStep, state) => {
      if (state.status !== "ready") {
        return { canGoPrev: false, canGoNext: false };
      }
      const dua = state.data;

      if (currentStep === 1) {
        if (dua.step1Result) {
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
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
        const statusRes = await serverActions.getDatasetIcehUploadStatus({});

        if (statusRes.success) {
          if (
            currentStatus !== null &&
            currentStatus !== statusRes.data.status.status
          ) {
            currentStatus = statusRes.data.status.status;
            await uploadAttempt.silentFetch();
            return;
          }

          if (currentStatus === null) {
            currentStatus = statusRes.data.status.status;
          }

          if (statusRes.data.isActive) {
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
      t3({
        en: "Are you sure you want to delete this import?",
        fr: "Êtes-vous sûr de vouloir supprimer cette importation ?",
      }),
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
              stepLabelFormatter={(step) => `${step + 1}`}
            />
            <Button iconName="refresh" onClick={uploadAttempt.fetch} />
            <Button
              onClick={attemptDeleteUploadAttempt}
              intent="danger"
              iconName="trash"
            >
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
        {(keyedUploadAttempt) => {
          return (
            <Switch
              fallback={
                <div class="ui-pad text-danger">
                  {t3({
                    en: "Something went wrong: Bad step in dataset upload attempt",
                    fr: "Une erreur s'est produite : étape incorrecte dans la tentative de téléversement",
                  })}
                </div>
              }
            >
              <Match when={keyedUploadAttempt.status.status === "error"}>
                <div class="ui-pad text-danger">
                  {t3({ en: "ERROR!", fr: "ERREUR !" })}{" "}
                  {JSON.stringify(keyedUploadAttempt.status)}...
                </div>
              </Match>
              <Match when={keyedUploadAttempt.status.status === "complete"}>
                <ProgressComplete
                  status={
                    keyedUploadAttempt.status as Extract<
                      IcehUploadAttemptStatus,
                      { status: "complete" }
                    >
                  }
                  deleteSafe={deleteSafe}
                />
              </Match>
              <Match when={keyedUploadAttempt.status.status === "staging"}>
                <ProgressStaging
                  status={
                    (pollingStatus() || keyedUploadAttempt.status) as Extract<
                      IcehUploadAttemptStatus,
                      { status: "staging" }
                    >
                  }
                />
              </Match>
              <Match when={keyedUploadAttempt.status.status === "staged"}>
                <ProgressStaging
                  status={{ status: "staging", progress: 100 }}
                  staged={
                    (
                      keyedUploadAttempt.status as Extract<
                        IcehUploadAttemptStatus,
                        { status: "staged" }
                      >
                    ).result
                  }
                />
              </Match>
              <Match when={keyedUploadAttempt.status.status === "integrating"}>
                <ProgressIntegrating
                  status={
                    (pollingStatus() || keyedUploadAttempt.status) as Extract<
                      IcehUploadAttemptStatus,
                      { status: "integrating" }
                    >
                  }
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() >= 2 && keyedUploadAttempt.step1Result
                }
              >
                <Step2
                  step1Result={keyedUploadAttempt.step1Result!}
                  silentFetch={uploadAttempt.silentFetch}
                />
              </Match>
              <Match when={stepper.currentStep() >= 1}>
                <Step1
                  step1Result={keyedUploadAttempt.step1Result}
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
