import { t3 } from "lib";
import { Button, Select, StateHolderFormError, timActionForm } from "panther";
import { For, Show, createMemo, createSignal, onMount } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  adminAreaLevel: 2 | 3 | 4;
  silentRefresh: () => void;
  close: (p: unknown) => void;
};

type FeatureGroup = {
  areaId: string;
  sourceName: string | null;
  count: number;
};

export function GeoJsonEditModal(p: Props) {
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [featureGroups, setFeatureGroups] = createSignal<FeatureGroup[]>([]);
  const [adminAreaOptions, setAdminAreaOptions] = createSignal<Array<{ value: string; label: string }>>([]);

  onMount(async () => {
    try {
      const [geoRes, optionsRes] = await Promise.all([
        serverActions.getGeoJsonForLevel({ level: String(p.adminAreaLevel) }),
        serverActions.getAdminAreaOptionsForLevel({ level: String(p.adminAreaLevel) }),
      ]);

      if (!geoRes.success) {
        setError(geoRes.err ?? "Failed to load GeoJSON");
        setLoading(false);
        return;
      }

      if (!optionsRes.success) {
        setError(optionsRes.err ?? "Failed to load admin areas");
        setLoading(false);
        return;
      }

      setAdminAreaOptions(optionsRes.data);

      const parsed = JSON.parse(geoRes.data.geojson) as {
        type: "FeatureCollection";
        features: Array<{
          properties: { area_id?: string; source_name?: string; dhis2_name?: string };
        }>;
      };

      const groups = new Map<string, FeatureGroup>();
      for (const feature of parsed.features) {
        const areaId = feature.properties?.area_id ?? "";
        // Support both new (source_name) and old (dhis2_name) formats
        const sourceName = feature.properties?.source_name ?? feature.properties?.dhis2_name ?? null;

        if (!groups.has(areaId)) {
          groups.set(areaId, { areaId, sourceName, count: 0 });
        }
        groups.get(areaId)!.count++;
      }

      const sortedGroups = [...groups.values()].sort((a, b) => a.areaId.localeCompare(b.areaId));
      setFeatureGroups(sortedGroups);

      // Initialize current mappings
      const initial: Record<string, string> = {};
      for (const group of sortedGroups) {
        initial[group.areaId] = group.areaId;
      }
      setCurrentMappings(initial);

      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
      setLoading(false);
    }
  });

  const hasSourceNames = createMemo(() => featureGroups().some((g) => g.sourceName !== null));

  // Track the current mapping for each feature group (starts as the stored area_id)
  const [currentMappings, setCurrentMappings] = createSignal<Record<string, string>>({});

  const hasChanges = createMemo(() => {
    const current = currentMappings();
    return featureGroups().some((g) => current[g.areaId] !== g.areaId);
  });

  const selectOptions = createMemo(() => [
    { value: "", label: t3({ en: "— Not mapped —", fr: "— Non mappé —" }) },
    ...adminAreaOptions(),
  ]);

  function handleMappingChange(originalAreaId: string, newAreaId: string) {
    setCurrentMappings((prev) => ({
      ...prev,
      [originalAreaId]: newAreaId,
    }));
  }

  // Build remapping for save: only include changed mappings
  function buildRemapping(): Record<string, string> {
    const current = currentMappings();
    const result: Record<string, string> = {};
    for (const group of featureGroups()) {
      if (current[group.areaId] && current[group.areaId] !== group.areaId) {
        result[group.areaId] = current[group.areaId];
      }
    }
    return result;
  }

  const saveAction = timActionForm(
    async () => {
      const map = buildRemapping();
      if (Object.keys(map).length === 0) {
        return { success: false, err: t3({ en: "No changes to save", fr: "Aucune modification à enregistrer" }) };
      }

      const res = await serverActions.remapGeoJson({
        adminAreaLevel: p.adminAreaLevel,
        remapping: map,
      });

      if (res.success) {
        p.silentRefresh();
        p.close(undefined);
      }

      return res;
    },
    () => {},
  );

  function handleDownload() {
    serverActions.getGeoJsonForLevel({ level: String(p.adminAreaLevel) }).then((res) => {
      if (!res.success) return;
      const blob = new Blob([res.data.geojson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `geojson_aa${p.adminAreaLevel}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div class="ui-pad-lg ui-spy" style={{ "min-width": "600px", "max-height": "80vh", "overflow-y": "auto" }}>
      <div class="font-700 text-lg">
        {t3({ en: "Edit GeoJSON Mapping", fr: "Modifier le mappage GeoJSON" })} — AA{p.adminAreaLevel}
      </div>

      <Show when={loading()}>
        <div class="text-base-500 py-8 text-center">
          {t3({ en: "Loading...", fr: "Chargement..." })}
        </div>
      </Show>

      <Show when={error()}>
        <div class="text-error py-8 text-center">{error()}</div>
      </Show>

      <Show when={!loading() && !error()}>
        <div class="text-base-500 text-sm">
          {featureGroups().length} {t3({ en: "features mapped", fr: "entités mappées" })}
        </div>

        <div class="border-base-300 max-h-96 overflow-auto rounded border">
          <div class="bg-base-100 border-base-300 flex border-b px-3 py-2 text-sm font-semibold">
            <div class="w-1/2">
              {hasSourceNames()
                ? t3({ en: "Source Name", fr: "Nom source" })
                : t3({ en: "Current Mapping", fr: "Mappage actuel" })}
            </div>
            <div class="w-1/2">{t3({ en: "Map to Admin Area", fr: "Mapper vers zone admin" })}</div>
          </div>
          <For each={featureGroups()}>
            {(group) => (
              <div class="border-base-200 flex items-center border-b px-3 py-1 last:border-b-0">
                <div class="w-1/2">
                  <div class="text-sm">
                    {group.sourceName ?? group.areaId}
                  </div>
                  <Show when={group.sourceName && group.sourceName !== group.areaId}>
                    <div class="text-base-400 text-xs">
                      {t3({ en: "Currently mapped to", fr: "Actuellement mappé vers" })}: {group.areaId}
                    </div>
                  </Show>
                  <Show when={group.count > 1}>
                    <div class="text-base-400 text-xs">
                      ({group.count} {t3({ en: "features", fr: "entités" })})
                    </div>
                  </Show>
                </div>
                <div class="w-1/2">
                  <Select
                    options={selectOptions()}
                    value={currentMappings()[group.areaId] ?? ""}
                    onChange={(v) => handleMappingChange(group.areaId, v)}
                    fullWidth
                    size="sm"
                  />
                </div>
              </div>
            )}
          </For>
        </div>

        <StateHolderFormError state={saveAction.state()} />

        <div class="ui-gap-sm flex">
          <Button
            onClick={saveAction.click}
            state={saveAction.state()}
            disabled={!hasChanges()}
            intent="primary"
          >
            {t3({ en: "Save changes", fr: "Enregistrer" })}
          </Button>
          <Button intent="neutral" onClick={handleDownload} iconName="download">
            {t3({ en: "Download GeoJSON", fr: "Télécharger GeoJSON" })}
          </Button>
          <Button intent="neutral" onClick={() => p.close(undefined)}>
            {t3({ en: "Cancel", fr: "Annuler" })}
          </Button>
        </div>
      </Show>
    </div>
  );
}
