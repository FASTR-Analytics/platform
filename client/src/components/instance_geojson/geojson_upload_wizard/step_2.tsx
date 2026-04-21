import { t3 } from "lib";
import { Button, Select, StateHolderFormError, timActionForm } from "panther";
import { For, Show, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/disaggregation_label";
import type { WizardState, LevelMappingState } from "./index";

type Props = {
  state: WizardState;
};

export function Step2(p: Props) {
  const { state } = p;

  // For file source - existing logic
  const [adminAreasLoading, setAdminAreasLoading] = createSignal(false);

  const propertyOptions = createMemo(() => {
    const result = state.analysisResult();
    if (!result) return [];
    return result.properties.map((prop) => ({
      value: prop,
      label: `${prop} (${result.sampleValues[prop]?.length ?? 0} values)`,
    }));
  });

  const geoJsonValues = createMemo(() => {
    const result = state.analysisResult();
    const prop = state.selectedProp();
    if (!result || !prop) return [];
    return result.sampleValues[prop] ?? [];
  });

  async function fetchAdminAreas() {
    setAdminAreasLoading(true);
    const res = await serverActions.getAdminAreaOptionsForLevel({ level: String(state.adminAreaLevel()) });
    if (res.success) {
      state.setAdminAreaOptions(res.data);
      state.setAdminAreaNames(res.data.map((o) => o.value));
    }
    setAdminAreasLoading(false);
  }

  function buildAutoMapping() {
    const names = state.adminAreaNames();
    const geoVals = geoJsonValues();
    const mapping: Record<string, string> = {};
    const nameLower = new Map(names.map((n) => [n.toLowerCase(), n]));
    for (const geoVal of geoVals) {
      const match = nameLower.get(geoVal.toLowerCase());
      if (match) {
        mapping[geoVal] = match;
      }
    }
    state.setGeoToAdmin(mapping);
  }

  async function goToMappingStepFile() {
    await fetchAdminAreas();
    buildAutoMapping();
    state.setStep(3);
  }

  // For DHIS2 source - fetch all levels and build mapping states
  const [skippedLevels, setSkippedLevels] = createSignal<Array<{ level: number; reason: string }>>([]);

  const fetchAllLevelsAction = timActionForm(
    async () => {
      const creds = state.dhis2Credentials();
      const mappings = state.detectedMappings();
      if (!creds || mappings.length === 0) {
        return { success: false, err: "No DHIS2 credentials or mappings" };
      }

      const levelStates: LevelMappingState[] = [];
      const skipped: Array<{ level: number; reason: string }> = [];

      for (const mapping of mappings) {
        if (mapping.dhis2Level === null) continue;

        // Fetch admin area options (with hierarchy labels) for this level
        const aaOptionsRes = await serverActions.getAdminAreaOptionsForLevel({ level: String(mapping.adminAreaLevel) });
        if (!aaOptionsRes.success) {
          skipped.push({ level: mapping.adminAreaLevel, reason: "Could not fetch admin area names" });
          continue;
        }
        const aaOptions = aaOptionsRes.data;
        const aaNames = aaOptions.map((o) => o.value);

        // Fetch and analyze GeoJSON for this DHIS2 level
        const analyzeRes = await serverActions.dhis2AnalyzeGeoJson({
          ...creds,
          dhis2Level: mapping.dhis2Level,
        });
        if (!analyzeRes.success) {
          skipped.push({ level: mapping.adminAreaLevel, reason: analyzeRes.err ?? "No geometry available" });
          continue;
        }

        // Auto-map by name (case-insensitive)
        const nameLower = new Map(aaNames.map((n) => [n.toLowerCase(), n]));
        const geoToAdmin: Record<string, string> = {};
        const defaultProp = analyzeRes.data.properties.includes("name") ? "name" : analyzeRes.data.properties[0];

        const geoVals = analyzeRes.data.sampleValues[defaultProp] ?? [];
        for (const geoVal of geoVals) {
          const match = nameLower.get(geoVal.toLowerCase());
          if (match) {
            geoToAdmin[geoVal] = match;
          }
        }

        levelStates.push({
          adminAreaLevel: mapping.adminAreaLevel,
          dhis2Level: mapping.dhis2Level,
          analysisResult: {
            properties: analyzeRes.data.properties,
            sampleValues: analyzeRes.data.sampleValues,
            featureCount: analyzeRes.data.featureCount,
          },
          dhis2Features: analyzeRes.data.dhis2Features,
          adminAreaNames: aaNames,
          adminAreaOptions: aaOptions,
          geoToAdmin,
          selectedProp: defaultProp,
        });
      }

      setSkippedLevels(skipped);

      if (levelStates.length === 0) {
        const reasons = skipped.map((s) => `AA${s.level}: ${s.reason}`).join("; ");
        return { success: false, err: `No levels with geometry available. ${reasons}` };
      }

      state.setLevelMappingStates(levelStates);
      state.setCurrentLevelIndex(0);
      state.setStep(3);
      return { success: true };
    },
    () => {},
  );

  const levelOptions = [
    { value: "2", label: t3(getAdminAreaLabel(2)) },
    { value: "3", label: t3(getAdminAreaLabel(3)) },
    { value: "4", label: t3(getAdminAreaLabel(4)) },
  ];

  return (
    <Show
      when={state.source() === "file"}
      fallback={
        <div class="ui-spy">
          <div class="ui-spy-sm">
            <div class="font-600">{t3({ en: "Step 2: Fetch GeoJSON from DHIS2", fr: "Étape 2 : Récupérer le GeoJSON depuis DHIS2" })}</div>
            <div class="text-base-500 text-sm">
              {t3({ en: "We will fetch boundaries for all detected admin area levels.", fr: "Nous allons récupérer les limites pour tous les niveaux administratifs détectés." })}
            </div>
          </div>

          <div class="border-base-300 rounded border">
            <div class="bg-base-100 border-base-300 flex border-b px-3 py-2 text-sm font-semibold">
              <div class="w-1/3">{t3({ en: "Admin Level", fr: "Niveau admin" })}</div>
              <div class="w-1/3">{t3({ en: "DHIS2 Level", fr: "Niveau DHIS2" })}</div>
              <div class="w-1/3">{t3({ en: "With geometry", fr: "Avec géométrie" })}</div>
            </div>
            <For each={state.detectedMappings()}>
              {(mapping) => (
                <Show when={mapping.dhis2Level !== null}>
                  <div class="border-base-200 flex items-center border-b px-3 py-2 text-sm last:border-b-0">
                    <div class="w-1/3 font-mono">AA{mapping.adminAreaLevel}</div>
                    <div class="w-1/3">{mapping.dhis2LevelName}</div>
                    <div class="w-1/3">{mapping.geometryCount} {t3({ en: "features", fr: "entités" })}</div>
                  </div>
                </Show>
              )}
            </For>
          </div>

          <StateHolderFormError state={fetchAllLevelsAction.state()} />

          <div class="ui-gap-sm flex">
            <Button
              onClick={fetchAllLevelsAction.click}
              state={fetchAllLevelsAction.state()}
              intent="primary"
            >
              {t3({ en: "Fetch all levels", fr: "Récupérer tous les niveaux" })}
            </Button>
            <Button intent="neutral" onClick={() => state.setStep(1)}>
              {t3({ en: "Back", fr: "Retour" })}
            </Button>
          </div>
        </div>
      }
    >
      <div class="ui-spy">
        <div class="ui-spy-sm">
          <div class="font-600">{t3({ en: "Step 2: Configure", fr: "Étape 2 : Configurer" })}</div>
          <Show when={state.analysisResult()} keyed>
            {(result) => (
              <div class="text-base-500 text-sm">
                {result.featureCount} {t3({ en: "features found", fr: "entités trouvées" })}
              </div>
            )}
          </Show>
        </div>

        <div class="ui-spy-sm">
          <label class="font-600 text-sm">{t3({ en: "Admin area level", fr: "Niveau administratif" })}</label>
          <Select
            options={levelOptions}
            value={String(state.adminAreaLevel())}
            onChange={(v) => state.setAdminAreaLevel(parseInt(v))}
            fullWidth
          />
        </div>

        <div class="ui-spy-sm">
          <label class="font-600 text-sm">{t3({ en: "GeoJSON property to match on", fr: "Propriété GeoJSON pour le mappage" })}</label>
          <Select
            options={propertyOptions()}
            value={state.selectedProp()}
            onChange={(v) => state.setSelectedProp(v)}
            fullWidth
          />
        </div>

        <Show when={state.selectedProp()}>
          <div class="ui-spy-sm">
            <label class="font-600 text-sm">{t3({ en: "Values in selected property", fr: "Valeurs de la propriété sélectionnée" })}</label>
            <div class="border-base-300 max-h-40 overflow-auto rounded border">
              <For each={geoJsonValues().slice(0, 30)}>
                {(val) => (
                  <div class="border-base-200 px-3 py-1 text-sm border-b last:border-b-0">{val}</div>
                )}
              </For>
              <Show when={geoJsonValues().length > 30}>
                <div class="text-base-400 px-3 py-1 text-sm">
                  ...{t3({ en: "and", fr: "et" })} {geoJsonValues().length - 30} {t3({ en: "more", fr: "de plus" })}
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <div class="ui-gap-sm flex">
          <Button
            onClick={goToMappingStepFile}
            disabled={!state.selectedProp() || adminAreasLoading()}
            intent="primary"
          >
            {adminAreasLoading()
              ? t3({ en: "Loading...", fr: "Chargement..." })
              : t3({ en: "Next", fr: "Suivant" })}
          </Button>
          <Button intent="neutral" onClick={() => state.setStep(1)}>
            {t3({ en: "Back", fr: "Retour" })}
          </Button>
        </div>
      </div>
    </Show>
  );
}
