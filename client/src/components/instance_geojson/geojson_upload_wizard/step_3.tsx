import { t3 } from "lib";
import { Button, Select } from "panther";
import { For, Show, createMemo } from "solid-js";
import type { WizardState, Dhis2FeatureContext, LevelMappingState, AdminAreaOption } from "./index";

type Props = {
  state: WizardState;
};

type GroupedFeature = {
  geoVal: string;
  features: Dhis2FeatureContext[];
};

export function Step3(p: Props) {
  const { state } = p;

  // For file source - use single-level state
  // For DHIS2 source - use levelMappingStates with currentLevelIndex

  const currentLevel = createMemo((): LevelMappingState | null => {
    if (state.source() === "file") return null;
    const states = state.levelMappingStates();
    const idx = state.currentLevelIndex();
    return states[idx] ?? null;
  });

  const geoJsonValues = createMemo(() => {
    if (state.source() === "file") {
      const result = state.analysisResult();
      const prop = state.selectedProp();
      if (!result || !prop) return [];
      return result.sampleValues[prop] ?? [];
    } else {
      const level = currentLevel();
      if (!level) return [];
      return level.analysisResult?.sampleValues[level.selectedProp] ?? [];
    }
  });

  const groupedByMatchProp = createMemo((): GroupedFeature[] => {
    if (state.source() === "file") {
      return geoJsonValues().map((v) => ({ geoVal: v, features: [] }));
    }

    const level = currentLevel();
    if (!level) return [];

    const groups = new Map<string, Dhis2FeatureContext[]>();
    for (const f of level.dhis2Features) {
      const matchVal = level.selectedProp === "name" ? f.name : level.selectedProp === "code" ? (f.code ?? "") : f.name;
      if (!groups.has(matchVal)) {
        groups.set(matchVal, []);
      }
      groups.get(matchVal)!.push(f);
    }

    return geoJsonValues().map((v) => ({
      geoVal: v,
      features: groups.get(v) ?? [],
    }));
  });

  const geoToAdmin = createMemo(() => {
    if (state.source() === "file") {
      return state.geoToAdmin();
    }
    const level = currentLevel();
    return level?.geoToAdmin ?? {};
  });

  const adminAreaNames = createMemo(() => {
    if (state.source() === "file") {
      return state.adminAreaNames();
    }
    const level = currentLevel();
    return level?.adminAreaNames ?? [];
  });

  const storedOptions = createMemo((): AdminAreaOption[] => {
    if (state.source() === "file") {
      return state.adminAreaOptions();
    }
    const level = currentLevel();
    return level?.adminAreaOptions ?? [];
  });

  const mappedCount = createMemo(() => Object.keys(geoToAdmin()).length);
  const unmappedGeoCount = createMemo(() => geoJsonValues().length - mappedCount());

  const adminAreaOptions = createMemo(() => {
    const options = storedOptions();
    return [
      { value: "", label: t3({ en: "— Not mapped —", fr: "— Non mappé —" }) },
      ...options,
    ];
  });

  function updateMappingForGeoValue(geoJsonValue: string, adminAreaName: string) {
    if (state.source() === "file") {
      state.setGeoToAdmin((prev) => {
        const next = { ...prev };
        if (adminAreaName === "") {
          delete next[geoJsonValue];
        } else {
          next[geoJsonValue] = adminAreaName;
        }
        return next;
      });
    } else {
      const idx = state.currentLevelIndex();
      const states = [...state.levelMappingStates()];
      const level = { ...states[idx] };
      const newMapping = { ...level.geoToAdmin };

      if (adminAreaName === "") {
        delete newMapping[geoJsonValue];
      } else {
        newMapping[geoJsonValue] = adminAreaName;
      }
      level.geoToAdmin = newMapping;

      states[idx] = level;
      state.setLevelMappingStates(states);
    }
  }

  const hasDhis2Ambiguity = createMemo(() => {
    return groupedByMatchProp().some((g) => g.features.length > 1);
  });

  function handleNext() {
    if (state.source() === "file") {
      state.setStep(4);
    } else {
      const idx = state.currentLevelIndex();
      const total = state.levelMappingStates().length;
      if (idx < total - 1) {
        state.setCurrentLevelIndex(idx + 1);
      } else {
        state.setStep(4);
      }
    }
  }

  function handleBack() {
    if (state.source() === "file") {
      state.setStep(2);
    } else {
      const idx = state.currentLevelIndex();
      if (idx > 0) {
        state.setCurrentLevelIndex(idx - 1);
      } else {
        state.setStep(2);
      }
    }
  }

  const levelLabel = createMemo(() => {
    if (state.source() === "file") {
      return `AA${state.adminAreaLevel()}`;
    }
    const level = currentLevel();
    return level ? `AA${level.adminAreaLevel}` : "";
  });

  const progressLabel = createMemo(() => {
    if (state.source() === "file") return "";
    const idx = state.currentLevelIndex();
    const total = state.levelMappingStates().length;
    return `(${idx + 1}/${total})`;
  });

  const isLastLevel = createMemo(() => {
    if (state.source() === "file") return true;
    const idx = state.currentLevelIndex();
    const total = state.levelMappingStates().length;
    return idx >= total - 1;
  });

  return (
    <div class="ui-spy">
      <div class="ui-spy-sm">
        <div class="font-600">
          {t3({ en: "Step 3: Map GeoJSON features to admin areas", fr: "Étape 3 : Associer les entités GeoJSON aux unités administratives" })}
          {" "}{levelLabel()} {progressLabel()}
        </div>
        <div class="text-base-500 text-sm">
          {mappedCount()}/{geoJsonValues().length} {t3({ en: "mapped", fr: "mappés" })}
          <Show when={unmappedGeoCount() > 0}>
            {" "}
            <span class="text-warning">
              ({unmappedGeoCount()} {t3({ en: "unmapped", fr: "non mappés" })})
            </span>
          </Show>
        </div>
        <Show when={hasDhis2Ambiguity()}>
          <div class="text-warning text-sm">
            {t3({ en: "Some DHIS2 org units share the same name. Use the UID and parent info to select the correct one.", fr: "Certaines unités d'organisation DHIS2 partagent le même nom. Utilisez l'UID et les informations sur le parent pour sélectionner la bonne." })}
          </div>
        </Show>
      </div>

      <div class="border-base-300 max-h-96 overflow-auto rounded border">
        <div class="bg-base-100 border-base-300 flex border-b px-3 py-2 text-sm font-semibold">
          <div class="w-1/2">{t3({ en: "GeoJSON value", fr: "Valeur GeoJSON" })}</div>
          <div class="w-1/2">{t3({ en: "Admin area", fr: "Unité administrative" })}</div>
        </div>
        <For each={groupedByMatchProp()}>
          {(group) => (
            <Show
              when={group.features.length > 1}
              fallback={
                <div class="border-base-200 flex items-center border-b px-3 py-1 last:border-b-0">
                  <div class="w-1/2 text-sm font-mono">{group.geoVal}</div>
                  <div class="w-1/2">
                    <Select
                      options={adminAreaOptions()}
                      value={geoToAdmin()[group.geoVal] ?? ""}
                      onChange={(v) => updateMappingForGeoValue(group.geoVal, v)}
                      fullWidth
                      size="sm"
                    />
                  </div>
                </div>
              }
            >
              <For each={group.features}>
                {(feature) => (
                  <div class="border-base-200 flex items-center border-b px-3 py-1 last:border-b-0 bg-base-50">
                    <div class="w-1/2">
                      <div class="text-sm font-mono">{group.geoVal}</div>
                      <div class="text-base-400 text-xs">
                        uid: {feature.uid}
                        <Show when={feature.parentName}>
                          {" · "}parent: {feature.parentName}
                        </Show>
                      </div>
                    </div>
                    <div class="w-1/2">
                      <Select
                        options={adminAreaOptions()}
                        value={geoToAdmin()[group.geoVal] ?? ""}
                        onChange={(v) => updateMappingForGeoValue(group.geoVal, v)}
                        fullWidth
                        size="sm"
                      />
                    </div>
                  </div>
                )}
              </For>
            </Show>
          )}
        </For>
      </div>

      <div class="ui-gap-sm flex">
        <Button onClick={handleNext} disabled={mappedCount() === 0} intent="primary">
          {isLastLevel()
            ? t3({ en: "Review & save", fr: "Vérifier et enregistrer" })
            : t3({ en: "Next level", fr: "Niveau suivant" })}
        </Button>
        <Button intent="neutral" onClick={handleBack}>
          {t3({ en: "Back", fr: "Retour" })}
        </Button>
      </div>
    </div>
  );
}
