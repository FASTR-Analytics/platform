import type Uppy from "@uppy/core";
import { t3, TC } from "lib";
import {
  Button,
  Select,
  StateHolderFormError,
  StateHolderWrapper,
  getSelectOptions,
  timActionForm,
  timQuery,
} from "panther";
import { For, Match, Show, Switch, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { cleanupUppy, createUppyInstance } from "~/upload/uppy_file_upload";

type Props = {
  silentRefresh: () => void;
  close: (p: unknown) => void;
};

type AnalysisResult = {
  properties: string[];
  sampleValues: Record<string, string[]>;
  featureCount: number;
};

export function GeoJsonUploadWizard(p: Props) {
  const [step, setStep] = createSignal<1 | 2 | 3 | 4>(1);
  const [selectedFileName, setSelectedFileName] = createSignal<string>("");
  const [analysisResult, setAnalysisResult] = createSignal<AnalysisResult | undefined>(undefined);
  const [adminAreaLevel, setAdminAreaLevel] = createSignal<number>(2);
  const [selectedProp, setSelectedProp] = createSignal<string>("");
  const [adminAreaNames, setAdminAreaNames] = createSignal<string[]>([]);
  const [adminAreasLoading, setAdminAreasLoading] = createSignal(false);

  const assetListing = timQuery(
    () => serverActions.getAssets({}),
    t3(TC.loadingAssets),
  );

  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-geojson-file-button",
      onModalClosed: () => {
        assetListing.fetch();
      },
      onUploadSuccess: (file) => {
        if (!file) return;
        setSelectedFileName(file.name as string);
      },
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  const analyzeAction = timActionForm(
    async () => {
      const fileName = selectedFileName();
      if (!fileName) {
        return { success: false, err: t3({ en: "Please select a file", fr: "Veuillez sélectionner un fichier" }) };
      }
      const res = await serverActions.analyzeGeoJsonUpload({ assetFileName: fileName });
      if (res.success) {
        setAnalysisResult(res.data);
        if (res.data.properties.length > 0) {
          setSelectedProp(res.data.properties[0]);
        }
        setStep(2);
      }
      return res;
    },
    () => {},
  );

  const propertyOptions = createMemo(() => {
    const result = analysisResult();
    if (!result) return [];
    return result.properties.map((prop) => ({
      value: prop,
      label: `${prop} (${result.sampleValues[prop]?.length ?? 0} values)`,
    }));
  });

  const geoJsonValues = createMemo(() => {
    const result = analysisResult();
    const prop = selectedProp();
    if (!result || !prop) return [];
    return result.sampleValues[prop] ?? [];
  });

  // geoToAdmin maps geoJsonValue -> adminAreaName (UI direction)
  // processGeoJson expects adminAreaName -> geoJsonValue (reversed at save time)
  const [geoToAdmin, setGeoToAdmin] = createSignal<Record<string, string>>({});

  async function fetchAdminAreas() {
    setAdminAreasLoading(true);
    const res = await serverActions.getAdminAreaNamesForLevel({ level: String(adminAreaLevel()) });
    if (res.success) {
      setAdminAreaNames(res.data);
    }
    setAdminAreasLoading(false);
  }

  function buildAutoMapping() {
    const names = adminAreaNames();
    const geoVals = geoJsonValues();
    const mapping: Record<string, string> = {};
    const nameLower = new Map(names.map((n) => [n.toLowerCase(), n]));
    for (const geoVal of geoVals) {
      const match = nameLower.get(geoVal.toLowerCase());
      if (match) {
        mapping[geoVal] = match;
      }
    }
    setGeoToAdmin(mapping);
  }

  async function goToMappingStep() {
    await fetchAdminAreas();
    buildAutoMapping();
    setStep(3);
  }

  function updateMappingForGeoValue(geoJsonValue: string, adminAreaName: string) {
    setGeoToAdmin((prev) => {
      const next = { ...prev };
      if (adminAreaName === "") {
        delete next[geoJsonValue];
      } else {
        next[geoJsonValue] = adminAreaName;
      }
      return next;
    });
  }

  function getAreaMappingForSave(): Record<string, string> {
    const g2a = geoToAdmin();
    const result: Record<string, string> = {};
    for (const [geoVal, adminName] of Object.entries(g2a)) {
      result[adminName] = geoVal;
    }
    return result;
  }

  const mappedCount = createMemo(() => Object.keys(geoToAdmin()).length);
  const unmappedGeoCount = createMemo(() => geoJsonValues().length - mappedCount());

  const adminAreaOptions = createMemo(() => {
    const names = adminAreaNames();
    return [
      { value: "", label: t3({ en: "— Not mapped —", fr: "— Non mappé —" }) },
      ...names.map((n) => ({ value: n, label: n })),
    ];
  });

  const saveAction = timActionForm(
    async () => {
      const mapping = getAreaMappingForSave();
      if (Object.keys(mapping).length === 0) {
        return { success: false, err: t3({ en: "No mappings defined", fr: "Aucun mappage défini" }) };
      }
      const res = await serverActions.saveGeoJsonMap({
        adminAreaLevel: adminAreaLevel(),
        assetFileName: selectedFileName(),
        areaMatchProp: selectedProp(),
        areaMapping: mapping,
      });
      if (res.success) {
        p.silentRefresh();
        p.close(undefined);
      }
      return res;
    },
    () => {},
  );

  const levelOptions = [
    { value: "2", label: t3({ en: "Admin area 2", fr: "Niveau administratif 2" }) },
    { value: "3", label: t3({ en: "Admin area 3", fr: "Niveau administratif 3" }) },
    { value: "4", label: t3({ en: "Admin area 4", fr: "Niveau administratif 4" }) },
  ];

  return (
    <div class="ui-pad-lg ui-spy" style={{ "min-width": "700px", "max-height": "80vh", "overflow-y": "auto" }}>
      <div class="font-700 text-lg">
        {t3({ en: "Upload GeoJSON", fr: "Télécharger GeoJSON" })}
      </div>

      <Switch>
        {/* Step 1: Select file */}
        <Match when={step() === 1}>
          <div class="ui-spy">
            <div class="font-600">{t3({ en: "Step 1: Select GeoJSON file", fr: "Étape 1 : Sélectionner le fichier GeoJSON" })}</div>

            <Button id="select-geojson-file-button" iconName="upload">
              {t3({ en: "Upload new GeoJSON file", fr: "Téléverser un nouveau fichier GeoJSON" })}
            </Button>

            <div class="w-96">
              <StateHolderWrapper state={assetListing.state()} noPad>
                {(keyedAssets) => (
                  <Select
                    label={t3({ en: "Or select existing file", fr: "Ou sélectionner un fichier existant" })}
                    options={getSelectOptions(
                      keyedAssets
                        .filter((a) => a.fileName.endsWith(".geojson") || a.fileName.endsWith(".json"))
                        .map((a) => a.fileName),
                    )}
                    value={selectedFileName()}
                    onChange={setSelectedFileName}
                    fullWidth
                  />
                )}
              </StateHolderWrapper>
            </div>

            <StateHolderFormError state={analyzeAction.state()} />

            <div class="ui-gap-sm flex">
              <Button
                onClick={analyzeAction.click}
                state={analyzeAction.state()}
                disabled={!selectedFileName()}
                intent="primary"
              >
                {t3({ en: "Analyze", fr: "Analyser" })}
              </Button>
              <Button intent="neutral" onClick={() => p.close(undefined)}>
                {t3({ en: "Cancel", fr: "Annuler" })}
              </Button>
            </div>
          </div>
        </Match>

        {/* Step 2: Select level and property */}
        <Match when={step() === 2}>
          <div class="ui-spy">
            <div class="ui-spy-sm">
              <div class="font-600">{t3({ en: "Step 2: Configure", fr: "Étape 2 : Configurer" })}</div>
              <Show when={analysisResult()} keyed>
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
                value={String(adminAreaLevel())}
                onChange={(v) => setAdminAreaLevel(parseInt(v))}
                fullWidth
              />
            </div>

            <div class="ui-spy-sm">
              <label class="font-600 text-sm">{t3({ en: "GeoJSON property to match on", fr: "Propriété GeoJSON pour le mappage" })}</label>
              <Select
                options={propertyOptions()}
                value={selectedProp()}
                onChange={(v) => setSelectedProp(v)}
                fullWidth
              />
            </div>

            <Show when={selectedProp()}>
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
                onClick={goToMappingStep}
                disabled={!selectedProp() || adminAreasLoading()}
                intent="primary"
              >
                {adminAreasLoading()
                  ? t3({ en: "Loading...", fr: "Chargement..." })
                  : t3({ en: "Next", fr: "Suivant" })}
              </Button>
              <Button intent="neutral" onClick={() => setStep(1)}>
                {t3({ en: "Back", fr: "Retour" })}
              </Button>
            </div>
          </div>
        </Match>

        {/* Step 3: Map GeoJSON values to admin areas */}
        <Match when={step() === 3}>
          <div class="ui-spy">
            <div class="ui-spy-sm">
              <div class="font-600">{t3({ en: "Step 3: Map GeoJSON features to admin areas", fr: "Étape 3 : Associer les entités GeoJSON aux unités administratives" })}</div>
              <div class="text-base-500 text-sm">
                {mappedCount()}/{geoJsonValues().length} {t3({ en: "mapped", fr: "mappés" })}
                <Show when={unmappedGeoCount() > 0}>
                  {" "}
                  <span class="text-danger">
                    ({unmappedGeoCount()} {t3({ en: "unmapped", fr: "non mappés" })})
                  </span>
                </Show>
              </div>
            </div>

            <div class="border-base-300 max-h-96 overflow-auto rounded border">
              <div class="bg-base-100 border-base-300 flex border-b px-3 py-2 text-sm font-semibold">
                <div class="w-1/2">{t3({ en: "GeoJSON value", fr: "Valeur GeoJSON" })}</div>
                <div class="w-1/2">{t3({ en: "Admin area", fr: "Unité administrative" })}</div>
              </div>
              <For each={geoJsonValues()}>
                {(geoVal) => (
                  <div class="border-base-200 flex items-center border-b px-3 py-1 last:border-b-0">
                    <div class="w-1/2 text-sm font-mono">{geoVal}</div>
                    <div class="w-1/2">
                      <Select
                        options={adminAreaOptions()}
                        value={geoToAdmin()[geoVal] ?? ""}
                        onChange={(v) => updateMappingForGeoValue(geoVal, v)}
                        fullWidth
                        size="sm"
                      />
                    </div>
                  </div>
                )}
              </For>
            </div>

            <div class="ui-gap-sm flex">
              <Button onClick={() => setStep(4)} disabled={mappedCount() === 0} intent="primary">
                {t3({ en: "Next", fr: "Suivant" })}
              </Button>
              <Button intent="neutral" onClick={() => setStep(2)}>
                {t3({ en: "Back", fr: "Retour" })}
              </Button>
            </div>
          </div>
        </Match>

        {/* Step 4: Confirm and save */}
        <Match when={step() === 4}>
          <div class="ui-spy">
            <div class="ui-spy-sm">
              <div class="font-600">{t3({ en: "Step 4: Confirm and save", fr: "Étape 4 : Confirmer et enregistrer" })}</div>
              <div class="text-base-500 ui-spy-sm text-sm">
                <div>{t3({ en: "File", fr: "Fichier" })}: {selectedFileName()}</div>
                <div>{t3({ en: "Admin area level", fr: "Niveau administratif" })}: {adminAreaLevel()}</div>
                <div>{t3({ en: "GeoJSON property", fr: "Propriété GeoJSON" })}: {selectedProp()}</div>
                <div>{t3({ en: "Mapped features", fr: "Entités mappées" })}: {mappedCount()}/{geoJsonValues().length}</div>
                <Show when={unmappedGeoCount() > 0}>
                  <div class="text-danger">
                    {unmappedGeoCount()} {t3({ en: "GeoJSON features will be excluded", fr: "entités GeoJSON seront exclues" })}
                  </div>
                </Show>
              </div>
            </div>

            <StateHolderFormError state={saveAction.state()} />

            <div class="ui-gap-sm flex">
              <Button
                onClick={saveAction.click}
                state={saveAction.state()}
                intent="success"
              >
                {t3({ en: "Save", fr: "Enregistrer" })}
              </Button>
              <Button intent="neutral" onClick={() => setStep(3)}>
                {t3({ en: "Back", fr: "Retour" })}
              </Button>
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
