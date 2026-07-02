import {
  type IcehUploadAttemptDetail,
  type IcehUploadAttemptStatus,
  type IcehUploadAttemptStatusLight,
  t3,
} from "lib";
import { EditorComponentProps } from "panther";
import { serverActions } from "~/server_actions";
import {
  ImportWizardShell,
  type ImportWizardDescriptor,
} from "../_import_wizard/import_wizard_shell";
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
  const descriptor: ImportWizardDescriptor<
    IcehUploadAttemptDetail,
    IcehUploadAttemptStatusLight
  > = {
    heading: () => (
      <>
        {t3({ en: "IMPORT IN PROGRESS", fr: "IMPORTATION EN COURS" })}
        <span class="font-400 ml-4">
          {t3({ en: "ICEH Equity Data", fr: "Données d'équité ICEH" })}
        </span>
      </>
    ),
    loadingLabel: () =>
      t3({
        en: "Loading import info...",
        fr: "Chargement des informations d'importation...",
      }),
    confirmDeleteLabel: () =>
      t3({
        en: "Are you sure you want to delete this import?",
        fr: "Êtes-vous sûr de vouloir supprimer cette importation ?",
      }),
    // ICEH attempts start at server step 1 — there is no step 0. A lower
    // minStep renders a phantom step-0 circle and enables Back into a step
    // no arm matches (dead-end error screen).
    navMinStep: 1,
    navMaxStep: 2,
    // Steps are server step numbers (1-based); the shell default of step+1
    // is for zero-based wizards.
    stepLabelFormatter: (step) => `${step}`,
    getAttempt: async () => {
      const res = await serverActions.getDatasetIcehUploadAttempt({});
      return res as
        | { success: false; err: string }
        | { success: true; data: IcehUploadAttemptDetail };
    },
    getStatus: () => serverActions.getDatasetIcehUploadStatus({}),
    statusKey: (statusLight) => statusLight.status,
    deleteAttempt: () => serverActions.deleteDatasetIcehUploadAttempt({}),
    statusArms: [
      {
        match: (ua) => ua.status.status === "error",
        render: (ua) => (
          <div class="ui-pad text-danger">
            {t3({ en: "ERROR!", fr: "ERREUR !" })} {JSON.stringify(ua.status)}
            ...
          </div>
        ),
      },
      {
        match: (ua) => ua.status.status === "complete",
        render: (ua, ctx) => (
          <ProgressComplete
            status={
              ua.status as Extract<IcehUploadAttemptStatus, { status: "complete" }>
            }
            deleteSafe={ctx.deleteSafe}
          />
        ),
      },
      {
        match: (ua) => ua.status.status === "staging",
        render: (ua, ctx) => (
          <ProgressStaging
            status={
              (ctx.pollingStatus() || ua.status) as Extract<
                IcehUploadAttemptStatus,
                { status: "staging" }
              >
            }
          />
        ),
      },
      {
        match: (ua) => ua.status.status === "staged",
        render: (ua) => (
          <ProgressStaging
            status={{ status: "staging", progress: 100 }}
            staged={
              (
                ua.status as Extract<IcehUploadAttemptStatus, { status: "staged" }>
              ).result
            }
          />
        ),
      },
      {
        match: (ua) => ua.status.status === "integrating",
        render: (ua, ctx) => (
          <ProgressIntegrating
            status={
              (ctx.pollingStatus() || ua.status) as Extract<
                IcehUploadAttemptStatus,
                { status: "integrating" }
              >
            }
          />
        ),
      },
    ],
    steps: [
      {
        step: 1,
        canGoNext: (ua) => !!ua.step1Result,
        render: (ua, ctx) => (
          <Step1 step1Result={ua.step1Result} silentFetch={ctx.silentFetch} />
        ),
      },
      {
        step: 2,
        guard: (ua) => !!ua.step1Result,
        canGoNext: () => false,
        render: (ua, ctx) => (
          <Step2 step1Result={ua.step1Result!} silentFetch={ctx.silentFetch} />
        ),
      },
    ],
  };

  return (
    <ImportWizardShell
      descriptor={descriptor}
      close={() => p.close(undefined)}
      silentFetchOuter={p.silentFetch}
    />
  );
}
