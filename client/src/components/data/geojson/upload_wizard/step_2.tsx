import { ALL_ADMIN_AREA_LEVELS, autoMapAreaNames, t3 } from "lib";
import {
  Button,
  createButtonAction,
  createFormAction,
  Select,
  StateHolderFormError,
} from "panther";
import { batch, createMemo, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { structureSchemaForFamily } from "~/state/instance/t1_store";
import type { WizardState } from "./wizard";

type Props = {
  state: WizardState;
};

export function Step2(p: Props) {
  const propertyOptions = createMemo(() => {
    const result = p.state.analysisResult();
    if (!result) return [];
    return result.properties.map((prop) => ({
      value: prop,
      label: `${prop} (${result.sampleValues[prop]?.length ?? 0} values)`,
    }));
  });

  const geoJsonValues = createMemo(() => {
    const result = p.state.analysisResult();
    const prop = p.state.selectedProp();
    if (!result || !prop) return [];
    return result.sampleValues[prop] ?? [];
  });

  function buildAutoMapping() {
    p.state.setGeoToAdmin(
      autoMapAreaNames(geoJsonValues(), p.state.adminAreaNames()).mapping,
    );
  }

  // The admin areas are what the auto-mapping matches against, so a failed
  // fetch must not advance the step: it used to, and the user met an empty
  // mapping table with no reason given.
  const goToMappingStepFile = createButtonAction(
    () =>
      serverActions.getAdminAreaOptionsForLevel({
        family: p.state.family,
        level: p.state.adminAreaLevel(),
      }),
    (options: Array<{ value: string; label: string }>) => {
      batch(() => {
        p.state.setAdminAreaOptions(options);
        p.state.setAdminAreaNames(options.map((o) => o.value));
        buildAutoMapping();
        p.state.setStep(3);
      });
    },
  );

  // DHIS2: fetch and analyze selected level
  const dhis2LevelOptions = createMemo(() => {
    return p.state.dhis2Levels().map((l) => ({
      value: String(l.level),
      label: `${l.name} (${l.orgUnitCount} org units)`,
    }));
  });

  const analyzeAction = createFormAction(
    async () => {
      const dhis2Level = p.state.selectedDhis2Level();
      if (dhis2Level === null) {
        return { success: false, err: "Select a DHIS2 level" };
      }

      // Fetch admin area options
      const aaRes = await serverActions.getAdminAreaOptionsForLevel({
        family: p.state.family,
        level: p.state.adminAreaLevel(),
      });
      if (!aaRes.success) {
        return {
          success: false,
          err: aaRes.err ?? "Failed to fetch admin areas",
        };
      }
      p.state.setAdminAreaOptions(aaRes.data);
      p.state.setAdminAreaNames(aaRes.data.map((o) => o.value));

      // Analyze DHIS2 GeoJSON
      const analyzeRes = await serverActions.dhis2AnalyzeGeoJson({
        dhis2Level,
      });
      if (!analyzeRes.success) {
        return {
          success: false,
          err: analyzeRes.err ?? "Failed to analyze GeoJSON",
        };
      }

      if (analyzeRes.data.featureCount === 0) {
        return {
          success: false,
          err: t3({
            en: "No features with geometry found at this level",
            fr: "Aucune entité avec géométrie trouvée à ce niveau",
            pt: "Nenhuma entidade com geometria encontrada neste nível",
          }),
        };
      }

      p.state.setAnalysisResult({
        properties: analyzeRes.data.properties,
        sampleValues: analyzeRes.data.sampleValues,
        featureCount: analyzeRes.data.featureCount,
      });
      p.state.setDhis2Features(analyzeRes.data.dhis2Features);

      // Set default property and auto-map
      const defaultProp = analyzeRes.data.properties.includes("name")
        ? "name"
        : analyzeRes.data.properties[0];
      p.state.setSelectedProp(defaultProp);

      p.state.setGeoToAdmin(
        autoMapAreaNames(
          analyzeRes.data.sampleValues[defaultProp] ?? [],
          aaRes.data.map((o) => o.value),
        ).mapping,
      );

      p.state.setStep(3);
      return { success: true };
    },
    () => {},
  );

  const levelOptions = createMemo(() =>
    ALL_ADMIN_AREA_LEVELS
      .filter(
        (level) => level <= structureSchemaForFamily(p.state.family).adminDepth,
      )
      .map((level) => ({
        value: String(level),
        label: t3(getAdminAreaLabel(level)),
      }))
  );

  const noLevelsAvailable = () => levelOptions().length === 0;

  const noLevelsMessage = t3({
    en:
      "This registry's admin area depth does not allow any map levels. Import facilities with admin areas first.",
    fr:
      "La profondeur des unités administratives de ce registre ne permet aucun niveau de carte. Importez d'abord des établissements avec des unités administratives.",
    pt:
      "A profundidade das zonas administrativas deste registo não permite nenhum nível de mapa. Importe primeiro estabelecimentos com zonas administrativas.",
  });

  const canAnalyzeDhis2 = createMemo(() => {
    return p.state.selectedDhis2Level() !== null && !noLevelsAvailable();
  });

  return (
    <Show
      when={p.state.source() === "file"}
      fallback={
        <div class="ui-spy">
          <div class="ui-spy-sm">
            <div class="ui-text-heading">
              {t3({
                en: "Step 2: Configure",
                fr: "Étape 2 : Configurer",
                pt: "Passo 2: Configurar",
              })}
            </div>
            <div class="text-base-content-muted text-sm">
              {t3({
                en:
                  "Select which admin area level to import and which DHIS2 level to use.",
                fr:
                  "Sélectionnez le niveau administratif à importer et le niveau DHIS2 à utiliser.",
                pt:
                  "Selecione o nível de zona administrativa a importar e o nível DHIS2 a utilizar.",
              })}
            </div>
          </div>

          <div class="ui-spy-sm">
            <label class="text-sm">
              {t3({
                en: "Admin area level",
                fr: "Niveau administratif",
                pt: "Nível de zona administrativa",
              })}
            </label>
            <Show
              when={!noLevelsAvailable()}
              fallback={
                <div class="text-warning text-sm">{noLevelsMessage}</div>
              }
            >
              <Select
                options={levelOptions()}
                value={String(p.state.adminAreaLevel())}
                onChange={(v) => p.state.setAdminAreaLevel(parseInt(v))}
                fullWidth
              />
            </Show>
          </div>

          <div class="ui-spy-sm">
            <label class="text-sm">
              {t3({ en: "DHIS2 level", fr: "Niveau DHIS2", pt: "Nível DHIS2" })}
            </label>
            <Select
              options={dhis2LevelOptions()}
              value={p.state.selectedDhis2Level() !== null
                ? String(p.state.selectedDhis2Level())
                : ""}
              onChange={(v) =>
                p.state.setSelectedDhis2Level(v ? parseInt(v) : null)}
              placeholder={t3({
                en: "Select DHIS2 level...",
                fr: "Sélectionner le niveau DHIS2...",
                pt: "Selecionar o nível DHIS2...",
              })}
              fullWidth
            />
          </div>

          <StateHolderFormError state={analyzeAction.state()} />

          <div class="ui-gap-sm flex">
            <Button
              onClick={analyzeAction.click}
              state={analyzeAction.state()}
              disabled={!canAnalyzeDhis2()}
              intent="primary"
            >
              {t3({
                en: "Fetch & analyze",
                fr: "Récupérer et analyser",
                pt: "Obter e analisar",
              })}
            </Button>
            <Button intent="neutral" onClick={() => p.state.setStep(1)}>
              {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
            </Button>
          </div>
        </div>
      }
    >
      <div class="ui-spy">
        <div class="ui-spy-sm">
          <div class="ui-text-heading">
            {t3({
              en: "Step 2: Configure",
              fr: "Étape 2 : Configurer",
              pt: "Passo 2: Configurar",
            })}
          </div>
          <Show when={p.state.analysisResult()} keyed>
            {(result) => (
              <div class="text-base-content-muted text-sm">
                {result.featureCount} {t3({
                  en: "features found",
                  fr: "entités trouvées",
                  pt: "entidades encontradas",
                })}
              </div>
            )}
          </Show>
        </div>

        <div class="ui-spy-sm">
          <label class="text-sm">
            {t3({
              en: "Admin area level",
              fr: "Niveau administratif",
              pt: "Nível de zona administrativa",
            })}
          </label>
          <Show
            when={!noLevelsAvailable()}
            fallback={<div class="text-warning text-sm">{noLevelsMessage}</div>}
          >
            <Select
              options={levelOptions()}
              value={String(p.state.adminAreaLevel())}
              onChange={(v) => p.state.setAdminAreaLevel(parseInt(v))}
              fullWidth
            />
          </Show>
        </div>

        <div class="ui-spy-sm">
          <label class="text-sm">
            {t3({
              en: "GeoJSON property to match on",
              fr: "Propriété GeoJSON pour le mappage",
              pt: "Propriedade GeoJSON para a associação",
            })}
          </label>
          <Select
            options={propertyOptions()}
            value={p.state.selectedProp()}
            onChange={(v) => p.state.setSelectedProp(v)}
            fullWidth
          />
        </div>

        <Show when={p.state.selectedProp()}>
          <div class="ui-spy-sm">
            <label class="text-sm">
              {t3({
                en: "Values in selected property",
                fr: "Valeurs de la propriété sélectionnée",
                pt: "Valores da propriedade selecionada",
              })}
            </label>
            <div class="max-h-40 overflow-auto rounded border">
              {geoJsonValues().slice(0, 30).map((val) => (
                <div class="border-base-200 px-3 py-1 text-sm border-b last:border-b-0">
                  {val}
                </div>
              ))}
              <Show when={geoJsonValues().length > 30}>
                <div class="text-base-content-muted px-3 py-1 text-sm">
                  ...{t3({ en: "and", fr: "et", pt: "e" })}{" "}
                  {geoJsonValues().length - 30}{" "}
                  {t3({ en: "more", fr: "de plus", pt: "mais" })}
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <div class="ui-gap-sm flex">
          <Button
            onClick={goToMappingStepFile.click}
            state={goToMappingStepFile.state()}
            disabled={!p.state.selectedProp() || noLevelsAvailable() ||
              goToMappingStepFile.state().status === "loading"}
            intent="primary"
          >
            {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
          </Button>
          <Button intent="neutral" onClick={() => p.state.setStep(1)}>
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </div>
      </div>
    </Show>
  );
}
