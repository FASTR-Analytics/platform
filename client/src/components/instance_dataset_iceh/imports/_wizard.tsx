import { t3, type IcehStep1Result } from "lib";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  StateHolderFormError,
  StepperChipsWithTitles,
  createFormAction,
  getStepper,
} from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { TempFileUpload, type TempUpload } from "~/components/_temp_file_upload";

export type IcehWizardResult = { launched: true };

type StepKind = "upload" | "review";

const STEPS: StepKind[] = ["upload", "review"];

// The ICEH import wizard (PLAN_DHIS2_IMPORTER_CONSOLIDATION C7): a modal
// with client-local state — nothing persists server-side before launch except
// the token-keyed temp zip upload. Launch inserts a run row; abandoning this
// wizard is a no-op by construction.
export function IcehWizard(p: AlertComponentProps<object, IcehWizardResult>) {
  const [zipUpload, setZipUpload] = createSignal<TempUpload | undefined>(
    undefined,
  );
  const [preview, setPreview] = createSignal<IcehStep1Result | undefined>(
    undefined,
  );
  const [parseError, setParseError] = createSignal<string>("");

  async function parseUploaded(next: TempUpload) {
    setZipUpload(next);
    setPreview(undefined);
    setParseError("");
    const res = await serverActions.parseDatasetIcehZipPreview({
      zipUploadToken: next.token,
    });
    if (res.success) {
      setPreview(res.data);
    } else {
      setParseError(res.err);
    }
  }

  const stepperData = createMemo(() => ({
    uploadValid: zipUpload() !== undefined && preview() !== undefined,
  }));

  const stepper = getStepper(stepperData, {
    initialStep: 0,
    minStep: 0,
    maxStep: STEPS.length - 1,
    getValidation: (step, data) => {
      const kind = STEPS[step];
      if (kind === "upload") {
        return { canGoPrev: false, canGoNext: data.uploadValid };
      }
      return { canGoPrev: true, canGoNext: false };
    },
  });

  const currentStepKind = () => STEPS[stepper.currentStep()];
  const isLastStep = () => currentStepKind() === "review";

  const stepLabels = [
    t3({ en: "Upload", fr: "Téléversement", pt: "Carregamento" }),
    t3({ en: "Review & launch", fr: "Vérifier et lancer", pt: "Rever e iniciar" }),
  ];

  const submit = createFormAction(
    async () => {
      const zip = zipUpload();
      if (!zip) {
        return {
          success: false,
          err: t3({
            en: "You must upload a zip file",
            fr: "Vous devez téléverser un fichier zip",
            pt: "Tem de carregar um ficheiro zip",
          }),
        };
      }
      return await serverActions.launchDatasetIcehRun({
        zipUploadToken: zip.token,
      });
    },
    async () => {
      p.close({ launched: true });
    },
  );

  function previewPanel(result: IcehStep1Result) {
    return (
      <div class="rounded border p-4">
        <h4 class="font-700 mb-2">
          {t3({ en: "Zip Contents", fr: "Contenu du zip", pt: "Conteúdo do zip" })}
        </h4>
        <div class="text-sm">
          <p>
            <strong>{t3({ en: "Country:", fr: "Pays :", pt: "País:" })}</strong>{" "}
            {result.countryName} ({result.countryIso})
          </p>
          <p>
            <strong>{t3({ en: "Indicators:", fr: "Indicateurs :", pt: "Indicadores:" })}</strong>{" "}
            {result.indicatorCount}
          </p>
          <p>
            <strong>
              {t3({ en: "Data rows:", fr: "Lignes de données :", pt: "Linhas de dados:" })}
            </strong>{" "}
            {result.dataRowCount.toLocaleString()}
          </p>
          <p>
            <strong>{t3({ en: "Years:", fr: "Années :", pt: "Anos:" })}</strong>{" "}
            {result.years.join(", ")}
          </p>
          <p>
            <strong>
              {t3({ en: "Disaggregators:", fr: "Désagrégateurs :", pt: "Desagregadores:" })}
            </strong>{" "}
            {result.strats.join(", ")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <ModalContainer
      width="2xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">
            {t3({ en: "New ICEH import", fr: "Nouvelle importation ICEH", pt: "Nova importação ICEH" })}
          </div>
          <StepperChipsWithTitles stepper={stepper} labels={stepLabels} />
        </div>
      }
      leftButtons={
        <Show when={stepper.currentStep() > 0}>
          <Button onClick={stepper.goPrev} outline>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </Show>
      }
      rightButtons={
        <>
          <Button onClick={() => p.close(undefined)} outline>
            {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
          </Button>
          <Show
            when={isLastStep()}
            fallback={
              <Button onClick={stepper.goNext} disabled={!stepper.canGoNext()}>
                {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
              </Button>
            }
          >
            <Button
              onClick={submit.click}
              state={submit.state()}
              intent="success"
            >
              {t3({ en: "Start import", fr: "Démarrer l'importation", pt: "Iniciar a importação" })}
            </Button>
          </Show>
        </>
      }
    >
      <div class="ui-pad ui-spy min-h-[24rem]">
        <Show when={currentStepKind() === "upload"}>
          <div class="ui-spy">
            <h3 class="font-700 text-lg">
              {t3({ en: "ICEH Zip File", fr: "Fichier Zip ICEH", pt: "Ficheiro Zip ICEH" })}
            </h3>
            <p class="text-base-content-muted">
              {t3({
                en: "Upload a zip file downloaded from the ICEH Retriever (equidade.org/retriever). The zip should contain results_csv.csv and indicators.xlsx.",
                fr: "Téléversez un fichier zip téléchargé depuis le Retriever ICEH (equidade.org/retriever). Le zip doit contenir results_csv.csv et indicators.xlsx.",
                pt: "Carregue um ficheiro zip transferido do Retriever ICEH (equidade.org/retriever). O zip deve conter results_csv.csv e indicators.xlsx.",
              })}
            </p>
            <TempFileUpload
              buttonLabel={t3({
                en: "Upload zip file",
                fr: "Téléverser un fichier zip",
                pt: "Carregar um ficheiro zip",
              })}
              value={zipUpload()}
              onUploaded={(next) => {
                void parseUploaded(next);
              }}
              allowedFileTypes={[".zip"]}
            />
            <Show when={parseError()}>
              <div class="text-danger text-sm">{parseError()}</div>
            </Show>
            <Show when={preview()} keyed>
              {(result) => previewPanel(result)}
            </Show>
          </div>
        </Show>

        <Show when={currentStepKind() === "review"}>
          <div class="ui-spy">
            <h3 class="font-700 text-lg">
              {t3({ en: "Confirm import", fr: "Confirmer l'importation", pt: "Confirmar a importação" })}
            </h3>
            <Show when={preview()} keyed>
              {(result) => previewPanel(result)}
            </Show>
            <p class="text-warning">
              {t3({
                en: "This imports the indicators in this file, replacing any existing data for those same indicators and keeping all other indicators. Imports are cumulative. This cannot be undone.",
                fr: "Cela importe les indicateurs de ce fichier, en remplaçant les données existantes pour ces mêmes indicateurs et en conservant tous les autres indicateurs. Les importations sont cumulatives. Cette action ne peut pas être annulée.",
                pt: "Isto importa os indicadores deste ficheiro, substituindo os dados existentes para esses mesmos indicadores e mantendo todos os outros indicadores. As importações são cumulativas. Esta ação não pode ser anulada.",
              })}
            </p>
            <p class="text-sm">
              {t3({
                en: "Staging validates every row; a fully clean file integrates automatically, while skipped rows hold the import for your review before anything is merged.",
                fr: "La préparation valide chaque ligne ; un fichier entièrement valide s'intègre automatiquement, tandis que des lignes ignorées mettent l'importation en attente de votre vérification avant toute fusion.",
                pt: "A preparação valida todas as linhas; um ficheiro totalmente válido integra-se automaticamente, enquanto linhas ignoradas colocam a importação em espera para a sua revisão antes de qualquer fusão.",
              })}
            </p>
            <StateHolderFormError state={submit.state()} />
          </div>
        </Show>
      </div>
    </ModalContainer>
  );
}
