import { t3 } from "lib";
import { Button, Select, StateHolderFormError, createFormAction } from "panther";
import { Show, createMemo, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import type { WizardState } from "./index";

type Props = {
  state: WizardState;
};

export function Step2(p: Props) {
  const { state } = p;

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

  // DHIS2: fetch and analyze selected level
  const dhis2LevelOptions = createMemo(() => {
    return state.dhis2Levels().map((l) => ({
      value: String(l.level),
      label: `${l.name} (${l.orgUnitCount} org units)`,
    }));
  });

  const analyzeAction = createFormAction(
    async () => {
      const creds = state.dhis2Credentials();
      const dhis2Level = state.selectedDhis2Level();
      if (!creds || dhis2Level === null) {
        return { success: false, err: "Select a DHIS2 level" };
      }

      // Fetch admin area options
      const aaRes = await serverActions.getAdminAreaOptionsForLevel({ level: String(state.adminAreaLevel()) });
      if (!aaRes.success) {
        return { success: false, err: aaRes.err ?? "Failed to fetch admin areas" };
      }
      state.setAdminAreaOptions(aaRes.data);
      state.setAdminAreaNames(aaRes.data.map((o) => o.value));

      // Analyze DHIS2 GeoJSON
      const analyzeRes = await serverActions.dhis2AnalyzeGeoJson({
        ...creds,
        dhis2Level,
      });
      if (!analyzeRes.success) {
        return { success: false, err: analyzeRes.err ?? "Failed to analyze GeoJSON" };
      }

      if (analyzeRes.data.featureCount === 0) {
        return { success: false, err: t3({ en: "No features with geometry found at this level", fr: "Aucune entité avec géométrie trouvée à ce niveau" }) };
      }

      state.setAnalysisResult({
        properties: analyzeRes.data.properties,
        sampleValues: analyzeRes.data.sampleValues,
        featureCount: analyzeRes.data.featureCount,
      });
      state.setDhis2Features(analyzeRes.data.dhis2Features);

      // Set default property and auto-map
      const defaultProp = analyzeRes.data.properties.includes("name") ? "name" : analyzeRes.data.properties[0];
      state.setSelectedProp(defaultProp);

      const aaNames = aaRes.data.map((o) => o.value);
      const nameLower = new Map(aaNames.map((n) => [n.toLowerCase(), n]));
      const geoVals = analyzeRes.data.sampleValues[defaultProp] ?? [];
      const mapping: Record<string, string> = {};
      for (const geoVal of geoVals) {
        const match = nameLower.get(geoVal.toLowerCase());
        if (match) {
          mapping[geoVal] = match;
        }
      }
      state.setGeoToAdmin(mapping);

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

  const canAnalyzeDhis2 = createMemo(() => {
    return state.selectedDhis2Level() !== null;
  });

  return (
    <Show
      when={state.source() === "file"}
      fallback={
        <div class="ui-spy">
          <div class="ui-spy-sm">
            <div class="font-600">{t3({ en: "Step 2: Configure", fr: "Étape 2 : Configurer" })}</div>
            <div class="text-base-500 text-sm">
              {t3({ en: "Select which admin area level to import and which DHIS2 level to use.", fr: "Sélectionnez le niveau administratif à importer et le niveau DHIS2 à utiliser." })}
            </div>
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
            <label class="font-600 text-sm">{t3({ en: "DHIS2 level", fr: "Niveau DHIS2" })}</label>
            <Select
              options={dhis2LevelOptions()}
              value={state.selectedDhis2Level() !== null ? String(state.selectedDhis2Level()) : ""}
              onChange={(v) => state.setSelectedDhis2Level(v ? parseInt(v) : null)}
              placeholder={t3({ en: "Select DHIS2 level...", fr: "Sélectionner le niveau DHIS2..." })}
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
              {t3({ en: "Fetch & analyze", fr: "Récupérer et analyser" })}
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
              {geoJsonValues().slice(0, 30).map((val) => (
                <div class="border-base-200 px-3 py-1 text-sm border-b last:border-b-0">{val}</div>
              ))}
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
