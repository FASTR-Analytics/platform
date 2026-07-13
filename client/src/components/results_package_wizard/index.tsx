import { t3, type RunGenerationAttemptDetail } from "lib";
import { EditorComponentProps } from "panther";
import { serverActions } from "~/server_actions";
import {
  ImportWizardShell,
  type ImportWizardDescriptor,
} from "../_import_wizard/import_wizard_shell";
import { Step1 } from "./step_1";
import { Step2 } from "./step_2";
import { Step3 } from "./step_3";

// The results-package LAUNCH wizard (PLAN_RESULTS_RUNS item 2): pure
// configuration — choose data, configure modules, confirm + launch. No async
// work happens inside the wizard; at launch the run owns its whole lifecycle
// and progress arrives on the project surface over SSE (run_progress /
// run_attached), so there is no status poll and no progress arms here.
type Props = EditorComponentProps<
  {
    projectId: string;
    silentFetch: () => Promise<void>;
  },
  undefined
>;

export function ResultsPackageWizard(p: Props) {
  const descriptor: ImportWizardDescriptor<RunGenerationAttemptDetail, null> = {
    heading: () => (
      <>
        {t3({
          en: "GENERATE RESULTS PACKAGE",
          fr: "GÉNÉRER LE PAQUET DE RÉSULTATS",
          pt: "GERAR PACOTE DE RESULTADOS",
        })}
      </>
    ),
    loadingLabel: () =>
      t3({
        en: "Loading configuration...",
        fr: "Chargement de la configuration...",
        pt: "A carregar a configuração...",
      }),
    confirmDeleteLabel: () =>
      t3({
        en: "Are you sure you want to discard this configuration?",
        fr: "Êtes-vous sûr de vouloir abandonner cette configuration ?",
        pt: "Tem a certeza de que pretende descartar esta configuração?",
      }),
    discardLabel: () =>
      t3({
        en: "Discard configuration",
        fr: "Abandonner la configuration",
        pt: "Descartar a configuração",
      }),
    errorBackLabel: () =>
      t3({ en: "Back to project", fr: "Retour au projet", pt: "Voltar ao projeto" }),
    // Attempts start at server step 1 (no step 0) — the ICEH minStep note.
    navMinStep: 1,
    navMaxStep: 3,
    stepLabelFormatter: (step) => `${step}`,
    getAttempt: async () => {
      const res = await serverActions.getRunGenerationAttempt({
        project_id: p.projectId,
      });
      if (res.success === false) {
        return res;
      }
      if (res.data === null) {
        // The host page only opens the wizard when an attempt exists; a null
        // here means it was deleted elsewhere (launch or discard).
        return {
          success: false,
          err: t3({
            en: "No results-package configuration in progress for this project",
            fr: "Aucune configuration de paquet de résultats en cours pour ce projet",
            pt: "Nenhuma configuração de pacote de resultados em curso para este projeto",
          }),
        };
      }
      return { success: true, data: res.data };
    },
    getStatus: null,
    statusKey: () => "",
    deleteAttempt: () =>
      serverActions.deleteRunGenerationAttempt({ project_id: p.projectId }),
    statusArms: [],
    steps: [
      {
        step: 1,
        canGoNext: (ua) => !!ua.step1Result,
        render: (ua, ctx) => (
          <Step1
            projectId={p.projectId}
            step1Result={ua.step1Result}
            silentFetch={ctx.silentFetch}
          />
        ),
      },
      {
        step: 2,
        guard: (ua) => !!ua.step1Result,
        canGoNext: (ua) => !!ua.step2Result,
        render: (ua, ctx) => (
          <Step2
            projectId={p.projectId}
            step1Result={ua.step1Result!}
            step2Result={ua.step2Result}
            silentFetch={ctx.silentFetch}
          />
        ),
      },
      {
        step: 3,
        guard: (ua) => !!ua.step1Result && !!ua.step2Result,
        canGoNext: () => false,
        render: (ua) => (
          <Step3
            projectId={p.projectId}
            step1Result={ua.step1Result!}
            step2Result={ua.step2Result!}
            onLaunched={async () => {
              await p.silentFetch();
              p.close(undefined);
            }}
          />
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
