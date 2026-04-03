import { createSignal } from "solid-js";
import { t3, type StructureDhis2OrgUnitSelection } from "lib";
import {
  Button,
  StateHolderFormError,
  StateHolderWrapper,
  Table,
  timActionForm,
  timQuery,
  toNum0,
} from "panther";
import { serverActions } from "~/server_actions";

type Props = {
  step2Result: StructureDhis2OrgUnitSelection | undefined;
  silentFetch: () => Promise<void>;
};

export function Step2_Dhis2(p: Props) {
  const [selectedLevels, setSelectedLevels] = createSignal<Set<any>>(
    new Set(p.step2Result?.selectedLevels?.map(String) ?? []),
  );
  const [needsSaving, setNeedsSaving] = createSignal<boolean>(!p.step2Result);

  // Get organization unit metadata from DHIS2 cache
  const orgUnitMetadata = timQuery(
    () => serverActions.structureStep2Dhis2_GetOrgUnitsMetadata({}),
    t3({ en: "Loading organization units...", fr: "Chargement des unités organisationnelles..." }),
  );

  function updateSelection() {
    setNeedsSaving(true);
  }

  const save = timActionForm(async () => {
    const selection: StructureDhis2OrgUnitSelection = {
      selectedLevels: Array.from(selectedLevels()).map(Number),
    };

    if (selection.selectedLevels.length === 0) {
      return {
        success: false,
        err: t3({ en: "Please select at least one level", fr: "Veuillez sélectionner au moins un niveau" }),
      };
    }

    return serverActions.structureStep2Dhis2_SetOrgUnitSelection(selection);
  }, p.silentFetch);

  return (
    <div class="ui-pad ui-spy">
      <div class="ui-spy-sm">
        <div class="font-700 pb-4 text-lg">
          {t3({ en: "Select Organization Unit Levels to Import", fr: "Sélectionner les niveaux d'unités organisationnelles à importer" })}
        </div>

        <StateHolderWrapper state={orgUnitMetadata.state()} noPad>
          {(metadata) => {
            return (
              <div class="ui-spy">
                {/* <div class="bg-base-200 border-base-300 ui-pad rounded border"> */}
                {/* <div class="mb-4"> */}
                {/* <div class="font-700 mb-2 text-sm">
                      {t("Organization Unit Levels")}
                    </div>
                    <div class="text-base-content/70 mb-2 text-xs">
                      {t("Select which levels to import")}
                    </div> */}
                <Table
                  data={metadata.levels.sort((a, b) => a.level - b.level)}
                  columns={[
                    {
                      header: t3({ en: "Level Name", fr: "Nom du niveau" }),
                      key: "displayName",
                      render: (level) => level.displayName || level.name,
                    },
                    {
                      header: t3({ en: "Level", fr: "Niveau" }),
                      key: "level",
                      render: (level) => String(level.level),
                    },
                    {
                      header: t3({ en: "Units", fr: "Unités" }),
                      key: "count",
                      render: (level) => toNum0(level.count),
                    },
                  ]}
                  keyField="level"
                  selectedKeys={() => selectedLevels()}
                  setSelectedKeys={(keys) => {
                    setSelectedLevels(keys);
                    updateSelection();
                  }}
                />
                {/* </div> */}
                {/* </div> */}

                <div class="border-base-300 rounded border p-3 text-sm">
                  <div class="ui-spy-sm">
                    <div class="text-base-content">
                      <strong>{t3({ en: "Selection Summary", fr: "Résumé de la sélection" })}:</strong>
                    </div>
                    <div class="text-base-content/80">
                      {selectedLevels().size} {t3({ en: "levels selected", fr: "niveaux sélectionnés" })}
                    </div>
                    {/* <div class="text-base-content/60 mt-2 text-xs">
                      {t("Total organization units available")}:{" "}
                      {metadata.levels
                        .reduce((sum, level) => sum + level.count, 0)
                        .toLocaleString()}
                    </div> */}
                  </div>
                </div>
              </div>
            );
          }}
        </StateHolderWrapper>
      </div>

      <StateHolderFormError state={save.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={save.click}
          intent="success"
          state={save.state()}
          disabled={!needsSaving() || selectedLevels().size === 0}
          iconName="save"
        >
          {t3({ en: "Save selection", fr: "Sauvegarder la sélection" })}
        </Button>
      </div>
    </div>
  );
}
