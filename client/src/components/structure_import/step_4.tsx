import {
  t3,
  type StructureStagingResult,
  type StructureIntegrateStrategy,
  type StructureIntegrateSummary,
  type InstanceConfigFacilityColumns,
  type FacilityFamily,
} from "lib";
import {
  Button,
  RadioGroup,
  StateHolderFormError,
  createFormAction,
  toNum0,
} from "panther";
import { createSignal, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { getStructureColumnLabel } from "./_column_labels";

type Props = {
  step3Result: StructureStagingResult;
  family: FacilityFamily;
  facilityColumns: InstanceConfigFacilityColumns;
  close: () => void;
  silentRefresUploadAttempt: () => Promise<void>;
  silentRefreshInstance: () => Promise<void>;
};

type IntentType = StructureIntegrateStrategy["type"];

export function Step4(p: Props) {
  // No default: the user must explicitly choose. The path of least resistance
  // must not be a destructive insert.
  const [strategyType, setStrategyType] = createSignal<IntentType | undefined>(
    undefined
  );
  // Set on success so we can confirm what actually happened instead of closing.
  const [importSummary, setImportSummary] = createSignal<
    StructureIntegrateSummary | undefined
  >(undefined);

  const strategyOptions: { value: IntentType; label: string }[] = [
    {
      value: "replace_all",
      label: t3({
        en: "Replace all existing facilities (DANGEROUS)",
        fr: "Remplacer tous les établissements existants (DANGEREUX)",
        pt: "Substituir todos os estabelecimentos existentes (PERIGOSO)",
      }),
    },
    {
      value: "add_and_update",
      label: t3({
        en: "Add new facilities and update existing ones",
        fr: "Ajouter les nouveaux établissements et mettre à jour les existants",
        pt: "Adicionar novos estabelecimentos e atualizar os existentes",
      }),
    },
    {
      value: "update_existing_only",
      label: t3({
        en: "Update existing facilities only (reject unknown IDs)",
        fr: "Mettre à jour uniquement les établissements existants (rejeter les identifiants inconnus)",
        pt: "Atualizar apenas os estabelecimentos existentes (rejeitar identificadores desconhecidos)",
      }),
    },
  ];

  function intentHelp(t: IntentType): string {
    switch (t) {
      case "replace_all":
        return t3({
          en: "Delete every facility currently in this list, then add all facilities from your file.",
          fr: "Supprimer tous les établissements actuels de cette liste, puis ajouter tous ceux de votre fichier.",
          pt: "Eliminar todos os estabelecimentos atuais desta lista e adicionar todos os do seu ficheiro.",
        });
      case "add_and_update":
        return t3({
          en: "New IDs are added. Existing IDs are updated with the columns you mapped — existing values are overwritten.",
          fr: "Les identifiants nouveaux sont ajoutés. Les identifiants existants sont mis à jour avec les colonnes associées — les valeurs existantes sont remplacées.",
          pt: "Os identificadores novos são adicionados. Os existentes são atualizados com as colunas que associou — os valores existentes são substituídos.",
        });
      case "update_existing_only":
        return t3({
          en: "Only facilities already in the list are updated. If your file contains any ID that isn't in the list, the import is rejected and nothing changes.",
          fr: "Seuls les établissements déjà présents sont mis à jour. Si votre fichier contient un identifiant absent de la liste, l'importation est rejetée et rien n'est modifié.",
          pt: "Apenas os estabelecimentos já presentes são atualizados. Se o seu ficheiro contiver um identificador que não esteja na lista, a importação é rejeitada e nada é alterado.",
        });
    }
  }

  const isInsertIntent = () => {
    const t = strategyType();
    return t === "replace_all" || t === "add_and_update";
  };

  // Insert intents need admin areas to place new facilities.
  const adminMissingForInsert = () =>
    isInsertIntent() && p.step3Result.stagedAdminAreas === false;

  // The consequence line is alarming when the outcome is destructive or signals
  // a likely ID-system mismatch (the Ghana failure).
  const consequenceIsDanger = () => {
    const t = strategyType();
    const m = p.step3Result.facilityMatch;
    if (t === "replace_all") return true;
    if (t === "update_existing_only") return (m?.newCount ?? 0) > 0;
    if (t === "add_and_update") return m?.existing === 0;
    return false;
  };

  function consequenceText(): string | undefined {
    const m = p.step3Result.facilityMatch;
    const t = strategyType();
    if (!t || !m) return undefined;
    const existing = toNum0(m.existing);
    const total = toNum0(m.totalStaged);
    const newCount = toNum0(m.newCount);
    if (t === "replace_all") {
      return t3({
        en: `All existing facilities in this registry will be deleted and replaced with the ${total} facilities in your file.`,
        fr: `Tous les établissements existants de ce registre seront supprimés et remplacés par les ${total} établissements de votre fichier.`,
        pt: `Todos os estabelecimentos existentes deste registo serão eliminados e substituídos pelos ${total} estabelecimentos do seu ficheiro.`,
      });
    }
    if (t === "add_and_update") {
      if (m.existing === 0) {
        return t3({
          en: `None of the ${total} facilities in your file match an existing facility, so all of them would be added as NEW facilities. If you meant to update existing facilities, the facility ID column is probably mapped to the wrong column, or you picked the wrong dataset (HMIS vs HFA).`,
          fr: `Aucun des ${total} établissements de votre fichier ne correspond à un établissement existant ; ils seraient donc tous ajoutés comme NOUVEAUX établissements. Si vous vouliez mettre à jour des établissements existants, la colonne d'identifiant est probablement mal associée, ou vous avez choisi le mauvais jeu de données (SNIS ou FOSA).`,
          pt: `Nenhum dos ${total} estabelecimentos do seu ficheiro corresponde a um estabelecimento existente, pelo que seriam todos adicionados como NOVOS estabelecimentos. Se pretendia atualizar estabelecimentos existentes, a coluna do identificador está provavelmente mal associada, ou escolheu o conjunto de dados errado (SNIS ou FOSA).`,
        });
      }
      return t3({
        en: `${existing} existing facilities will be updated, and ${newCount} new facilities will be added.`,
        fr: `${existing} établissements existants seront mis à jour, et ${newCount} nouveaux établissements seront ajoutés.`,
        pt: `${existing} estabelecimentos existentes serão atualizados, e ${newCount} novos estabelecimentos serão adicionados.`,
      });
    }
    // update_existing_only
    if (m.newCount > 0) {
      return t3({
        en: `${newCount} of ${total} facilities in your file do not match an existing facility — this import will be rejected. Check the facility ID column and the dataset (HMIS vs HFA).`,
        fr: `${newCount} sur ${total} établissements de votre fichier ne correspondent à aucun établissement existant — l'importation sera rejetée. Vérifiez la colonne d'identifiant et le jeu de données (SNIS ou FOSA).`,
        pt: `${newCount} de ${total} estabelecimentos do seu ficheiro não correspondem a nenhum estabelecimento existente — a importação será rejeitada. Verifique a coluna do identificador e o conjunto de dados (SNIS ou FOSA).`,
      });
    }
    return t3({
      en: `${existing} existing facilities will be updated.`,
      fr: `${existing} établissements existants seront mis à jour.`,
      pt: `${existing} estabelecimentos existentes serão atualizados.`,
    });
  }

  function columnsNotice(intent: IntentType): string {
    const cols = (p.step3Result.stagedOptionalColumns ?? []).map((c) =>
      getStructureColumnLabel(c, p.facilityColumns)
    );
    if (p.step3Result.stagedAdminAreas) {
      cols.unshift(
        t3({
          en: "administrative areas",
          fr: "unités administratives",
          pt: "zonas administrativas",
        })
      );
    }
    if (cols.length === 0) {
      return t3({
        en: "Only the facility ID is mapped — no other columns will be written.",
        fr: "Seul l'identifiant d'établissement est associé — aucune autre colonne ne sera écrite.",
        pt: "Apenas o identificador do estabelecimento está associado — nenhuma outra coluna será escrita.",
      });
    }
    if (intent === "replace_all") {
      return t3({
        en: `These columns will be written on the new facilities: ${cols.join(", ")}. Columns you did not map will be empty in the new registry.`,
        fr: `Ces colonnes seront écrites sur les nouveaux établissements : ${cols.join(", ")}. Les colonnes non associées seront vides dans le nouveau registre.`,
        pt: `Estas colunas serão escritas nos novos estabelecimentos: ${cols.join(", ")}. As colunas que não associou ficarão vazias no novo registo.`,
      });
    }
    return t3({
      en: `These columns will be written on matched facilities: ${cols.join(", ")}. Columns you did not map are left unchanged.`,
      fr: `Ces colonnes seront écrites sur les établissements correspondants : ${cols.join(", ")}. Les colonnes non associées restent inchangées.`,
      pt: `Estas colunas serão escritas nos estabelecimentos correspondentes: ${cols.join(", ")}. As colunas que não associou permanecem inalteradas.`,
    });
  }

  const executeImport = createFormAction(
    async () => {
      const t = strategyType();
      if (!t) {
        return {
          success: false,
          err: t3({
            en: "Choose an import mode to continue.",
            fr: "Choisissez un mode d'importation pour continuer.",
            pt: "Escolha um modo de importação para continuar.",
          }),
        };
      }
      const res = await serverActions.structureStep4_ImportData({
        family: p.family,
        strategy: { type: t },
      });
      if (res.success === false) {
        await p.silentRefresUploadAttempt();
      }
      return res;
    },
    async (data: StructureIntegrateSummary) => {
      setImportSummary(data);
      await p.silentRefreshInstance();
    }
  );

  return (
    <Switch>
      <Match when={importSummary()} keyed>
        {(summary) => (
          <div class="ui-spy ui-pad">
            <div class="font-700 text-success text-lg">
              {t3({ en: "Import complete", fr: "Importation terminée", pt: "Importação concluída" })}
            </div>
            <div class="ui-pad bg-base-200 ui-spy-sm rounded">
              <div class="flex justify-between">
                <span class="text-base-content">
                  {t3({ en: "Facilities added:", fr: "Établissements ajoutés :", pt: "Estabelecimentos adicionados:" })}
                </span>
                <span class="font-700 font-mono">{toNum0(summary.inserted)}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-base-content">
                  {t3({ en: "Facilities updated:", fr: "Établissements mis à jour :", pt: "Estabelecimentos atualizados:" })}
                </span>
                <span class="font-700 font-mono">{toNum0(summary.updated)}</span>
              </div>
              <Show when={summary.deleted > 0}>
                <div class="flex justify-between">
                  <span class="text-base-content">
                    {t3({ en: "Facilities deleted:", fr: "Établissements supprimés :", pt: "Estabelecimentos eliminados:" })}
                  </span>
                  <span class="text-danger font-700 font-mono">
                    {toNum0(summary.deleted)}
                  </span>
                </div>
              </Show>
            </div>
            <div>
              <Button onClick={() => p.close()} intent="primary" iconName="check">
                {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
              </Button>
            </div>
          </div>
        )}
      </Match>
      <Match when={true}>
        <div class="ui-spy ui-pad">
          <div class="ui-spy">
            <div class="font-700 text-lg">
              {t3({ en: "Staging Complete", fr: "Préparation terminée", pt: "Preparação concluída" })}
            </div>

            {/* Facilities + match preview */}
            <div class="ui-pad bg-base-200 rounded">
              <div class="font-700 mb-3">
                {t3({ en: "Health Facilities", fr: "Établissements de santé", pt: "Estabelecimentos de saúde" })}
              </div>
              <div class="flex justify-between">
                <span class="text-base-content">
                  {t3({ en: "Facilities in your file:", fr: "Établissements dans votre fichier :", pt: "Estabelecimentos no seu ficheiro:" })}
                </span>
                <span class="font-700 font-mono">
                  {toNum0(p.step3Result.facilitiesPreview)}
                </span>
              </div>
              <Show when={p.step3Result.facilityMatch} keyed>
                {(m) => (
                  <div class="ui-spy-sm mt-2">
                    <div class="flex justify-between">
                      <span class="text-base-content">
                        {t3({ en: "Already exist in the backbone:", fr: "Déjà présents dans la structure :", pt: "Já existem na estrutura:" })}
                      </span>
                      <span
                        class="font-mono font-700"
                        classList={{ "text-danger": m.existing === 0 }}
                      >
                        {toNum0(m.existing)}
                      </span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-base-content">
                        {t3({ en: "New (not in the backbone):", fr: "Nouveaux (absents de la structure) :", pt: "Novos (ausentes da estrutura):" })}
                      </span>
                      <span class="font-mono">{toNum0(m.newCount)}</span>
                    </div>
                    <Show when={m.existing === 0}>
                      <div class="text-danger text-sm">
                        {t3({
                          en: "None of these facilities exist in the backbone yet. If you meant to update existing facilities, the facility ID column is probably mapped to the wrong column, or you picked the wrong dataset (HMIS vs HFA).",
                          fr: "Aucun de ces établissements n'existe encore dans la structure. Si vous vouliez mettre à jour des établissements existants, la colonne d'identifiant est probablement mal associée, ou vous avez choisi le mauvais jeu de données (SNIS ou FOSA).",
                          pt: "Nenhum destes estabelecimentos existe ainda na estrutura. Se pretendia atualizar estabelecimentos existentes, a coluna do identificador está provavelmente mal associada, ou escolheu o conjunto de dados errado (SNIS ou FOSA).",
                        })}
                      </div>
                    </Show>
                  </div>
                )}
              </Show>
            </div>

            {/* Integration Strategy Selection */}
            <div class="ui-pad bg-base-200 rounded">
              <div class="font-700 mb-3">
                {t3({ en: "What should this import do?", fr: "Que doit faire cette importation ?", pt: "O que deve fazer esta importação?" })}
              </div>
              <RadioGroup
                value={strategyType()}
                options={strategyOptions}
                onChange={(v) => setStrategyType(v)}
                label=""
              />

              <Show when={strategyType()} keyed>
                {(t) => (
                  <div class="ui-spy-sm bg-base-100 mt-4 rounded border p-4">
                    <div class="text-base-content text-sm">{intentHelp(t)}</div>
                    <Show when={consequenceText()} keyed>
                      {(text) => (
                        <div
                          class="font-700 text-sm"
                          classList={{ "text-danger": consequenceIsDanger() }}
                        >
                          {text}
                        </div>
                      )}
                    </Show>
                    <div class="text-base-content text-sm">{columnsNotice(t)}</div>
                  </div>
                )}
              </Show>
            </div>
          </div>

          <StateHolderFormError state={executeImport.state()} />
          <div class="ui-gap-sm flex">
            <Switch>
              <Match when={p.step3Result.totalRowsStaged > 0}>
                <div class="ui-spy border-primary bg-primary/10 w-full rounded border p-4">
                  <Show
                    when={!adminMissingForInsert()}
                    fallback={
                      <div class="text-danger text-sm">
                        {t3({
                          en: "This mode adds facilities, which needs administrative areas. Go back and map the admin area columns, or choose “Update existing facilities only”.",
                          fr: "Ce mode ajoute des établissements, ce qui nécessite des unités administratives. Revenez en arrière et associez les colonnes d'unités administratives, ou choisissez « Mettre à jour uniquement les établissements existants ».",
                          pt: "Este modo adiciona estabelecimentos, o que exige zonas administrativas. Volte atrás e associe as colunas de zonas administrativas, ou escolha «Atualizar apenas os estabelecimentos existentes».",
                        })}
                      </div>
                    }
                  >
                    <div class="text-primary text-sm">
                      {t3({
                        en: "Review the summary above, then finalize the import.",
                        fr: "Vérifiez le résumé ci-dessus, puis finalisez l'importation.",
                        pt: "Reveja o resumo acima e, em seguida, finalize a importação.",
                      })}
                    </div>
                  </Show>
                  <div>
                    <Button
                      onClick={executeImport.click}
                      intent="success"
                      state={executeImport.state()}
                      iconName="save"
                      disabled={!strategyType() || adminMissingForInsert()}
                    >
                      {t3({ en: "Finalize and integrate", fr: "Finaliser et intégrer", pt: "Finalizar e integrar" })}
                    </Button>
                  </div>
                </div>
              </Match>
              <Match when={true}>
                <div class="border-danger bg-danger/10 rounded border p-4">
                  <div class="text-danger text-sm">
                    {t3({
                      en: "There are no rows to import. Either go back and edit this upload config, or delete the upload attempt.",
                      fr: "Il n'y a aucune ligne à importer. Revenez en arrière pour modifier la configuration ou supprimez la tentative de téléversement.",
                      pt: "Não há linhas para importar. Volte atrás para editar a configuração ou elimine a tentativa de importação.",
                    })}
                  </div>
                </div>
              </Match>
            </Switch>
          </div>
        </div>
      </Match>
    </Switch>
  );
}
