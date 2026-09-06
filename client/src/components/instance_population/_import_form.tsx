import {
  t3,
  type PopulationImportPreview,
  type PopulationImportPreviewType,
  type PopulationImportResult,
  type PopulationYearCoverage,
} from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  StateHolderFormError,
  Table,
  createFormAction,
  toNum0,
  type TableColumn,
} from "panther";
import { For, Match, Show, Switch, batch, createSignal } from "solid-js";
import { FileUploadSelector } from "~/components/_file_upload_selector";
import { serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { instanceState } from "~/state/instance/t1_store";

type Step = "select" | "preview" | "done";

// Fixed-column CSV import in three steps: pick a file, check it (the server
// previews the store after the upsert, without writing), then import. An
// import that leaves a touched type incomplete needs the explicit "Import
// anyway", which the server enforces too.
export function PopulationImportForm(p: { close: (p: unknown) => void }) {
  const [fileName, setFileName] = createSignal("");
  const [step, setStep] = createSignal<Step>("select");
  const [preview, setPreview] = createSignal<PopulationImportPreview | undefined>(
    undefined,
  );
  const [result, setResult] = createSignal<PopulationImportResult | undefined>(
    undefined,
  );

  const checkFile = createFormAction(async () => {
    if (!fileName()) {
      return {
        success: false,
        err: t3({
          en: "Select a file",
          fr: "Sélectionnez un fichier",
          pt: "Selecione um ficheiro",
        }),
      };
    }
    const res = await serverActions.previewPopulationCsv({
      assetFileName: fileName(),
    });
    if (res.success) {
      batch(() => {
        setPreview(res.data);
        setStep("preview");
      });
    }
    return res;
  });

  const runImport = createFormAction(async () => {
    const checked = preview();
    if (checked === undefined) {
      return {
        success: false,
        err: t3({
          en: "Check the file first",
          fr: "Vérifiez d'abord le fichier",
          pt: "Verifique primeiro o ficheiro",
        }),
      };
    }
    const res = await serverActions.importPopulationCsv({
      assetFileName: fileName(),
      confirmIncomplete: !checked.complete,
    });
    batch(() => {
      if (res.success) {
        setResult(res.data);
        setStep("done");
      } else {
        setPreview(undefined);
        setStep("select");
      }
    });
    return res;
  });

  function backToSelect() {
    batch(() => {
      setPreview(undefined);
      setStep("select");
    });
  }

  function importAnother() {
    batch(() => {
      setResult(undefined);
      setPreview(undefined);
      setFileName("");
      setStep("select");
    });
  }

  const typeIds = () => instanceState.populationTypes.map((t) => t.id);
  const levelLabel = (level: 2 | 3 | 4) => t3(getAdminAreaLabel(level));

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          heading={t3({
            en: "Import population data",
            fr: "Importer des données de population",
            pt: "Importar dados de população",
          })}
        />
      }
    >
      <div class="ui-pad ui-spy max-w-3xl">
        <Switch>
          <Match when={step() === "done" && result()} keyed>
            {(r) => (
              <div class="ui-spy">
                <div class="text-success font-700">
                  {t3({
                    en: `Imported ${toNum0(r.rowsImported)} values at ${levelLabel(r.populationLevel)} (${r.populationTypes.join(", ")}; ${r.firstYear}–${r.lastYear})`,
                    fr: `${toNum0(r.rowsImported)} valeurs importées au niveau ${levelLabel(r.populationLevel)} (${r.populationTypes.join(", ")} ; ${r.firstYear}–${r.lastYear})`,
                    pt: `${toNum0(r.rowsImported)} valores importados ao nível ${levelLabel(r.populationLevel)} (${r.populationTypes.join(", ")}; ${r.firstYear}–${r.lastYear})`,
                  })}
                </div>
                <div class="ui-gap-sm flex">
                  <Button onClick={() => p.close(undefined)} intent="success">
                    {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
                  </Button>
                  <Button onClick={importAnother} iconName="upload">
                    {t3({
                      en: "Import another file",
                      fr: "Importer un autre fichier",
                      pt: "Importar outro ficheiro",
                    })}
                  </Button>
                </div>
              </div>
            )}
          </Match>
          <Match when={step() === "preview" && preview()} keyed>
            {(pv) => (
              <div class="ui-spy">
                <div class="ui-spy-sm text-sm">
                  <div class="font-700">
                    {t3({
                      en: `${toNum0(pv.rowsInFile)} rows at ${levelLabel(pv.populationLevel)}: ${pv.populationTypes.join(", ")}, ${pv.firstYear}–${pv.lastYear}`,
                      fr: `${toNum0(pv.rowsInFile)} lignes au niveau ${levelLabel(pv.populationLevel)} : ${pv.populationTypes.join(", ")}, ${pv.firstYear}–${pv.lastYear}`,
                      pt: `${toNum0(pv.rowsInFile)} linhas ao nível ${levelLabel(pv.populationLevel)}: ${pv.populationTypes.join(", ")}, ${pv.firstYear}–${pv.lastYear}`,
                    })}
                  </div>
                  <div>
                    {t3({
                      en: `${toNum0(pv.rowsNew)} new values, ${toNum0(pv.rowsReplaced)} replacing stored values.`,
                      fr: `${toNum0(pv.rowsNew)} nouvelles valeurs, ${toNum0(pv.rowsReplaced)} remplaçant des valeurs enregistrées.`,
                      pt: `${toNum0(pv.rowsNew)} valores novos, ${toNum0(pv.rowsReplaced)} a substituir valores guardados.`,
                    })}
                  </div>
                  <Show when={instanceState.populationLevel === null}>
                    <div class="text-warning-subtle-content bg-warning-subtle ui-pad-sm rounded">
                      {t3({
                        en: `No population data is stored yet, so this import sets the population level to ${levelLabel(pv.populationLevel)}. Indicator values (M12) will then be held at that level for every indicator, with nothing below it.`,
                        fr: `Aucune donnée de population n'est encore enregistrée : cet import fixe le niveau de population à ${levelLabel(pv.populationLevel)}. Les valeurs des indicateurs (M12) seront alors tenues à ce niveau pour tous les indicateurs, sans rien en dessous.`,
                        pt: `Ainda não há dados de população guardados, por isso esta importação define o nível de população como ${levelLabel(pv.populationLevel)}. Os valores dos indicadores (M12) ficarão então a esse nível para todos os indicadores, sem nada abaixo.`,
                      })}
                    </div>
                  </Show>
                </div>
                <For each={pv.types}>
                  {(type) => <PreviewTypeCoverage type={type} />}
                </For>
                <Show
                  when={pv.complete}
                  fallback={
                    <div class="text-danger text-sm">
                      {t3({
                        en: "After this import, at least one population type would still be missing values for some areas or years. Generation needs every area at the population level covered for every population a formula uses.",
                        fr: "Après cet import, au moins un type de population manquerait encore de valeurs pour certaines unités ou années. La génération exige que chaque unité au niveau de population soit couverte pour chaque population utilisée par une formule.",
                        pt: "Após esta importação, pelo menos um tipo de população continuaria sem valores para algumas zonas ou anos. A geração exige que todas as zonas ao nível de população estejam cobertas para cada população usada numa fórmula.",
                      })}
                    </div>
                  }
                >
                  <div class="text-success text-sm">
                    {t3({
                      en: "After this import, every population type in the file is complete.",
                      fr: "Après cet import, chaque type de population du fichier est complet.",
                      pt: "Após esta importação, todos os tipos de população do ficheiro ficam completos.",
                    })}
                  </div>
                </Show>
                <StateHolderFormError state={runImport.state()} />
                <div class="ui-gap-sm flex">
                  <Button
                    onClick={runImport.click}
                    state={runImport.state()}
                    intent={pv.complete ? "success" : "danger"}
                    iconName="upload"
                  >
                    {pv.complete
                      ? t3({ en: "Import", fr: "Importer", pt: "Importar" })
                      : t3({
                        en: "Import anyway",
                        fr: "Importer quand même",
                        pt: "Importar mesmo assim",
                      })}
                  </Button>
                  <Button onClick={backToSelect} outline>
                    {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
                  </Button>
                </div>
              </div>
            )}
          </Match>
          <Match when={step() === "select"}>
            <div class="ui-spy">
              <div class="text-base-content-muted ui-spy-sm text-sm">
                <div>
                  {t3({
                    en: "One row per admin area × year × population type. Columns:",
                    fr: "Une ligne par unité administrative × année × type de population. Colonnes :",
                    pt: "Uma linha por zona administrativa × ano × tipo de população. Colunas:",
                  })}
                </div>
                <div class="font-mono">
                  admin_area_2, [admin_area_3, [admin_area_4,]] year,
                  population_type, count
                </div>
                <div>
                  {t3({
                    en: "The deepest admin_area column present is the file's level. The store holds one level: the first import sets it, and a later file must be at the same level (delete all population data to change it). Area names must match the HMIS structure exactly; an optional admin_area_1 column is checked against it. Values for a type, area and year already in the store are replaced; everything else is kept.",
                    fr: "La colonne admin_area la plus profonde présente est le niveau du fichier. Le magasin ne tient qu'un niveau : le premier import le fixe, et un fichier ultérieur doit être au même niveau (supprimez toutes les données de population pour le changer). Les noms d'unités doivent correspondre exactement à la structure SNIS ; une colonne admin_area_1 facultative est vérifiée par rapport à elle. Les valeurs déjà présentes pour un type, une unité et une année sont remplacées ; le reste est conservé.",
                    pt: "A coluna admin_area mais profunda presente é o nível do ficheiro. O armazenamento tem um só nível: a primeira importação define-o, e um ficheiro posterior tem de estar ao mesmo nível (elimine todos os dados de população para o alterar). Os nomes das zonas têm de corresponder exatamente à estrutura SNIS; uma coluna admin_area_1 opcional é verificada contra ela. Os valores já existentes para um tipo, zona e ano são substituídos; tudo o resto é mantido.",
                  })}
                </div>
                <div>
                  {t3({
                    en: "Population types:",
                    fr: "Types de population :",
                    pt: "Tipos de população:",
                  })}{" "}
                  <span class="font-mono">{typeIds().join(", ")}</span>
                </div>
              </div>
              <FileUploadSelector
                buttonLabel={t3({
                  en: "Upload CSV",
                  fr: "Téléverser un CSV",
                  pt: "Carregar um CSV",
                })}
                selectLabel={t3({
                  en: "Existing CSV file",
                  fr: "Fichier CSV existant",
                  pt: "Ficheiro CSV existente",
                })}
                filter={(a) => a.isCsv}
                value={fileName()}
                onChange={setFileName}
                fullWidth
              />
              <StateHolderFormError state={checkFile.state()} />
              <StateHolderFormError state={runImport.state()} />
              <div class="ui-gap-sm flex">
                <Button
                  onClick={checkFile.click}
                  state={checkFile.state()}
                  disabled={!fileName()}
                  intent="primary"
                  iconName="search"
                >
                  {t3({
                    en: "Check file",
                    fr: "Vérifier le fichier",
                    pt: "Verificar o ficheiro",
                  })}
                </Button>
                <Button onClick={() => p.close(undefined)} outline>
                  {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
                </Button>
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </FrameTop>
  );
}

function PreviewTypeCoverage(p: { type: PopulationImportPreviewType }) {
  const label = () =>
    instanceState.populationTypes.find((t) => t.id === p.type.populationType)
      ?.label ?? p.type.populationType;

  const columns: TableColumn<PopulationYearCoverage>[] = [
    {
      key: "year",
      header: t3({ en: "Year", fr: "Année", pt: "Ano" }),
      render: (row) => <span class="font-mono">{row.year}</span>,
    },
    {
      key: "areas",
      header: t3({
        en: "Areas with data",
        fr: "Unités avec données",
        pt: "Zonas com dados",
      }),
      alignH: "right",
      render: (row) => (
        <span
          class="font-mono"
          classList={{ "text-danger": row.missingCount > 0 }}
        >
          {toNum0(row.areasWithData)} / {toNum0(p.type.structureAreaCount)}
        </span>
      ),
    },
    {
      key: "missing",
      header: t3({
        en: "Missing areas",
        fr: "Unités manquantes",
        pt: "Zonas em falta",
      }),
      render: (row) => (
        <Show when={row.missingCount > 0}>
          <span class="text-xs">
            {row.missingAreas.join("; ")}
            <Show when={row.missingCount > row.missingAreas.length}>
              {" "}
              {t3({
                en: `and ${toNum0(row.missingCount - row.missingAreas.length)} more`,
                fr: `et ${toNum0(row.missingCount - row.missingAreas.length)} autres`,
                pt: `e mais ${toNum0(row.missingCount - row.missingAreas.length)}`,
              })}
            </Show>
          </span>
        </Show>
      ),
    },
  ];

  return (
    <div class="ui-spy-sm">
      <div class="ui-gap-sm flex items-baseline">
        <span class="font-700">{label()}</span>
        <span class="text-base-content-muted font-mono text-xs">
          {p.type.populationType}
        </span>
        <span classList={{ "text-success": p.type.complete, "text-danger": !p.type.complete }}>
          {p.type.complete
            ? t3({ en: "complete", fr: "complet", pt: "completo" })
            : t3({ en: "incomplete", fr: "incomplet", pt: "incompleto" })}
        </span>
        <Show when={p.type.staleRowCount > 0}>
          <span class="text-base-content-muted text-xs">
            {t3({
              en: `${toNum0(p.type.staleRowCount)} stored rows for areas no longer in the structure`,
              fr: `${toNum0(p.type.staleRowCount)} lignes enregistrées pour des unités absentes de la structure`,
              pt: `${toNum0(p.type.staleRowCount)} linhas guardadas de zonas que já não estão na estrutura`,
            })}
          </span>
        </Show>
      </div>
      <Table
        data={p.type.years}
        columns={columns}
        keyField="year"
        paddingY="compact"
        noRowsMessage={t3({
          en: "No years",
          fr: "Aucune année",
          pt: "Sem anos",
        })}
      />
    </div>
  );
}
