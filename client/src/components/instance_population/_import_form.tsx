import { t3, type PopulationImportResult } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  StateHolderFormError,
  createFormAction,
  toNum0,
} from "panther";
import { Match, Show, Switch, createSignal } from "solid-js";
import { FileUploadSelector } from "~/components/_file_upload_selector";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

// Fixed-column CSV import: the level is the deepest admin_area_N column in
// the file, every area must exist in the HMIS structure at that level, and
// rows upsert by (type, level, area, year).
export function PopulationImportForm(p: { close: (p: unknown) => void }) {
  const [fileName, setFileName] = createSignal("");
  const [result, setResult] = createSignal<PopulationImportResult | undefined>(
    undefined,
  );

  const runImport = createFormAction(async () => {
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
    const res = await serverActions.importPopulationCsv({
      assetFileName: fileName(),
    });
    if (res.success) setResult(res.data);
    return res;
  });

  const typeIds = () => instanceState.populationTypes.map((t) => t.id);

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          heading={t3({
            en: "Import population figures",
            fr: "Importer des chiffres de population",
            pt: "Importar valores de população",
          })}
        />
      }
    >
      <div class="ui-pad ui-spy max-w-2xl">
        <Switch>
          <Match when={result()} keyed>
            {(r) => (
              <div class="ui-spy">
                <div class="text-success font-700">
                  {t3({
                    en: `Imported ${toNum0(r.rowsImported)} figures at admin area level ${r.adminAreaLevel} (${r.populationTypes.join(", ")}; ${r.firstYear}–${r.lastYear})`,
                    fr: `${toNum0(r.rowsImported)} chiffres importés au niveau administratif ${r.adminAreaLevel} (${r.populationTypes.join(", ")} ; ${r.firstYear}–${r.lastYear})`,
                    pt: `${toNum0(r.rowsImported)} valores importados ao nível administrativo ${r.adminAreaLevel} (${r.populationTypes.join(", ")}; ${r.firstYear}–${r.lastYear})`,
                  })}
                </div>
                <div class="ui-gap-sm flex">
                  <Button onClick={() => p.close(undefined)} intent="success">
                    {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
                  </Button>
                  <Button
                    onClick={() => {
                      setResult(undefined);
                      setFileName("");
                    }}
                    iconName="upload"
                  >
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
          <Match when={true}>
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
                    en: "The deepest admin_area column present sets the level; area names must match the HMIS structure exactly. An optional admin_area_1 column is checked against the structure. Figures for a type, area and year already in the store are replaced; everything else is kept.",
                    fr: "La colonne admin_area la plus profonde présente détermine le niveau ; les noms d'unités doivent correspondre exactement à la structure SNIS. Une colonne admin_area_1 facultative est vérifiée par rapport à la structure. Les chiffres déjà présents pour un type, une unité et une année sont remplacés ; le reste est conservé.",
                    pt: "A coluna admin_area mais profunda presente define o nível; os nomes das zonas têm de corresponder exatamente à estrutura SNIS. Uma coluna admin_area_1 opcional é verificada contra a estrutura. Os valores já existentes para um tipo, zona e ano são substituídos; tudo o resto é mantido.",
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
              <StateHolderFormError state={runImport.state()} />
              <div class="ui-gap-sm flex">
                <Button
                  onClick={runImport.click}
                  state={runImport.state()}
                  disabled={!fileName()}
                  intent="success"
                  iconName="upload"
                >
                  {t3({ en: "Import", fr: "Importer", pt: "Importar" })}
                </Button>
                <Show when={!result()}>
                  <Button onClick={() => p.close(undefined)} outline>
                    {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
                  </Button>
                </Show>
              </div>
            </div>
          </Match>
        </Switch>
      </div>
    </FrameTop>
  );
}
