import { t3 } from "lib";
import { Button, StateHolderFormError, timActionForm } from "panther";
import { For, Show, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
import type { WizardState } from "./index";

type Props = {
  state: WizardState;
};

export function Step4(p: Props) {
  const { state } = p;

  // File source stats
  const fileGeoJsonValues = createMemo(() => {
    if (state.source() !== "file") return [];
    const result = state.analysisResult();
    const prop = state.selectedProp();
    if (!result || !prop) return [];
    return result.sampleValues[prop] ?? [];
  });

  const fileMappedCount = createMemo(() => Object.keys(state.geoToAdmin()).length);
  const fileUnmappedCount = createMemo(() => fileGeoJsonValues().length - fileMappedCount());

  function getAreaMappingForSave(): Record<string, string> {
    const g2a = state.geoToAdmin();
    const result: Record<string, string> = {};
    for (const [geoVal, adminName] of Object.entries(g2a)) {
      result[adminName] = geoVal;
    }
    return result;
  }

  // Detect duplicate admin area names (same name, different parents)
  const fileDuplicateNames = createMemo(() => {
    if (state.source() !== "file") return [];
    const options = state.adminAreaOptions();
    const valueCounts = new Map<string, number>();
    for (const opt of options) {
      valueCounts.set(opt.value, (valueCounts.get(opt.value) ?? 0) + 1);
    }
    return [...valueCounts.entries()].filter(([_, count]) => count > 1).map(([name]) => name);
  });

  // DHIS2 source stats
  const dhis2Summary = createMemo(() => {
    if (state.source() !== "dhis2") return [];
    return state.levelMappingStates().map((level) => {
      const geoVals = level.analysisResult?.sampleValues[level.selectedProp] ?? [];
      const mapped = Object.keys(level.geoToAdmin).length;

      // Detect duplicates for this level
      const valueCounts = new Map<string, number>();
      for (const opt of level.adminAreaOptions) {
        valueCounts.set(opt.value, (valueCounts.get(opt.value) ?? 0) + 1);
      }
      const duplicateNames = [...valueCounts.entries()].filter(([_, count]) => count > 1).map(([name]) => name);

      return {
        adminAreaLevel: level.adminAreaLevel,
        dhis2Level: level.dhis2Level,
        total: geoVals.length,
        mapped,
        unmapped: geoVals.length - mapped,
        duplicateNames,
      };
    });
  });

  const hasDhis2Duplicates = createMemo(() => dhis2Summary().some((l) => l.duplicateNames.length > 0));

  const saveAction = timActionForm(
    async () => {
      if (state.source() === "file") {
        const mapping = getAreaMappingForSave();
        if (Object.keys(mapping).length === 0) {
          return { success: false, err: t3({ en: "No mappings defined", fr: "Aucun mappage défini" }) };
        }

        const adminAreaLevel = state.adminAreaLevel() as 2 | 3 | 4;
        const res = await serverActions.saveGeoJsonMap({
          adminAreaLevel,
          assetFileName: state.selectedFileName(),
          areaMatchProp: state.selectedProp(),
          areaMapping: mapping,
        });

        if (res.success) {
          state.silentRefresh();
          state.close(undefined);
        }
        return res;
      } else {
        // DHIS2 - save all levels
        const creds = state.dhis2Credentials();
        if (!creds) {
          return { success: false, err: "DHIS2 credentials not found" };
        }

        const levels = state.levelMappingStates();
        const errors: string[] = [];

        for (const level of levels) {
          const mapping: Record<string, string> = {};
          for (const [geoVal, adminName] of Object.entries(level.geoToAdmin)) {
            mapping[adminName] = geoVal;
          }

          if (Object.keys(mapping).length === 0) {
            errors.push(`AA${level.adminAreaLevel}: No mappings`);
            continue;
          }

          const res = await serverActions.dhis2SaveGeoJsonMap({
            ...creds,
            dhis2Level: level.dhis2Level,
            adminAreaLevel: level.adminAreaLevel,
            areaMatchProp: level.selectedProp,
            areaMapping: mapping,
          });

          if (!res.success) {
            errors.push(`AA${level.adminAreaLevel}: ${res.err}`);
          }
        }

        if (errors.length > 0) {
          return { success: false, err: errors.join("; ") };
        }

        state.silentRefresh();
        state.close(undefined);
        return { success: true };
      }
    },
    () => {},
  );

  return (
    <div class="ui-spy">
      <div class="ui-spy-sm">
        <div class="font-600">{t3({ en: "Step 4: Confirm and save", fr: "Étape 4 : Confirmer et enregistrer" })}</div>
      </div>

      <Show when={state.source() === "file"}>
        <div class="text-base-500 ui-spy-sm text-sm">
          <div>{t3({ en: "Source", fr: "Source" })}: {state.selectedFileName()}</div>
          <div>{t3({ en: "Admin area level", fr: "Niveau administratif" })}: AA{state.adminAreaLevel()}</div>
          <div>{t3({ en: "Match property", fr: "Propriété de correspondance" })}: {state.selectedProp()}</div>
          <div>{t3({ en: "Mapped features", fr: "Entités mappées" })}: {fileMappedCount()}/{fileGeoJsonValues().length}</div>
          <Show when={fileUnmappedCount() > 0}>
            <div class="text-warning">
              {fileUnmappedCount()} {t3({ en: "features will be excluded", fr: "entités seront exclues" })}
            </div>
          </Show>
        </div>
        <Show when={fileDuplicateNames().length > 0}>
          <div class="bg-warning/10 border-warning text-warning rounded border p-3 text-sm">
            <div class="font-600 mb-1">
              {t3({ en: "Warning: Duplicate admin area names", fr: "Attention : Noms de zones administratives en double" })}
            </div>
            <div>
              {t3({
                en: `${fileDuplicateNames().length} admin areas share the same name (in different parent regions). Map visualizations may show incorrect data for these areas:`,
                fr: `${fileDuplicateNames().length} zones administratives partagent le même nom (dans des régions parentes différentes). Les visualisations de cartes peuvent afficher des données incorrectes pour ces zones :`,
              })}
            </div>
            <div class="mt-1 font-mono text-xs">{fileDuplicateNames().slice(0, 5).join(", ")}{fileDuplicateNames().length > 5 ? `, +${fileDuplicateNames().length - 5} more` : ""}</div>
          </div>
        </Show>
      </Show>

      <Show when={state.source() === "dhis2"}>
        <div class="text-base-500 text-sm mb-2">
          {t3({ en: "Source", fr: "Source" })}: DHIS2 ({state.dhis2Credentials()?.url})
        </div>

        <div class="border-base-300 rounded border">
          <div class="bg-base-100 border-base-300 flex border-b px-3 py-2 text-sm font-semibold">
            <div class="w-1/4">{t3({ en: "Level", fr: "Niveau" })}</div>
            <div class="w-1/4">{t3({ en: "DHIS2", fr: "DHIS2" })}</div>
            <div class="w-1/4">{t3({ en: "Mapped", fr: "Mappés" })}</div>
            <div class="w-1/4">{t3({ en: "Status", fr: "Statut" })}</div>
          </div>
          <For each={dhis2Summary()}>
            {(level) => (
              <div class="border-base-200 flex items-center border-b px-3 py-2 text-sm last:border-b-0">
                <div class="w-1/4 font-mono">AA{level.adminAreaLevel}</div>
                <div class="w-1/4">Level {level.dhis2Level}</div>
                <div class="w-1/4">{level.mapped}/{level.total}</div>
                <div class="w-1/4">
                  <Show when={level.unmapped === 0} fallback={
                    <span class="text-warning">{level.unmapped} {t3({ en: "excluded", fr: "exclus" })}</span>
                  }>
                    <span class="text-success">{t3({ en: "Complete", fr: "Complet" })}</span>
                  </Show>
                </div>
              </div>
            )}
          </For>
        </div>

        <Show when={hasDhis2Duplicates()}>
          <div class="bg-warning/10 border-warning text-warning rounded border p-3 text-sm">
            <div class="font-600 mb-1">
              {t3({ en: "Warning: Duplicate admin area names", fr: "Attention : Noms de zones administratives en double" })}
            </div>
            <div>
              {t3({
                en: "Some admin areas share the same name (in different parent regions). Map visualizations may show incorrect data for these areas.",
                fr: "Certaines zones administratives partagent le même nom (dans des régions parentes différentes). Les visualisations de cartes peuvent afficher des données incorrectes pour ces zones.",
              })}
            </div>
            <For each={dhis2Summary().filter((l) => l.duplicateNames.length > 0)}>
              {(level) => (
                <div class="mt-1">
                  <span class="font-mono">AA{level.adminAreaLevel}:</span>{" "}
                  <span class="font-mono text-xs">{level.duplicateNames.slice(0, 3).join(", ")}{level.duplicateNames.length > 3 ? `, +${level.duplicateNames.length - 3} more` : ""}</span>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      <StateHolderFormError state={saveAction.state()} />

      <div class="ui-gap-sm flex">
        <Button
          onClick={saveAction.click}
          state={saveAction.state()}
          intent="success"
        >
          {state.source() === "dhis2"
            ? t3({ en: "Save all levels", fr: "Enregistrer tous les niveaux" })
            : t3({ en: "Save", fr: "Enregistrer" })}
        </Button>
        <Button intent="neutral" onClick={() => state.setStep(3)}>
          {t3({ en: "Back", fr: "Retour" })}
        </Button>
      </div>
    </div>
  );
}
