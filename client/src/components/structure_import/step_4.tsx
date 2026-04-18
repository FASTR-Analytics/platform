import {
  t3,
  TC,
  type StructureStagingResult,
  type StructureIntegrateStrategy,
  type SelectableColumn,
} from "lib";
import {
  Button,
  MultiSelect,
  RadioGroup,
  StateHolderFormError,
  timActionForm,
  toNum0,
} from "panther";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/disaggregation_label";

type Props = {
  step3Result: StructureStagingResult;
  close: () => void;
  silentRefresUploadAttempt: () => Promise<void>;
  silentRefreshInstance: () => Promise<void>;
};

export function Step4(p: Props) {
  const [strategyType, setStrategyType] = createSignal<
    StructureIntegrateStrategy["type"]
  >("add_all_and_update_all_as_needed");
  const [selectedColumns, setSelectedColumns] = createSignal<
    SelectableColumn[]
  >([]);

  const strategyOptions = [
    {
      value: "first_delete_all_then_add_all" as const,
      label: t3({ en: "Replace all existing facilities and admin areas with these (i.e. delete and then add)", fr: "Remplacer toutes les formations sanitaires et unités administratives existantes (supprimer puis ajouter)" }),
    },
    {
      value: "add_all_and_update_all_as_needed" as const,
      label: t3({ en: "Add new facilities and update existing ones as needed", fr: "Ajouter de nouvelles formations sanitaires et mettre à jour celles existantes si nécessaire" }),
    },
    {
      value: "add_all_new_rows_and_ignore_conflicts" as const,
      label: t3({ en: "Add new facilities only, ignore conflicts", fr: "Ajouter uniquement les nouvelles formations sanitaires, ignorer les conflits" }),
    },
    {
      value: "add_all_new_rows_and_error_if_any_conflicts" as const,
      label: t3({ en: "Add new facilities only, error if any facilities already exists", fr: "Ajouter uniquement les nouvelles formations sanitaires, erreur si des formations existent déjà" }),
    },
    {
      value:
        "only_update_optional_facility_cols_by_existing_facility_id" as const,
      label: t3({ en: "Only update optional facility columns by existing facility ID", fr: "Mettre à jour uniquement les colonnes facultatives par identifiant de formation existant" }),
    },
    {
      value: "only_update_selected_cols_by_existing_facility_id" as const,
      label: t3({ en: "Update selected columns only by existing facility ID", fr: "Mettre à jour uniquement les colonnes sélectionnées par identifiant de formation existant" }),
    },
  ];

  const columnOptions: { value: SelectableColumn; label: string }[] = [
    { value: "all_admin_areas", label: t3({ en: "All Admin Areas", fr: "Toutes les unités administratives" }) },
    { value: "facility_name", label: t3({ en: "Facility Name", fr: "Nom de la formation sanitaire" }) },
    { value: "facility_type", label: t3({ en: "Facility Type", fr: "Type de formation sanitaire" }) },
    { value: "facility_ownership", label: t3({ en: "Facility Ownership", fr: "Propriété de la formation sanitaire" }) },
    { value: "facility_custom_1", label: t3({ en: "Facility Custom 1", fr: "Formation sanitaire personnalisé 1" }) },
    { value: "facility_custom_2", label: t3({ en: "Facility Custom 2", fr: "Formation sanitaire personnalisé 2" }) },
    { value: "facility_custom_3", label: t3({ en: "Facility Custom 3", fr: "Formation sanitaire personnalisé 3" }) },
    { value: "facility_custom_4", label: t3({ en: "Facility Custom 4", fr: "Formation sanitaire personnalisé 4" }) },
    { value: "facility_custom_5", label: t3({ en: "Facility Custom 5", fr: "Formation sanitaire personnalisé 5" }) },
  ];

  const executeImport = timActionForm(
    async () => {
      const currentStrategy = strategyType();
      let finalStrategy: StructureIntegrateStrategy;

      if (
        currentStrategy === "only_update_selected_cols_by_existing_facility_id"
      ) {
        finalStrategy = {
          type: "only_update_selected_cols_by_existing_facility_id",
          selectedColumns: selectedColumns(),
        };
      } else {
        finalStrategy = { type: currentStrategy };
      }

      const res = await serverActions.structureStep4_ImportData({
        strategy: finalStrategy,
      });
      if (res.success === false) {
        await p.silentRefresUploadAttempt();
      }
      return res;
    },
    p.silentRefreshInstance,
    p.close,
  );

  return (
    <div class="ui-spy ui-pad">
      <div class="ui-spy">
        <div class="font-700 text-lg">{t3({ en: "Staging Complete", fr: "Préparation terminée" })}</div>

        {/* Summary Section */}
        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t3({ en: "Import Summary", fr: "Résumé de l'importation" })}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">{t3({ en: "Staging table:", fr: "Table de préparation :" })}</span>
              <span class="font-mono">{p.step3Result.stagingTableName}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t3({ en: "Import date:", fr: "Date d'importation :" })}</span>
              <span class="font-mono">{new Date().toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Import Statistics */}
        {/* <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t("Import Statistics")}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">{t("Total rows staged:")}</span>
              <span class="font-700 text-success font-mono">
                {toNum0(p.step3Result.totalRowsStaged)}
              </span>
            </div>
            <Show when={p.step3Result.invalidRowsSkipped > 0}>
              <div class="flex justify-between">
                <span class="text-base-content">
                  {t("Invalid rows skipped:")}
                </span>
                <span class="text-danger font-mono">
                  {toNum0(p.step3Result.invalidRowsSkipped)}
                </span>
              </div>
            </Show>
          </div>
        </div> */}

        {/* Admin Areas Breakdown */}
        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t3({ en: "Administrative Areas", fr: "Unités administratives" })}</div>
          <div class="ui-spy-sm">
            <div class="flex justify-between">
              <span class="text-base-content">{t3(getAdminAreaLabel(1))}:</span>
              <span class="font-mono">
                {toNum0(p.step3Result.adminAreasPreview.level1)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t3(getAdminAreaLabel(2))}:</span>
              <span class="font-mono">
                {toNum0(p.step3Result.adminAreasPreview.level2)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t3(getAdminAreaLabel(3))}:</span>
              <span class="font-mono">
                {toNum0(p.step3Result.adminAreasPreview.level3)}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-base-content">{t3(getAdminAreaLabel(4))}:</span>
              <span class="font-mono">
                {toNum0(p.step3Result.adminAreasPreview.level4)}
              </span>
            </div>
          </div>
        </div>

        {/* Facilities */}
        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t3({ en: "Health Facilities", fr: "Formations sanitaires" })}</div>
          <div class="flex justify-between">
            <span class="text-base-content">{t3({ en: "Total facilities:", fr: "Total des formations sanitaires :" })}</span>
            <span class="font-700 font-mono">
              {toNum0(p.step3Result.facilitiesPreview)}
            </span>
          </div>
        </div>

        {/* Validation Warnings */}
        <Show
          when={
            p.step3Result.validationWarnings &&
            p.step3Result.validationWarnings.length > 0
          }
        >
          <div class="ui-pad border-danger bg-base-200 rounded">
            <div class="font-700 text-danger mb-3">
              {t3({ en: "Validation Warnings", fr: "Avertissements de validation" })}
            </div>
            <div class="ui-spy-sm">
              <For each={p.step3Result.validationWarnings}>
                {(warning) => (
                  <div class="text-danger text-sm">• {warning}</div>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Integration Strategy Selection */}
        <div class="ui-pad bg-base-200 rounded">
          <div class="font-700 mb-3">{t3({ en: "Integration Strategy", fr: "Stratégie d'intégration" })}</div>
          <div class="text-base-content mb-4 text-sm">
            {t3({ en: "Choose how to handle the integration of the staged data into your existing structure:", fr: "Choisissez comment intégrer les données préparées dans votre structure existante :" })}
          </div>
          <RadioGroup
            value={strategyType()}
            options={strategyOptions}
            onChange={(v) => {
              setStrategyType(v as StructureIntegrateStrategy["type"]);
              if (v !== "only_update_selected_cols_by_existing_facility_id") {
                setSelectedColumns([]);
              }
            }}
            label=""
          />

          {/* Column Selection for Selective Update Strategy */}
          <Show
            when={
              strategyType() ===
              "only_update_selected_cols_by_existing_facility_id"
            }
          >
            <div class="ui-pad bg-base-100 mt-4 rounded border">
              <div class="font-700 mb-3">{t3({ en: "Select Columns to Update", fr: "Sélectionner les colonnes à mettre à jour" })}</div>
              <div class="text-base-content mb-4 text-sm">
                {t3({ en: "Choose which columns to update for existing facilities:", fr: "Choisissez les colonnes à mettre à jour pour les formations existantes :" })}
              </div>
              <MultiSelect
                values={selectedColumns()}
                options={columnOptions}
                onChange={setSelectedColumns}
                label={t3(TC.columns)}
                showSelectAll={true}
              />
            </div>
          </Show>
        </div>
      </div>

      <StateHolderFormError state={executeImport.state()} />
      <div class="ui-gap-sm flex">
        <Switch>
          <Match when={p.step3Result.totalRowsStaged > 0}>
            <div class="ui-spy border-primary bg-primary/10 rounded border p-4">
              <div class="text-primary text-sm">
                {t3({ en: "Review the staging results above. Click 'Finalize and integrate' to complete the import process and update the structure data.", fr: "Vérifiez les résultats de la préparation ci-dessus. Cliquez sur « Finaliser et intégrer » pour terminer le processus d'importation et mettre à jour les données de structure." })}
              </div>
              <div>
                <Button
                  onClick={executeImport.click}
                  intent="success"
                  state={executeImport.state()}
                  iconName="save"
                >
                  {t3({ en: "Finalize and integrate", fr: "Finaliser et intégrer" })}
                </Button>
              </div>
            </div>
          </Match>
          <Match when={true}>
            <div class="border-danger bg-danger/10 rounded border p-4">
              <div class="text-danger text-sm">
                {t3({ en: "There are no rows to import. Either go back and edit this upload config, or delete the upload attempt.", fr: "Il n'y a aucune ligne à importer. Revenez en arrière pour modifier la configuration ou supprimez la tentative de téléversement." })}
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
