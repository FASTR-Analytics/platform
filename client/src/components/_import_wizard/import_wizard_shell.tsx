import { t3, type APIResponseNoData } from "lib";
import {
  Button,
  FrameTop,
  HeaderBarCanGoBack,
  StateHolderWrapper,
  StepperNavigationVisual,
  getStepper,
  timActionButton,
  timActionDelete,
  timQuery,
  type TimActionButton,
} from "panther";
import { type JSX, Switch, Match, createSignal, onCleanup, onMount } from "solid-js";

type APIResult<T> = { success: false; err: string } | { success: true; data: T };

export type ImportWizardCtx<TStatusLight> = {
  pollingStatus: () => TStatusLight | null;
  silentFetch: () => Promise<void>;
  refetch: () => Promise<void>;
  deleteSafe: TimActionButton<[]>;
};

export type ImportWizardStatusArm<TUA, TStatusLight> = {
  match: (ua: TUA) => boolean;
  render: (ua: TUA, ctx: ImportWizardCtx<TStatusLight>) => JSX.Element;
};

export type ImportWizardStep<TUA, TStatusLight> = {
  // Rendered when currentStep() >= step (later steps take precedence) and guard passes
  step: number;
  guard?: (ua: TUA) => boolean;
  canGoNext: (ua: TUA) => boolean;
  render: (ua: TUA, ctx: ImportWizardCtx<TStatusLight>) => JSX.Element;
};

export type ImportWizardDescriptor<TUA extends { step: number }, TStatusLight> = {
  heading: () => JSX.Element;
  loadingLabel: () => string;
  confirmDeleteLabel: () => string;
  navMinStep: number;
  navMaxStep: number;
  stepLabelFormatter?: (step: number) => string;
  getAttempt: () => Promise<APIResult<TUA>>;
  // null ⇒ no background poll (e.g. structure streams progress instead)
  getStatus:
    | (() => Promise<
        APIResult<{ isActive: boolean; status: TStatusLight } | null>
      >)
    | null;
  statusKey: (statusLight: TStatusLight) => string;
  deleteAttempt: () => Promise<APIResponseNoData>;
  // Checked in order, before step arms (include the importer's error/progress states)
  statusArms: ImportWizardStatusArm<TUA, TStatusLight>[];
  steps: ImportWizardStep<TUA, TStatusLight>[];
};

export function ImportWizardShell<TUA extends { step: number }, TStatusLight>(p: {
  descriptor: ImportWizardDescriptor<TUA, TStatusLight>;
  close: () => void;
  silentFetchOuter: () => Promise<void>;
}) {
  const uploadAttempt = timQuery(async () => {
    const res = await p.descriptor.getAttempt();
    if (res.success === true && res.data) {
      stepper.setCurrentStep(res.data.step);
    }
    return res;
  }, p.descriptor.loadingLabel());

  const [pollingStatus, setPollingStatus] = createSignal<TStatusLight | null>(
    null,
  );

  const stepper = getStepper(() => uploadAttempt.state(), {
    initialStep: p.descriptor.navMinStep,
    minStep: p.descriptor.navMinStep,
    maxStep: p.descriptor.navMaxStep,
    getValidation: (currentStep, state) => {
      if (state.status !== "ready") {
        return { canGoPrev: false, canGoNext: false };
      }
      const stepDef = p.descriptor.steps.find((s) => s.step === currentStep);
      if (!stepDef) {
        return { canGoPrev: false, canGoNext: false };
      }
      return {
        canGoPrev: currentStep > p.descriptor.navMinStep,
        canGoNext: stepDef.canGoNext(state.data),
      };
    },
  });

  let pollingIntervalId: ReturnType<typeof setInterval> | undefined;
  let currentStatus: string | null = null;

  onMount(() => {
    const getStatus = p.descriptor.getStatus;
    if (getStatus === null) return;
    pollingIntervalId = setInterval(async () => {
      if (uploadAttempt.state().status !== "ready") return;
      const statusRes = await getStatus();
      if (!statusRes.success || !statusRes.data) return;
      const statusData = statusRes.data;

      const statusStr = p.descriptor.statusKey(statusData.status);
      if (currentStatus !== null && currentStatus !== statusStr) {
        currentStatus = statusStr;
        await uploadAttempt.silentFetch();
        return;
      }
      if (currentStatus === null) {
        currentStatus = statusStr;
      }

      if (statusData.isActive) {
        setPollingStatus(() => statusData.status);
      } else {
        setPollingStatus(null);
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
      p.descriptor.confirmDeleteLabel(),
      () => p.descriptor.deleteAttempt(),
      p.silentFetchOuter,
      () => p.close(),
    );
    await deleteAction.click();
  }

  const deleteSafe = timActionButton(
    () => p.descriptor.deleteAttempt(),
    p.silentFetchOuter,
    () => p.close(),
  );

  const ctx: ImportWizardCtx<TStatusLight> = {
    pollingStatus,
    silentFetch: uploadAttempt.silentFetch,
    refetch: uploadAttempt.fetch,
    deleteSafe,
  };

  // Later steps take precedence in the cascading Switch
  const stepsDescending = [...p.descriptor.steps].sort((a, b) => b.step - a.step);

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack back={() => p.close()} heading={p.descriptor.heading()}>
          <div class="ui-gap-sm flex flex-none items-center">
            <StepperNavigationVisual
              stepper={stepper}
              stepLabelFormatter={
                p.descriptor.stepLabelFormatter ?? ((step) => `${step + 1}`)
              }
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
          onClick: () => p.close(),
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
              {p.descriptor.statusArms.map((arm) => (
                <Match when={arm.match(keyedUploadAttempt)}>
                  {arm.render(keyedUploadAttempt, ctx)}
                </Match>
              ))}
              {stepsDescending.map((stepDef) => (
                <Match
                  when={
                    stepper.currentStep() >= stepDef.step &&
                    (stepDef.guard?.(keyedUploadAttempt) ?? true)
                  }
                >
                  {stepDef.render(keyedUploadAttempt, ctx)}
                </Match>
              ))}
            </Switch>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
