import { DatasetHfaUploadAttemptDetail,
  DatasetHfaUploadAttemptStatus,
  DatasetHfaUploadAttemptStatusLight,
  t, t2, T } from "lib";
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
import { Step3 } from "./step_3";
import { Step4 } from "./step_4";

type Props = EditorComponentProps<
  {
    silentFetch: () => Promise<void>;
  },
  undefined
>;

export function DatasetHfaUploadAttemptForm(p: Props) {
  // Query state

  const uploadAttempt = timQuery(async () => {
    const res = await serverActions.getDatasetHfaUpload({});
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
          data: DatasetHfaUploadAttemptDetail;
        };
  }, "Loading import info...");

  // Temp state

  const [pollingStatus, setPollingStatus] =
    createSignal<DatasetHfaUploadAttemptStatusLight | null>(null);

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

      if (currentStep === 1) {
        if (dua.step1Result) {
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
      }
      if (currentStep === 2) {
        if (dua.step1Result && dua.step2Result) {
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
      }
      if (currentStep === 3) {
        if (dua.step1Result && dua.step2Result && dua.step3Result) {
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
        const statusRes = await serverActions.getDatasetHfaUploadStatus({});

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
    const deleteAction = timActionDelete(
      "Are you sure you want to delete this import?",
      () => serverActions.deleteDatasetHfaUploadAttempt({}),
      p.silentFetch,
      () => p.close(undefined),
    );

    await deleteAction.click();
  }

  const deleteSafe = timActionButton(
    () => serverActions.deleteDatasetHfaUploadAttempt({}),
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
              {t2(T.FRENCH_UI_STRINGS.import_in_progress)}
              <span class="font-400 ml-4">Health Facility Assessment Data</span>
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
              {t2(T.FRENCH_UI_STRINGS.discard_import)}
            </Button>
          </div>
        </HeaderBarCanGoBack>
      }
    >
      <StateHolderWrapper
        state={uploadAttempt.state()}
        onErrorButton={{
          label: "Back to dataset",
          onClick: () => p.close(undefined),
        }}
      >
        {(keyedUploadAttempt) => {
          return (
            <Switch
              fallback={
                <div class="ui-pad text-danger">
                  {t(
                    "Something went wrong: Bad step in dataset upload attempt",
                  )}
                </div>
              }
            >
              <Match when={keyedUploadAttempt.status.status === "error"}>
                <div class="ui-pad text-danger">
                  ERROR! {JSON.stringify(keyedUploadAttempt.status)}...
                </div>
              </Match>
              <Match when={keyedUploadAttempt.status.status === "complete"}>
                <ProgressComplete deleteSafe={deleteSafe} />
              </Match>
              <Match when={keyedUploadAttempt.status.status === "staging"}>
                <ProgressStaging
                  status={
                    (pollingStatus() || keyedUploadAttempt.status) as Extract<
                      DatasetHfaUploadAttemptStatus,
                      { status: "staging" }
                    >
                  }
                />
              </Match>

              <Match when={keyedUploadAttempt.status.status === "integrating"}>
                <ProgressIntegrating
                  status={
                    (pollingStatus() || keyedUploadAttempt.status) as Extract<
                      DatasetHfaUploadAttemptStatus,
                      { status: "integrating" }
                    >
                  }
                  sourceType={keyedUploadAttempt.sourceType!}
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() === 4 &&
                  keyedUploadAttempt.step3Result &&
                  keyedUploadAttempt.step2Result &&
                  keyedUploadAttempt.step1Result
                }
              >
                <Step4
                  close={() => p.close(undefined)}
                  silentFetch={uploadAttempt.silentFetch}
                  step3Result={keyedUploadAttempt.step3Result!}
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() >= 3 &&
                  keyedUploadAttempt.step2Result &&
                  keyedUploadAttempt.step1Result
                }
              >
                <Step3
                  close={() => p.close(undefined)}
                  silentFetch={uploadAttempt.silentFetch}
                  step3Result={keyedUploadAttempt.step3Result}
                />
              </Match>
              <Match
                when={
                  stepper.currentStep() >= 2 && keyedUploadAttempt.step1Result
                }
              >
                <Step2
                  step1Result={keyedUploadAttempt.step1Result!}
                  step2Result={keyedUploadAttempt.step2Result}
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
