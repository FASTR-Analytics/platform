import { t, t2, T, type InstanceConfigFacilityColumns } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  StateHolderWrapper,
  StepperNavigationVisual,
  getStepper,
  timActionDelete,
  timQuery,
} from "panther";
import { Match, Switch } from "solid-js";
import type {
  StructureUploadAttemptDetail,
  Dhis2Credentials,
  StructureDhis2OrgUnitSelection,
} from "lib";
import { Step0 } from "./step_0";
import { Step1_Csv } from "./step_1_csv";
import { Step2_Csv } from "./step_2_csv";
import { Step3_Csv } from "./step_3_csv";
import { Step1_Dhis2 } from "./step_1_dhis2";
import { Step2_Dhis2 } from "./step_2_dhis2";
import { Step3_Dhis2 } from "./step_3_dhis2";
import { serverActions } from "~/server_actions";
import { Step4 } from "./step_4";

type Props = EditorComponentProps<
  {
    maxAdminArea: number;
    facilityColumns: InstanceConfigFacilityColumns;
    silentRefreshInstance: () => Promise<void>;
  },
  { needsReload: true }
>;

export function StructureUploadAttemptForm(p: Props) {
  // Query state
  const uploadAttempt = timQuery(async () => {
    const res = await serverActions.getStructureUploadAttempt({});
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
          data: StructureUploadAttemptDetail;
        };
  }, t2(T.FRENCH_UI_STRINGS.loading_import_info));

  // Remove unused instanceDetail query
  // const instanceDetail = timQuery(
  //   () => serverActions.getInstanceDetail({}),
  //   t("Loading instance details..."),
  // );

  // Stepper state
  const stepper = getStepper(() => uploadAttempt.state(), {
    initialStep: 0,
    minStep: 0,
    maxStep: 3,
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
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
      }
      if (currentStep === 2) {
        if (sua.sourceType && sua.step1Result && sua.step2Result) {
          return { canGoPrev: true, canGoNext: true };
        }
        return { canGoPrev: true, canGoNext: false };
      }
      if (currentStep === 3) {
        return { canGoPrev: true, canGoNext: false };
      }
      return { canGoPrev: false, canGoNext: false };
    },
  });

  // Actions
  async function attemptDeleteStructureUploadAttempt() {
    const deleteAction = timActionDelete(
      t("Are you sure you want to delete this import?"),
      () => serverActions.deleteStructureUploadAttempt({}),
      () => p.close({ needsReload: true }),
    );

    await deleteAction.click();
  }

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t("Structure Import")}
          back={() => p.close(undefined)}
        >
          <div class="ui-gap-sm flex flex-none items-center">
            <StepperNavigationVisual
              stepper={stepper}
              stepLabelFormatter={(step) => `${step + 1}`}
            />
            <Button iconName="refresh" onClick={uploadAttempt.fetch} />
            <Button
              onClick={attemptDeleteStructureUploadAttempt}
              intent="danger"
              iconName="trash"
            >
              {t2(T.FRENCH_UI_STRINGS.discard_upload)}
            </Button>
          </div>
        </HeaderBarCanGoBack>
      }
    >
      <StateHolderWrapper
        state={uploadAttempt.state()}
        onErrorButton={{
          label: t("Back to structure"),
          onClick: () => p.close(undefined),
        }}
      >
        {(keyedUploadAttempt) => {
          return (
            <Switch
              fallback={
                <div class="ui-pad text-danger">
                  {t("Something went wrong")}: Bad step in structure upload
                  attempt
                </div>
              }
            >
              <Match
                when={
                  keyedUploadAttempt.status.status === "error" &&
                  keyedUploadAttempt.status.error
                }
                keyed
              >
                {(errorMsg) => {
                  return (
                    <div class="ui-pad text-danger">ERROR! {errorMsg}</div>
                  );
                }}
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
                <Step4
                  step3Result={keyedUploadAttempt.step3Result as any}
                  close={() => p.close({ needsReload: true })}
                  silentRefresUploadAttempt={uploadAttempt.silentFetch}
                  silentRefreshInstance={p.silentRefreshInstance}
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
                      close={() => p.close({ needsReload: true })}
                      silentRefresUploadAttempt={uploadAttempt.silentFetch}
                      silentRefreshInstance={p.silentRefreshInstance}
                    />
                  </Match>
                  <Match when={keyedUploadAttempt.sourceType === "dhis2"}>
                    <Step3_Dhis2
                      close={() => p.close({ needsReload: true })}
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
                      step1Result={keyedUploadAttempt.step1Result as any}
                      step2Result={keyedUploadAttempt.step2Result as any}
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
                      step1Result={keyedUploadAttempt.step1Result as any}
                      silentFetch={uploadAttempt.silentFetch}
                    />
                  </Match>
                  <Match when={keyedUploadAttempt.sourceType === "dhis2"}>
                    <Step1_Dhis2
                      step1Result={
                        keyedUploadAttempt.step1Result as
                          | Dhis2Credentials
                          | undefined
                      }
                      silentFetch={uploadAttempt.silentFetch}
                    />
                  </Match>
                </Switch>
              </Match>
              <Match when={stepper.currentStep() === 0}>
                <Step0
                  sourceType={keyedUploadAttempt.sourceType}
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
