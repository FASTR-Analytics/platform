import {
  DEFAULT_PERIOD_END,
  DEFAULT_PERIOD_START,
  t3,
  type DatasetHmisWindowingCommon,
  type RunGenerationPrefill,
  type RunGenerationStep1Result,
} from "lib";
import {
  Button,
  Checkbox,
  MultiSelect,
  StateHolderFormError,
  StateHolderWrapper,
  createFormAction,
  createQuery,
} from "panther";
import { Show, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { validateAndNormalizeHmisWindowing } from "~/components/_shared/hmis_windowing_validation";
import { WindowingSelector } from "~/components/WindowingSelector";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  projectId: string;
  step1Result: RunGenerationStep1Result | null;
  silentFetch: () => Promise<void>;
};

// Step 1 — choose data: family checkboxes + per-family scoping, reusing the
// per-project windowing UI verbatim (§10 ruling 6). Starting values: the
// attempt's own step1Result (resume) beats the attached run's manifest
// prefill beats defaults.
export function Step1(p: Props) {
  const prefill = createQuery(
    () => serverActions.getRunGenerationPrefill({ project_id: p.projectId }),
    t3({
      en: "Loading current data selection...",
      fr: "Chargement de la sélection de données actuelle...",
      pt: "A carregar a seleção de dados atual...",
    }),
  );

  return (
    <StateHolderWrapper state={prefill.state()}>
      {(keyedPrefill) => (
        <Step1Inner
          projectId={p.projectId}
          step1Result={p.step1Result}
          prefill={keyedPrefill}
          silentFetch={p.silentFetch}
        />
      )}
    </StateHolderWrapper>
  );
}

function Step1Inner(p: {
  projectId: string;
  step1Result: RunGenerationStep1Result | null;
  prefill: RunGenerationPrefill;
  silentFetch: () => Promise<void>;
}) {
  const initial = p.step1Result ?? p.prefill.step1;

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
    initial?.hmis != null && hmisAvailable(),
  );
  const [tempWindowing, setTempWindowing] =
    createStore<DatasetHmisWindowingCommon>(
      initial?.hmis
        ? { ...structuredClone(initial.hmis.windowing), indicatorType: "common" }
        : {
          indicatorType: "common",
          start: DEFAULT_PERIOD_START,
          end: DEFAULT_PERIOD_END,
          takeAllIndicators: true,
          takeAllAdminArea2s: true,
          adminArea2sToInclude: [],
          commonIndicatorsToInclude: [],
          takeAllAdminArea3s: true,
          adminArea3sToInclude: [],
        },
    );

  const [includeHfa, setIncludeHfa] = createSignal(
    initial?.hfa != null && hfaAvailable(),
  );
  const initialHfaScope = initial?.hfa?.serviceCategoryScope ?? [];
  const [hfaIncludeAll, setHfaIncludeAll] = createSignal(
    initialHfaScope.length === 0,
  );
  const [hfaSelected, setHfaSelected] = createSignal<string[]>(initialHfaScope);
  const serviceCategoriesQuery = createQuery(
    () => serverActions.getHfaIndicatorServiceCategories({}),
    t3({
      en: "Loading service categories...",
      fr: "Chargement des catégories de service...",
      pt: "A carregar categorias de serviço...",
    }),
  );

  const [includeIceh, setIncludeIceh] = createSignal(
    initial?.iceh === true && icehAvailable(),
  );

  const save = createFormAction(async () => {
    let hmis: RunGenerationStep1Result["hmis"] = null;
    if (includeHmis()) {
      const validated = validateAndNormalizeHmisWindowing(
        unwrap(tempWindowing),
        unwrap(instanceState.facilityColumns),
      );
      if (validated.success === false) {
        return validated;
      }
      hmis = { windowing: validated.windowing };
    }
    let hfa: RunGenerationStep1Result["hfa"] = null;
    if (includeHfa()) {
      const scope = hfaIncludeAll() ? [] : hfaSelected();
      if (!hfaIncludeAll() && scope.length === 0) {
        return {
          success: false,
          err: t3({
            en: "Select at least one service category, or choose Include all.",
            fr: "Sélectionnez au moins une catégorie de service, ou choisissez Tout inclure.",
            pt: "Selecione pelo menos uma categoria de serviço, ou escolha Incluir tudo.",
          }),
        };
      }
      hfa = { serviceCategoryScope: scope };
    }
    if (hmis === null && hfa === null && !includeIceh()) {
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
      project_id: p.projectId,
      step1Result: { hmis, hfa, iceh: includeIceh() },
    });
  }, p.silentFetch);

  const notAvailableNote = t3({
    en: "No data of this type has been uploaded to this instance",
    fr: "Aucune donnée de ce type n'a été téléversée sur cette instance",
    pt: "Nenhum dado deste tipo foi carregado nesta instância",
  });

  return (
    <div class="ui-pad ui-spy">
      <h3 class="font-700 text-lg">
        {t3({ en: "Choose data", fr: "Choisir les données", pt: "Escolher os dados" })}
      </h3>
      <div class="text-neutral text-sm">
        {t3({
          en: "Choose which data families this results package is generated from, and how each is scoped.",
          fr: "Choisissez les familles de données à partir desquelles ce paquet de résultats est généré, et leur périmètre.",
          pt: "Escolha as famílias de dados a partir das quais este pacote de resultados é gerado, e o respetivo âmbito.",
        })}
      </div>

      <div class="border-base-300 ui-pad ui-spy rounded border">
        <Checkbox
          label={t3({ en: "HMIS data", fr: "Données HMIS", pt: "Dados HMIS" })}
          checked={includeHmis()}
          onChange={setIncludeHmis}
          disabled={!hmisAvailable()}
        />
        <Show when={!hmisAvailable()}>
          <div class="text-neutral text-sm">{notAvailableNote}</div>
        </Show>
        <Show when={includeHmis() && instanceState.datasetVersions.hmis}>
          {(keyedVersionId) => (
            <WindowingSelector
              hmisVersionId={keyedVersionId()}
              indicatorMappingsVersion={instanceState.indicatorMappingsVersion}
              tempWindowing={tempWindowing}
              setTempWindowing={setTempWindowing}
              includeOrDelete="include"
              facilityColumns={instanceState.facilityColumns}
            />
          )}
        </Show>
      </div>

      <div class="border-base-300 ui-pad ui-spy rounded border">
        <Checkbox
          label={t3({ en: "HFA data", fr: "Données FOSA", pt: "Dados HFA" })}
          checked={includeHfa()}
          onChange={setIncludeHfa}
          disabled={!hfaAvailable()}
        />
        <Show when={!hfaAvailable()}>
          <div class="text-neutral text-sm">{notAvailableNote}</div>
        </Show>
        <Show when={includeHfa()}>
          <StateHolderWrapper state={serviceCategoriesQuery.state()}>
            {(serviceCategories) => (
              <div class="ui-spy max-w-lg">
                <Checkbox
                  label={t3({
                    en: "Include all service categories",
                    fr: "Inclure toutes les catégories de service",
                    pt: "Incluir todas as categorias de serviço",
                  })}
                  checked={hfaIncludeAll()}
                  onChange={setHfaIncludeAll}
                />
                <Show when={!hfaIncludeAll()}>
                  <MultiSelect
                    values={hfaSelected()}
                    onChange={setHfaSelected}
                    options={serviceCategories.map((sc) => ({
                      value: sc.id,
                      label: sc.label,
                    }))}
                  />
                </Show>
              </div>
            )}
          </StateHolderWrapper>
        </Show>
      </div>

      <div class="border-base-300 ui-pad ui-spy rounded border">
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
          <div class="text-neutral text-sm">{notAvailableNote}</div>
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
