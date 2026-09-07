import {
  ADMIN_AREA_COLUMNS,
  type AdminAreaLevel,
  POPULATION_TYPES,
  populationTypeLabel,
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
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { getAdminAreaLabel } from "~/state/instance/_util_disaggregation_label";
import { instanceState } from "~/state/instance/t1_store";

type Step = "select" | "preview" | "done";

// Three steps: pick a file, check it (a server preview, no write), import.
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

  const levelLabel = (level: AdminAreaLevel) => t3(getAdminAreaLabel(level));
  // The form opens only once the level is set (the page gates the button).
  const currentLevel = () => instanceState.populationLevel ?? 2;
  const currentLevelLabel = () => levelLabel(currentLevel());
  const columnList = () =>
    [
      ...ADMIN_AREA_COLUMNS.slice(0, currentLevel()),
      "year",
      "population_type",
      "count",
    ].join(", ");

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
                </div>
                <For each={pv.types}>
                  {(type) => <PreviewTypeCoverage type={type} />}
                </For>
                <div class="text-sm" classList={{ "text-success": pv.complete }}>
                  {pv.complete
                    ? t3({
                        en: "After this import, every population type in the file is complete.",
                        fr: "Après cet import, chaque type de population du fichier est complet.",
                        pt: "Após esta importação, todos os tipos de população do ficheiro ficam completos.",
                      })
                    : t3({
                        en: "After this import, at least one population type would still be missing values for some areas or years. Indicator values that use it are computed only for the areas and years it covers (plus one year either side); the other cells are left out of the results package.",
                        fr: "Après cet import, au moins un type de population manquerait encore de valeurs pour certaines unités ou années. Les valeurs d'indicateurs qui l'utilisent ne sont calculées que pour les unités et années couvertes (plus une année de chaque côté) ; les autres cellules sont exclues du paquet de résultats.",
                        pt: "Após esta importação, pelo menos um tipo de população continuaria sem valores para algumas zonas ou anos. Os valores de indicadores que o usam são calculados apenas para as zonas e anos cobertos (mais um ano para cada lado); as outras células ficam fora do pacote de resultados.",
                      })}
                </div>
                <StateHolderFormError state={runImport.state()} />
                <div class="ui-gap-sm flex">
                  <Button
                    onClick={runImport.click}
                    state={runImport.state()}
                    intent="success"
                    iconName="upload"
                  >
                    {t3({ en: "Import", fr: "Importer", pt: "Importar" })}
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
              <div class="ui-spy-sm text-sm">
                <div class="font-700">
                  {t3({
                    en: `This instance's population level is ${currentLevelLabel()}.`,
                    fr: `Le niveau de population de cette instance est ${currentLevelLabel()}.`,
                    pt: `O nível de população desta instância é ${currentLevelLabel()}.`,
                  })}
                </div>
                <div>
                  {t3({
                    en: "A CSV with one row per admin area at that level, year and population type. Columns:",
                    fr: "Un CSV avec une ligne par unité administrative de ce niveau, année et type de population. Colonnes :",
                    pt: "Um CSV com uma linha por zona administrativa desse nível, ano e tipo de população. Colunas:",
                  })}
                </div>
                <div class="font-mono">{columnList()}</div>
                <ul class="text-base-content-muted ui-spy-sm list-disc pl-5">
                  <li>
                    {t3({
                      en: "Every population type is stored at the population level, so every file must have exactly these admin_area columns. To change the level, delete all population data first.",
                      fr: "Chaque type de population est enregistré au niveau de population : chaque fichier doit donc avoir exactement ces colonnes admin_area. Pour changer le niveau, supprimez d'abord toutes les données de population.",
                      pt: "Todos os tipos de população são guardados ao nível de população, por isso cada ficheiro tem de ter exatamente estas colunas admin_area. Para alterar o nível, elimine primeiro todos os dados de população.",
                    })}
                  </li>
                  <li>
                    {t3({
                      en: "Area names must match the HMIS facility structure exactly. admin_area_1 may be left out.",
                      fr: "Les noms d'unités doivent correspondre exactement à la structure des établissements SNIS. admin_area_1 peut être omise.",
                      pt: "Os nomes das zonas têm de corresponder exatamente à estrutura de estabelecimentos SNIS. admin_area_1 pode ser omitida.",
                    })}
                  </li>
                  <li>
                    {t3({
                      en: "year is a 4-digit year; count is the population for that year, a whole number of 0 or more.",
                      fr: "year est une année à 4 chiffres ; count est la population de cette année, un nombre entier supérieur ou égal à 0.",
                      pt: "year é um ano de 4 dígitos; count é a população desse ano, um número inteiro igual ou superior a 0.",
                    })}
                  </li>
                  <li>
                    {t3({
                      en: "A row whose type, area and year are already stored replaces the stored value; everything else is kept.",
                      fr: "Une ligne dont le type, l'unité et l'année sont déjà enregistrés remplace la valeur enregistrée ; le reste est conservé.",
                      pt: "Uma linha cujo tipo, zona e ano já estão guardados substitui o valor guardado; tudo o resto é mantido.",
                    })}
                  </li>
                </ul>
                <div>
                  {t3({
                    en: "population_type is one of:",
                    fr: "population_type est l'un de :",
                    pt: "population_type é um de:",
                  })}
                </div>
                <ul class="text-base-content-muted ui-spy-sm pl-5">
                  <For each={POPULATION_TYPES}>
                    {(type) => (
                      <li>
                        <span class="font-mono">{type.id}</span>
                        <span>{": "}{t3(type.label)}</span>
                      </li>
                    )}
                  </For>
                </ul>
                <div class="text-base-content-muted">
                  {t3({
                    en: "The template lists every admin area of this instance's HMIS structure at the population level, one row per population type for the current year, with count left blank. Fill in the counts, add rows for other years, and remove the types you do not have.",
                    fr: "Le modèle liste chaque unité administrative de la structure SNIS de cette instance au niveau de population, une ligne par type de population pour l'année en cours, avec count laissé vide. Remplissez les effectifs, ajoutez des lignes pour les autres années et retirez les types que vous n'avez pas.",
                    pt: "O modelo lista todas as zonas administrativas da estrutura SNIS desta instância ao nível de população, uma linha por tipo de população para o ano atual, com count em branco. Preencha os valores, acrescente linhas para outros anos e retire os tipos que não tem.",
                  })}
                </div>
                <div>
                  <Button
                    iconName="download"
                    href={`${_SERVER_HOST}/population/template/csv?t=${Date.now()}`}
                    newTab
                    outline
                  >
                    {t3({
                      en: "Download template",
                      fr: "Télécharger le modèle",
                      pt: "Descarregar o modelo",
                    })}
                  </Button>
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
  const label = () => t3(populationTypeLabel(p.type.populationType));

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
