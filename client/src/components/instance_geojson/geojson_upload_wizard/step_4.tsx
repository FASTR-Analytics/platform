import { t3 } from "lib";
import { Button, StateHolderFormError, createFormAction } from "panther";
import { Show, createMemo } from "solid-js";
import { serverActions } from "~/server_actions";
import type { WizardState } from "./index";

type Props = {
  state: WizardState;
};

export function Step4(p: Props) {
  const { state } = p;

  const geoJsonValues = createMemo(() => {
    const result = state.analysisResult();
    const prop = state.selectedProp();
    if (!result || !prop) return [];
    return result.sampleValues[prop] ?? [];
  });

  const mappedCount = createMemo(() => Object.keys(state.geoToAdmin()).length);
  const unmappedCount = createMemo(() => geoJsonValues().length - mappedCount());

  const duplicateNames = createMemo(() => {
    const options = state.adminAreaOptions();
    const valueCounts = new Map<string, number>();
    for (const opt of options) {
      valueCounts.set(opt.value, (valueCounts.get(opt.value) ?? 0) + 1);
    }
    return [...valueCounts.entries()].filter(([_, count]) => count > 1).map(([name]) => name);
  });

  const saveAction = createFormAction(
    async () => {
      const mapping = state.geoToAdmin();
      if (Object.keys(mapping).length === 0) {
        return { success: false, err: t3({ en: "No mappings defined", fr: "Aucun mappage défini" }) };
      }

      const adminAreaLevel = state.adminAreaLevel() as 2 | 3 | 4;

      if (state.source() === "file") {
        const res = await serverActions.saveGeoJsonMap({
          adminAreaLevel,
          assetFileName: state.selectedFileName(),
          areaMatchProp: state.selectedProp(),
          areaMapping: mapping,
        });

        if (res.success) {
          state.close(undefined);
        }
        return res;
      } else {
        const creds = state.dhis2Credentials();
        const dhis2Level = state.selectedDhis2Level();
        if (!creds || dhis2Level === null) {
          return { success: false, err: "DHIS2 credentials or level not found" };
        }

        const res = await serverActions.dhis2SaveGeoJsonMap({
          ...creds,
          dhis2Level,
          adminAreaLevel,
          areaMatchProp: state.selectedProp(),
          areaMapping: mapping,
        });

        if (res.success) {
          state.close(undefined);
        }
        return res;
      }
    },
    () => {},
  );

  const dhis2LevelName = createMemo(() => {
    const level = state.selectedDhis2Level();
    if (level === null) return "";
    const found = state.dhis2Levels().find((l) => l.level === level);
    return found ? found.name : `Level ${level}`;
  });

  return (
    <div class="ui-spy">
      <div class="ui-spy-sm">
        <div class="font-600">{t3({ en: "Step 4: Confirm and save", fr: "Étape 4 : Confirmer et enregistrer" })}</div>
      </div>

      <div class="text-base-500 ui-spy-sm text-sm">
        <Show when={state.source() === "file"}>
          <div>{t3({ en: "Source", fr: "Source" })}: {state.selectedFileName()}</div>
        </Show>
        <Show when={state.source() === "dhis2"}>
          <div>{t3({ en: "Source", fr: "Source" })}: DHIS2 ({state.dhis2Credentials()?.url})</div>
          <div>{t3({ en: "DHIS2 level", fr: "Niveau DHIS2" })}: {dhis2LevelName()}</div>
        </Show>
        <div>{t3({ en: "Admin area level", fr: "Niveau administratif" })}: AA{state.adminAreaLevel()}</div>
        <div>{t3({ en: "Match property", fr: "Propriété de correspondance" })}: {state.selectedProp()}</div>
        <div>{t3({ en: "Mapped features", fr: "Entités mappées" })}: {mappedCount()}/{geoJsonValues().length}</div>
        <Show when={unmappedCount() > 0}>
          <div class="text-warning">
            {unmappedCount()} {t3({ en: "features will be kept unmapped (they can be mapped later)", fr: "entités resteront non mappées (elles pourront être mappées plus tard)" })}
          </div>
        </Show>
      </div>

      <Show when={duplicateNames().length > 0}>
        <div class="bg-warning/10 border-warning text-warning rounded border p-3 text-sm">
          <div class="font-600 mb-1">
            {t3({ en: "Warning: Duplicate admin area names", fr: "Attention : Noms de zones administratives en double" })}
          </div>
          <div>
            {t3({
              en: `${duplicateNames().length} admin areas share the same name (in different parent regions). Map visualizations may show incorrect data for these areas:`,
              fr: `${duplicateNames().length} zones administratives partagent le même nom (dans des régions parentes différentes). Les visualisations de cartes peuvent afficher des données incorrectes pour ces zones :`,
            })}
          </div>
          <div class="mt-1 font-mono text-xs">
            {duplicateNames().slice(0, 5).join(", ")}
            {duplicateNames().length > 5 ? `, +${duplicateNames().length - 5} more` : ""}
          </div>
        </div>
      </Show>

      <StateHolderFormError state={saveAction.state()} />

      <div class="ui-gap-sm flex">
        <Button
          onClick={saveAction.click}
          state={saveAction.state()}
          intent="success"
        >
          {t3({ en: "Save", fr: "Enregistrer" })}
        </Button>
        <Button intent="neutral" onClick={() => state.setStep(3)}>
          {t3({ en: "Back", fr: "Retour" })}
        </Button>
      </div>
    </div>
  );
}
