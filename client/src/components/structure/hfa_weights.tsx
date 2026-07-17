import {
  encodeRawCsvHeader,
  t3,
  TC,
  type CsvDetails,
  type HfaFacilityWeightsImportResult,
} from "lib";
import {
  Button,
  Csv,
  FrameRight,
  FrameTop,
  Select,
  StateHolderFormError,
  StateHolderWrapper,
  TableFromCsv,
  getEditorWrapper,
  getSelectOptions,
  createDeleteAction,
  createFormAction,
  toNum0,
} from "panther";
import type { StateHolder } from "panther";
import { For, Match, Show, Switch, createEffect, createMemo, createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { FileUploadSelector } from "~/components/_file_upload_selector";
import { serverActions, _SERVER_HOST } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  backToInstance: () => void;
};

export function HfaWeights(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [csvDataIsReady, setCsvDataIsReady] = createSignal<Csv<any> | null>(null);

  const hasWeights = () => instanceState.hfaWeights.some((tp) => tp.weightCount > 0);

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
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 flex-1 truncate text-xl">
              {t3({
                en: "HFA facility sampling weights",
                fr: "Pondérations d'échantillonnage des établissements Enquêtes FOSA",
                pt: "Ponderações de amostragem dos estabelecimentos FOSA",
              })}
            </div>
            <Show when={csvDataIsReady()}>
              <Button
                iconName="download"
                href={`${_SERVER_HOST}/structure/hfa_facility_weights/export/csv?t=${Date.now()}`}
                newTab
              >
                {t3(TC.download)}
              </Button>
            </Show>
          </div>
        }
      >
        <FrameRight
          panelChildren={
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto border-l">
                <div class="font-700 text-lg">
                  {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                </div>
                <Button onClick={openImportWizard} iconName="upload" fullWidth>
                  {t3({ en: "Import weights", fr: "Importer des pondérations", pt: "Importar ponderações" })}
                </Button>
                <Show when={hasWeights()}>
                  <Button
                    onClick={attemptDeleteAll}
                    intent="danger"
                    outline
                    iconName="trash"
                    fullWidth
                  >
                    {t3({ en: "Delete all weights", fr: "Supprimer toutes les pondérations", pt: "Eliminar todas as ponderações" })}
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
  type WeightsData = { totalCount: number; headers: string[]; items: Record<string, string>[] };
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
    <StateHolderWrapper state={state()}>
      {(keyedData) => {
        return (
          <Show
            when={keyedData.items.length > 0}
            fallback={
              <div class="ui-pad">
                {t3({
                  en: "No sampling weights imported yet",
                  fr: "Aucune pondération d'échantillonnage importée pour le moment",
                  pt: "Ainda não foi importada nenhuma ponderação de amostragem",
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
                    str === "null" || str === "undefined" || str === "" ? "." : str
                  }
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

type WizardStep =
  | { step: "upload" }
  | { step: "map"; csvDetails: CsvDetails }
  | { step: "done"; result: HfaFacilityWeightsImportResult };

type Mappings = { facilityIdColumn: string; weightColumn: string; timePoint: string };

function HfaWeightsImportForm(_p: { close: (p: unknown) => void }) {
  const [wizard, setWizard] = createSignal<WizardStep>({ step: "upload" });

  const timePointOptions = () =>
    [...instanceState.hfaTimePoints]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((tp) => ({
        value: tp.label,
        label: `${tp.label} (${tp.periodId.slice(0, 4)}-${tp.periodId.slice(4, 6)})`,
      }));

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Show
            when={wizard().step !== "upload"}
            fallback={
              <div class="font-700 text-xl">
                {t3({ en: "Import weights", fr: "Importer des pondérations", pt: "Importar ponderações" })}
              </div>
            }
          >
            <Button iconName="chevronLeft" onClick={() => setWizard({ step: "upload" })} />
            <div class="font-700 flex-1 truncate text-xl">
              {wizard().step === "map"
                ? t3({ en: "Map columns", fr: "Mapper les colonnes", pt: "Associar as colunas" })
                : t3({ en: "Import complete", fr: "Importation terminée", pt: "Importação concluída" })}
            </div>
          </Show>
        </div>
      }
    >
      <div class="ui-pad ui-spy max-w-xl">
        <Switch>
          <Match when={wizard().step === "upload"}>
            <UploadStep onNext={(csv) => setWizard({ step: "map", csvDetails: csv })} />
          </Match>
          <Match when={wizard().step === "map"}>
            {(_) => {
              const w = wizard() as { step: "map"; csvDetails: CsvDetails };
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
              const w = wizard() as { step: "done"; result: HfaFacilityWeightsImportResult };
              return <DoneStep result={w.result} onAgain={() => setWizard({ step: "upload" })} onClose={() => _p.close(undefined)} />;
            }}
          </Match>
        </Switch>
      </div>
    </FrameTop>
  );
}

function UploadStep(p: { onNext: (csv: CsvDetails) => void }) {
  const [fileName, setFileName] = createSignal("");

  const readHeaders = createFormAction(async () => {
    if (!fileName()) {
      return { success: false, err: t3({ en: "Select a file", fr: "Sélectionnez un fichier", pt: "Selecione um ficheiro" }) };
    }
    const res = await serverActions.readWeightsCsvHeaders({ assetFileName: fileName() });
    if (res.success) p.onNext(res.data);
    return res;
  });

  return (
    <div class="ui-spy">
      <div class="text-base-content-muted text-sm">
        {t3({
          en: "Upload a CSV with a facility ID column and a weight column. You will choose which columns to use in the next step. Each import covers one time point.",
          fr: "Téléversez un CSV avec une colonne d'identifiant d'établissement et une colonne de pondération. Vous choisirez les colonnes à utiliser à l'étape suivante. Chaque importation couvre un point temporel.",
          pt: "Carregue um CSV com uma coluna de ID do estabelecimento e uma coluna de ponderação. Escolherá as colunas a utilizar no passo seguinte. Cada importação cobre um ponto temporal.",
        })}
      </div>
      <FileUploadSelector
        buttonLabel={t3({ en: "Upload CSV", fr: "Téléverser un CSV", pt: "Carregar um CSV" })}
        selectLabel={t3({ en: "Existing CSV file", fr: "Fichier CSV existant", pt: "Ficheiro CSV existente" })}
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
  csvDetails: CsvDetails;
  timePointOptions: { value: string; label: string }[];
  onDone: (result: HfaFacilityWeightsImportResult) => void;
}) {
  const headerOptions = () =>
    getSelectOptions(p.csvDetails.headers.map((h, i) => encodeRawCsvHeader(i, h)));

  const [mappings, setMappings] = createStore<Mappings>({
    facilityIdColumn: "",
    weightColumn: "",
    timePoint: p.timePointOptions.length === 1 ? p.timePointOptions[0].value : "",
  });

  const runImport = createFormAction(async () => {
    const m = unwrap(mappings);
    if (!m.facilityIdColumn) return { success: false, err: t3({ en: "Select the facility ID column", fr: "Sélectionnez la colonne d'identifiant d'établissement", pt: "Selecione a coluna de ID do estabelecimento" }) };
    if (!m.weightColumn) return { success: false, err: t3({ en: "Select the weight column", fr: "Sélectionnez la colonne de pondération", pt: "Selecione a coluna de ponderação" }) };
    if (!m.timePoint) return { success: false, err: t3({ en: "Select a time point", fr: "Sélectionnez un point temporel", pt: "Selecione um ponto temporal" }) };
    const res = await serverActions.importHfaFacilityWeights({
      assetFileName: p.csvDetails.fileName,
      facilityIdColumn: m.facilityIdColumn,
      weightColumn: m.weightColumn,
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
            { key: "facilityIdColumn" as const, label: t3({ en: "Facility ID column", fr: "Colonne ID établissement", pt: "Coluna do ID do estabelecimento" }) },
            { key: "weightColumn" as const, label: t3({ en: "Weight column", fr: "Colonne de pondération", pt: "Coluna de ponderação" }) },
          ]}
        >
          {(row) => (
            <div class="flex items-center gap-4">
              <div class="w-48 flex-none text-sm">{row.label}</div>
              <div class="flex-1">
                <Select
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
          <div class="w-48 flex-none text-sm">
            {t3({ en: "Time point", fr: "Point temporel", pt: "Ponto temporal" })}
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
      <Button onClick={runImport.click} state={runImport.state()} intent="success" iconName="upload">
        {t3({ en: "Import", fr: "Importer", pt: "Importar" })}
      </Button>
    </div>
  );
}

function DoneStep(p: { result: HfaFacilityWeightsImportResult; onAgain: () => void; onClose: () => void }) {
  return (
    <div class="ui-spy">
      <div class="text-success font-700">
        {t3({
          en: `Imported ${toNum0(p.result.rowsImported)} weights for "${p.result.timePointsCovered[0]}"`,
          fr: `${toNum0(p.result.rowsImported)} pondérations importées pour « ${p.result.timePointsCovered[0]} »`,
          pt: `${toNum0(p.result.rowsImported)} ponderações importadas para "${p.result.timePointsCovered[0]}"`,
        })}
      </div>
      <Show when={p.result.rowsSkippedNoWeight > 0}>
        <div class="text-base-content-muted text-sm">
          {t3({
            en: `${toNum0(p.result.rowsSkippedNoWeight)} blank cell(s) — not in sample`,
            fr: `${toNum0(p.result.rowsSkippedNoWeight)} cellule(s) vide(s) — hors échantillon`,
            pt: `${toNum0(p.result.rowsSkippedNoWeight)} célula(s) vazia(s) — fora da amostra`,
          })}
        </div>
      </Show>
      <div class="ui-gap-sm flex">
        <Button onClick={p.onClose} intent="success">
          {t3({ en: "Done", fr: "Terminé", pt: "Concluído" })}
        </Button>
        <Button onClick={p.onAgain} iconName="upload">
          {t3({ en: "Import another round", fr: "Importer un autre tour", pt: "Importar outra ronda" })}
        </Button>
      </div>
    </div>
  );
}
