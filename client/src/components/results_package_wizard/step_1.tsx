import {
  t3,
  type RunGenerationDefaults,
  type RunGenerationStep1Result,
} from "lib";
import {
  Button,
  Checkbox,
  StateHolderFormError,
  StateHolderWrapper,
  createFormAction,
  createQuery,
} from "panther";
import { Show, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  step1Result: RunGenerationStep1Result | null;
  silentFetch: () => Promise<void>;
};

// Step 1 — choose data: plain family-inclusion checkboxes. Generation always
// captures the FULL dataset per family (PLAN_FULL_CAPTURE_GENERATION);
// per-project subsetting happens at attach time, never here. Starting
// values: the attempt's own step1Result (resume) beats the instance defaults
// store — there is no anchor run, the wizard is instance-entered.
export function Step1(p: Props) {
  const defaults = createQuery(
    () => serverActions.getRunGenerationDefaults({}),
    t3({
      en: "Loading the instance's default data selection...",
      fr: "Chargement de la sélection de données par défaut de l'instance...",
      pt: "A carregar a seleção de dados predefinida da instância...",
    }),
  );

  return (
    <StateHolderWrapper state={defaults.state()}>
      {(keyedDefaults) => (
        <Step1Inner
          step1Result={p.step1Result}
          defaults={keyedDefaults}
          silentFetch={p.silentFetch}
        />
      )}
    </StateHolderWrapper>
  );
}

function Step1Inner(p: {
  step1Result: RunGenerationStep1Result | null;
  defaults: RunGenerationDefaults;
  silentFetch: () => Promise<void>;
}) {
  const initial = p.step1Result ?? p.defaults.step1;

  function hmisAvailable(): boolean {
    return (
      instanceState.datasetsWithData.includes("hmis") &&
      instanceState.datasetVersions.hmis !== undefined
    );
  }
  function hfaAvailable(): boolean {
    return instanceState.datasetsWithData.includes("hfa");
  }
  function icehAvailable(): boolean {
    return instanceState.datasetsWithData.includes("iceh");
  }

  const [includeHmis, setIncludeHmis] = createSignal(
    initial?.hmis === true && hmisAvailable(),
  );
  const [includeHfa, setIncludeHfa] = createSignal(
    initial?.hfa === true && hfaAvailable(),
  );
  const [includeIceh, setIncludeIceh] = createSignal(
    initial?.iceh === true && icehAvailable(),
  );

  const save = createFormAction(async () => {
    if (!includeHmis() && !includeHfa() && !includeIceh()) {
      return {
        success: false,
        err: t3({
          en: "Select at least one data family for the results package",
          fr: "Sélectionnez au moins une famille de données pour le paquet de résultats",
          pt: "Selecione pelo menos uma família de dados para o pacote de resultados",
        }),
      };
    }
    return await serverActions.updateRunGenerationAttemptStep1({
      step1Result: {
        hmis: includeHmis(),
        hfa: includeHfa(),
        iceh: includeIceh(),
      },
    });
  }, p.silentFetch);

  const notAvailableNote = t3({
    en: "No data of this type has been uploaded to this instance",
    fr: "Aucune donnée de ce type n'a été téléversée sur cette instance",
    pt: "Nenhum dado deste tipo foi carregado nesta instância",
  });

  return (
    <div class="ui-pad ui-spy">
      <h3 class="ui-text-heading">
        {t3({ en: "Choose data", fr: "Choisir les données", pt: "Escolher os dados" })}
      </h3>
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "Choose which data families this results package is generated from. Each included family is captured in full.",
          fr: "Choisissez les familles de données à partir desquelles ce paquet de résultats est généré. Chaque famille incluse est capturée dans son intégralité.",
          pt: "Escolha as famílias de dados a partir das quais este pacote de resultados é gerado. Cada família incluída é capturada na íntegra.",
        })}
      </div>

      <div class="ui-pad ui-spy rounded border">
        <Checkbox
          label={t3({ en: "HMIS data", fr: "Données HMIS", pt: "Dados HMIS" })}
          checked={includeHmis()}
          onChange={setIncludeHmis}
          disabled={!hmisAvailable()}
        />
        <Show when={!hmisAvailable()}>
          <div class="text-base-content-muted text-sm">{notAvailableNote}</div>
        </Show>
      </div>

      <div class="ui-pad ui-spy rounded border">
        <Checkbox
          label={t3({ en: "HFA data", fr: "Données FOSA", pt: "Dados HFA" })}
          checked={includeHfa()}
          onChange={setIncludeHfa}
          disabled={!hfaAvailable()}
        />
        <Show when={!hfaAvailable()}>
          <div class="text-base-content-muted text-sm">{notAvailableNote}</div>
        </Show>
      </div>

      <div class="ui-pad ui-spy rounded border">
        <Checkbox
          label={t3({
            en: "ICEH equity data",
            fr: "Données d'équité ICEH",
            pt: "Dados de equidade ICEH",
          })}
          checked={includeIceh()}
          onChange={setIncludeIceh}
          disabled={!icehAvailable()}
        />
        <Show when={!icehAvailable()}>
          <div class="text-base-content-muted text-sm">{notAvailableNote}</div>
        </Show>
      </div>

      <StateHolderFormError state={save.state()} />

      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          iconName="save"
        >
          {t3({
            en: "Save and continue",
            fr: "Enregistrer et continuer",
            pt: "Guardar e continuar",
          })}
        </Button>
      </div>
    </div>
  );
}
