import {
  type CsvDetails,
  encodeRawCsvHeader,
  findEncodedCsvHeader,
  findFirstEncodedCsvHeaderWithValues,
  HFA_CORE_FACILITY_ID_COLUMNS,
  HFA_CORE_STRATUM_COLUMN,
  HFA_CORE_WEIGHT_COLUMN,
  type HfaFacilityWeightsImportResult,
  t3,
  TC,
} from "lib";
import {
  Button,
  Checkbox,
  createDeleteAction,
  createFormAction,
  Csv,
  FrameRight,
  FrameTop,
  getEditorWrapper,
  getSelectOptions,
  HeadingBar,
  plural,
  Select,
  SelectSearch,
  StateHolderFormError,
  StateHolderWrapper,
  TableFromCsv,
  toNum0,
} from "panther";
import type { StateHolder } from "panther";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { FileUploadSelector } from "~/components/_shared/mod.ts";
import { _SERVER_HOST, serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  close: (v: undefined) => void;
};

export function HfaWeights(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [csvDataIsReady, setCsvDataIsReady] = createSignal<Csv<any> | null>(
    null,
  );

  const hasWeights = () =>
    instanceState.hfaWeights.some((tp) => tp.weightCount > 0);

  async function openImportWizard() {
    await openEditor({ element: HfaWeightsImportForm, props: {} });
  }

  async function attemptDeleteAll() {
    const deleteAction = createDeleteAction(
      t3({
        en: "Delete all facility sampling weights?",
        fr: "Supprimer toutes les pondérations d'échantillonnage ?",
        pt: "Eliminar todas as ponderações de amostragem?",
      }),
      () => serverActions.deleteAllHfaFacilityWeights({}),
    );
    await deleteAction.click();
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            onBack={() => p.close(undefined)}
            heading={t3({
              en: "HFA facility sampling weights",
              fr:
                "Pondérations d'échantillonnage des établissements Enquêtes FOSA",
              pt: "Ponderações de amostragem dos estabelecimentos FOSA",
            })}
          >
            <Show when={csvDataIsReady()}>
              <Button
                iconName="download"
                href={`${_SERVER_HOST}/structure/hfa_facility_weights/export/csv?t=${Date.now()}`}
                newTab
              >
                {t3(TC.download)}
              </Button>
            </Show>
          </HeadingBar>
        }
      >
        <FrameRight
          panelChildren={
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto">
                <div class="ui-text-heading">
                  {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                </div>
                <Button onClick={openImportWizard} iconName="upload" fullWidth>
                  {t3({
                    en: "Import weights",
                    fr: "Importer des pondérations",
                    pt: "Importar ponderações",
                  })}
                </Button>
                <Show when={hasWeights()}>
                  <Button
                    onClick={attemptDeleteAll}
                    intent="danger"
                    outline
                    iconName="trash"
                    fullWidth
                  >
                    {t3({
                      en: "Delete all weights",
                      fr: "Supprimer toutes les pondérations",
                      pt: "Eliminar todas as ponderações",
                    })}
                  </Button>
                </Show>
              </div>
            </Show>
          }
        >
          <div class="h-full w-full">
            <WeightsWithCsv onCsvReady={setCsvDataIsReady} />
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}

// ─── CSV viewer ───────────────────────────────────────────────────────────────

function WeightsWithCsv(p: { onCsvReady?: (csv: Csv<any>) => void }) {
  type WeightsData = {
    totalCount: number;
    headers: string[];
    items: Record<string, string>[];
  };
  const [state, setState] = createSignal<StateHolder<WeightsData>>({
    status: "loading",
    msg: t3(TC.fetchingData),
  });

  async function fetch() {
    setState({ status: "loading", msg: t3(TC.fetchingData) });
    const res = await serverActions.getHfaFacilityWeightsItems({});
    if (!res.success) {
      setState({ status: "error", err: res.err });
      return;
    }
    setState({ status: "ready", data: res.data });
  }

  createEffect(() => {
    void instanceState.structureLastUpdated;
    fetch();
  });

  return (
    <StateHolderWrapper state={state()} loadingAndErrorPad="md">
      {(keyedData) => {
        return (
          <Show
            when={keyedData.items.length > 0}
            fallback={
              <div class="ui-pad">
                {t3({
                  en: "No sampling weights imported yet",
                  fr:
                    "Aucune pondération d'échantillonnage importée pour le moment",
                  pt:
                    "Ainda não foi importada nenhuma ponderação de amostragem",
                })}
              </div>
            }
          >
            {(_) => {
              const csv = createMemo(() => {
                const aoa = keyedData.items.map((row) =>
                  keyedData.headers.map((h) => row[h] ?? "")
                );
                const c = new Csv({ aoa, colHeaders: keyedData.headers });
                p.onCsvReady?.(c);
                return c;
              });
              return (
                <TableFromCsv
                  csv={csv()}
                  knownTotalCount={keyedData.totalCount}
                  cellFormatter={(str) =>
                    str === "null" || str === "undefined" || str === ""
                      ? "."
                      : str}
                  alignText="left"
                />
              );
            }}
          </Show>
        );
      }}
    </StateHolderWrapper>
  );
}

// ─── Import wizard ────────────────────────────────────────────────────────────

type WeightsCsvHeaders = CsvDetails & { headersWithValues: string[] };

type WizardStep =
  | { step: "upload" }
  | { step: "map"; csvDetails: WeightsCsvHeaders }
  | { step: "done"; result: HfaFacilityWeightsImportResult };

type Mappings = {
  facilityIdColumn: string;
  weightColumn: string;
  includeStratum: boolean;
  stratumColumn: string;
  timePoint: string;
};

function HfaWeightsImportForm(_p: { close: (p: unknown) => void }) {
  const [wizard, setWizard] = createSignal<WizardStep>({ step: "upload" });

  const timePointOptions = () =>
    [...instanceState.hfaTimePoints]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((tp) => ({
        value: tp.label,
        label: `${tp.label} (${tp.periodId.slice(0, 4)}-${
          tp.periodId.slice(4, 6)
        })`,
      }));

  return (
    <FrameTop
      pad="md"
      panelChildren={
        <HeadingBar
          tonal
          onBack={() =>
            wizard().step === "upload"
              ? _p.close(undefined)
              : setWizard({ step: "upload" })}
          heading={wizard().step === "upload"
            ? t3({
              en: "Import weights",
              fr: "Importer des pondérations",
              pt: "Importar ponderações",
            })
            : wizard().step === "map"
            ? t3({
              en: "Map columns",
              fr: "Mapper les colonnes",
              pt: "Associar as colunas",
            })
            : t3({
              en: "Import complete",
              fr: "Importation terminée",
              pt: "Importação concluída",
            })}
        />
      }
    >
      <div class="ui-spy max-w-xl">
        <Switch>
          <Match when={wizard().step === "upload"}>
            <UploadStep
              onNext={(csv) => setWizard({ step: "map", csvDetails: csv })}
            />
          </Match>
          <Match when={wizard().step === "map"}>
            {(_) => {
              const w = wizard() as {
                step: "map";
                csvDetails: WeightsCsvHeaders;
              };
              return (
                <MapStep
                  csvDetails={w.csvDetails}
                  timePointOptions={timePointOptions()}
                  onDone={(result) => setWizard({ step: "done", result })}
                />
              );
            }}
          </Match>
          <Match when={wizard().step === "done"}>
            {(_) => {
              const w = wizard() as {
                step: "done";
                result: HfaFacilityWeightsImportResult;
              };
              return (
                <DoneStep
                  result={w.result}
                  onAgain={() => setWizard({ step: "upload" })}
                  onClose={() => _p.close(undefined)}
                />
              );
            }}
          </Match>
        </Switch>
      </div>
    </FrameTop>
  );
}

function UploadStep(p: { onNext: (csv: WeightsCsvHeaders) => void }) {
  const [fileName, setFileName] = createSignal("");

  const readHeaders = createFormAction(async () => {
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
    const res = await serverActions.readWeightsCsvHeaders({
      assetFileName: fileName(),
    });
    if (res.success) p.onNext(res.data);
    return res;
  });

  return (
    <div class="ui-spy">
      <div class="text-base-content-muted text-sm">
        {t3({
          en:
            "Upload a CSV with a facility ID column and a weight column, and optionally a sampling stratum column. You will choose which columns to use in the next step. Each import covers one time point. Import the time point's data first: the data import creates the facilities, and a weight for a facility that is not in the HFA facilities is skipped.",
          fr:
            "Téléversez un CSV avec une colonne d'identifiant d'établissement et une colonne de pondération, et éventuellement une colonne de strate d'échantillonnage. Vous choisirez les colonnes à utiliser à l'étape suivante. Chaque importation couvre un point temporel. Importez d'abord les données du point temporel : l'importation des données crée les établissements, et une pondération pour un établissement absent des établissements Enquêtes FOSA est ignorée.",
          pt:
            "Carregue um CSV com uma coluna de ID do estabelecimento e uma coluna de ponderação e, opcionalmente, uma coluna de estrato de amostragem. Escolherá as colunas a utilizar no passo seguinte. Cada importação cobre um ponto temporal. Importe primeiro os dados do ponto temporal: a importação de dados cria os estabelecimentos, e uma ponderação para um estabelecimento que não está nos estabelecimentos FOSA é ignorada.",
        })}
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
      <StateHolderFormError state={readHeaders.state()} />
      <Button
        onClick={readHeaders.click}
        state={readHeaders.state()}
        disabled={!fileName()}
        intent="success"
        iconName="arrowRight"
      >
        {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
      </Button>
    </div>
  );
}

function MapStep(p: {
  csvDetails: WeightsCsvHeaders;
  timePointOptions: { value: string; label: string }[];
  onDone: (result: HfaFacilityWeightsImportResult) => void;
}) {
  const headerOptions = () =>
    getSelectOptions(
      p.csvDetails.headers.map((h, i) => encodeRawCsvHeader(i, h)),
    );

  const defaultStratumColumn = findEncodedCsvHeader(
    p.csvDetails.headers,
    HFA_CORE_STRATUM_COLUMN,
  );

  const [mappings, setMappings] = createStore<Mappings>({
    facilityIdColumn: findFirstEncodedCsvHeaderWithValues(
      p.csvDetails.headers,
      HFA_CORE_FACILITY_ID_COLUMNS,
      p.csvDetails.headersWithValues,
    ),
    weightColumn: findEncodedCsvHeader(
      p.csvDetails.headers,
      HFA_CORE_WEIGHT_COLUMN,
    ),
    includeStratum: defaultStratumColumn !== "",
    stratumColumn: defaultStratumColumn,
    timePoint: p.timePointOptions.length === 1
      ? p.timePointOptions[0].value
      : "",
  });

  const runImport = createFormAction(async () => {
    const m = unwrap(mappings);
    if (!m.facilityIdColumn) {
      return {
        success: false,
        err: t3({
          en: "Select the facility ID column",
          fr: "Sélectionnez la colonne d'identifiant d'établissement",
          pt: "Selecione a coluna de ID do estabelecimento",
        }),
      };
    }
    if (!m.weightColumn) {
      return {
        success: false,
        err: t3({
          en: "Select the weight column",
          fr: "Sélectionnez la colonne de pondération",
          pt: "Selecione a coluna de ponderação",
        }),
      };
    }
    if (m.includeStratum && !m.stratumColumn) {
      return {
        success: false,
        err: t3({
          en: "Select the stratum column",
          fr: "Sélectionnez la colonne de strate",
          pt: "Selecione a coluna de estrato",
        }),
      };
    }
    if (!m.timePoint) {
      return {
        success: false,
        err: t3({
          en: "Select a time point",
          fr: "Sélectionnez un point temporel",
          pt: "Selecione um ponto temporal",
        }),
      };
    }
    const res = await serverActions.importHfaFacilityWeights({
      assetFileName: p.csvDetails.fileName,
      facilityIdColumn: m.facilityIdColumn,
      weightColumn: m.weightColumn,
      stratumColumn: m.includeStratum ? m.stratumColumn : undefined,
      timePoint: m.timePoint,
    });
    if (res.success) p.onDone(res.data);
    return res;
  });

  return (
    <div class="ui-spy">
      <div class="ui-text-caption font-mono">{p.csvDetails.fileName}</div>
      <div class="ui-spy-sm">
        <For
          each={[
            {
              key: "facilityIdColumn" as const,
              label: t3({
                en: "Facility ID column",
                fr: "Colonne ID établissement",
                pt: "Coluna do ID do estabelecimento",
              }),
            },
            {
              key: "weightColumn" as const,
              label: t3({
                en: "Weight column",
                fr: "Colonne de pondération",
                pt: "Coluna de ponderação",
              }),
            },
          ]}
        >
          {(row) => (
            <div class="flex items-center gap-4">
              <div class="w-48 flex-none text-sm">{row.label}</div>
              <div class="flex-1">
                <SelectSearch
                  options={headerOptions()}
                  value={mappings[row.key]}
                  onChange={(v) => setMappings(row.key, v)}
                  fullWidth
                />
              </div>
            </div>
          )}
        </For>
        <div class="flex items-center gap-4">
          <div class="w-48 flex-none">
            <Checkbox
              checked={mappings.includeStratum}
              onChange={(v) => setMappings("includeStratum", v)}
              label={t3({
                en: "Stratum column",
                fr: "Colonne de strate",
                pt: "Coluna de estrato",
              })}
            />
          </div>
          <div class="flex-1">
            <Show when={mappings.includeStratum}>
              <SelectSearch
                options={headerOptions()}
                value={mappings.stratumColumn}
                onChange={(v) => setMappings("stratumColumn", v)}
                fullWidth
              />
            </Show>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <div class="w-48 flex-none text-sm">
            {t3({
              en: "Time point",
              fr: "Point temporel",
              pt: "Ponto temporal",
            })}
          </div>
          <div class="flex-1">
            <Select
              options={p.timePointOptions}
              value={mappings.timePoint}
              onChange={(v) => setMappings("timePoint", v)}
              fullWidth
            />
          </div>
        </div>
      </div>
      <StateHolderFormError state={runImport.state()} />
      <Button
        onClick={runImport.click}
        state={runImport.state()}
        intent="success"
        iconName="upload"
      >
        {t3({ en: "Import", fr: "Importer", pt: "Importar" })}
      </Button>
    </div>
  );
}

function DoneStep(
  p: {
    result: HfaFacilityWeightsImportResult;
    onAgain: () => void;
    onClose: () => void;
  },
) {
  const skipped = () => p.result.facilitiesNotInRegistry;
  const skippedIds = () =>
    skipped().sample.join(", ") +
    (skipped().count > skipped().sample.length ? ", …" : "");

  return (
    <div class="ui-spy">
      <div class="text-success font-700">
        {t3({
          en: `Imported ${toNum0(p.result.rowsImported)} weights for "${
            p.result.timePointsCovered[0]
          }"`,
          fr: `${toNum0(p.result.rowsImported)} pondérations importées pour « ${
            p.result.timePointsCovered[0]
          } »`,
          pt: `${toNum0(p.result.rowsImported)} ponderações importadas para "${
            p.result.timePointsCovered[0]
          }"`,
        })}
      </div>
      <Show when={p.result.strata}>
        {(strata) => (
          <div class="text-base-content-muted text-sm">
            {`${toNum0(strata().count)} ${
              plural(strata().count, {
                one: t3({ en: "stratum", fr: "strate", pt: "estrato" }),
                other: t3({ en: "strata", fr: "strates", pt: "estratos" }),
              })
            }`}
            <Show when={strata().rowsWithoutStratum > 0}>
              {` · ${toNum0(strata().rowsWithoutStratum)} ${
                plural(strata().rowsWithoutStratum, {
                  one: t3({
                    en: "weight with no stratum",
                    fr: "pondération sans strate",
                    pt: "ponderação sem estrato",
                  }),
                  other: t3({
                    en: "weights with no stratum",
                    fr: "pondérations sans strate",
                    pt: "ponderações sem estrato",
                  }),
                })
              }`}
            </Show>
          </div>
        )}
      </Show>
      <Show when={skipped().count > 0}>
        <div class="text-warning text-sm">
          {t3({
            en: `${toNum0(skipped().count)} ${
              plural(skipped().count, {
                one: "weight was skipped: its facility is",
                other: "weights were skipped: their facilities are",
              })
            } not in the HFA facilities, which each time point's data import creates (${skippedIds()})`,
            fr: `${toNum0(skipped().count)} ${
              plural(skipped().count, {
                one: "pondération ignorée : son établissement est absent",
                other:
                  "pondérations ignorées : leurs établissements sont absents",
              })
            } des établissements Enquêtes FOSA, que crée l'importation des données de chaque point temporel (${skippedIds()})`,
            pt: `${toNum0(skipped().count)} ${
              plural(skipped().count, {
                one: "ponderação ignorada: o seu estabelecimento não está",
                other:
                  "ponderações ignoradas: os seus estabelecimentos não estão",
              })
            } nos estabelecimentos FOSA, que a importação de dados de cada ponto temporal cria (${skippedIds()})`,
          })}
        </div>
      </Show>
      <Show when={p.result.rowsSkippedNoWeight > 0}>
        <div class="text-base-content-muted text-sm">
          {`${toNum0(p.result.rowsSkippedNoWeight)} ${
            plural(p.result.rowsSkippedNoWeight, {
              one: t3({
                en: "blank cell",
                fr: "cellule vide",
                pt: "célula vazia",
              }),
              other: t3({
                en: "blank cells",
                fr: "cellules vides",
                pt: "células vazias",
              }),
            })
          } — ${
            t3({
              en: "not in sample",
              fr: "hors échantillon",
              pt: "fora da amostra",
            })
          }`}
        </div>
      </Show>
      <div class="ui-gap-sm flex">
        <Button onClick={p.onClose} intent="success">
          {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
        </Button>
        <Button onClick={p.onAgain} iconName="upload">
          {t3({
            en: "Import another round",
            fr: "Importer un autre tour",
            pt: "Importar outra ronda",
          })}
        </Button>
      </div>
    </div>
  );
}
