import { createSignal } from "solid-js";
import { t3, TC } from "lib";
import {
  Button,
  type EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  RadioGroup,
  Select,
  StateHolderFormError,
  getSelectOptions,
  pickFileAsArrayBuffer,
  createFormAction,
} from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  applyTimePointMapping,
  detectHfaWorkbookShape,
  type WorkbookShape,
} from "./_xlsx_workbook";

type Props = EditorComponentProps<{ timePoints: string[] }, undefined>;

type Step =
  | { name: "pick" }
  | { name: "reconcile"; shape: WorkbookShape; buf: ArrayBuffer }
  | { name: "done" };

export function HfaIndicatorsXlsxUploadForm(p: Props) {
  const [uploadMode, setUploadMode] = createSignal<"replace" | "add">("add");
  const [step, setStep] = createSignal<Step>({ name: "pick" });

  async function pickFile() {
    const buf = await pickFileAsArrayBuffer([".xlsx"]);
    if (!buf) return;
    const detected = detectHfaWorkbookShape(buf);
    if (!detected.ok) {
      // Surface parse error on pick — keep on pick step with error shown
      setParseErr(detected.err);
      return;
    }
    setParseErr(null);
    setStep({ name: "reconcile", shape: detected.shape, buf });
  }

  const [parseErr, setParseErr] = createSignal<string | null>(null);

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          heading={t3({
            en: "Import HFA Indicators from Excel",
            fr: "Importer des indicateurs HFA depuis Excel",
          })}
          back={() => p.close(undefined)}
        />
      }
    >
      <div class="ui-pad ui-spy max-w-3xl">
        <Switch>
          <Match when={step().name === "pick"}>
            <PickStep
              uploadMode={uploadMode()}
              onUploadModeChange={setUploadMode}
              parseErr={parseErr()}
              onPickFile={pickFile}
              onCancel={() => p.close(undefined)}
            />
          </Match>
          <Match when={step().name === "reconcile"}>
            {(_) => {
              const s = step() as {
                name: "reconcile";
                shape: WorkbookShape;
                buf: ArrayBuffer;
              };
              return (
                <ReconcileStep
                  shape={s.shape}
                  buf={s.buf}
                  uploadMode={uploadMode()}
                  timePoints={p.timePoints}
                  onBack={() => setStep({ name: "pick" })}
                  onDone={() => p.close(undefined)}
                />
              );
            }}
          </Match>
        </Switch>
      </div>
    </FrameTop>
  );
}

// ─── Step 1: pick file ────────────────────────────────────────────────────────

function PickStep(p: {
  uploadMode: "replace" | "add";
  onUploadModeChange: (v: "replace" | "add") => void;
  parseErr: string | null;
  onPickFile: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <div class="text-sm">
        {t3({
          en: "Upload an Excel workbook (.xlsx) with three sheets:",
          fr: "Téléversez un classeur Excel (.xlsx) comportant trois feuilles :",
        })}
        <ul class="mt-2 ml-5 list-disc space-y-1">
          <li>
            <span class="font-700 font-mono">Categories</span>: id, label
          </li>
          <li>
            <span class="font-700 font-mono">Sub-categories</span>: id,
            categoryId, label
          </li>
          <li>
            <span class="font-700 font-mono">Service categories</span>: id,
            label ({t3({ en: "optional", fr: "facultatif" })})
          </li>
          <li>
            <span class="font-700 font-mono">Indicators</span>: varName,
            categoryId, subCategoryId, serviceCategoryId (
            {t3({
              en: "pipe-separated for multiple",
              fr: "séparés par | pour plusieurs",
            })}
            ), shortLabel, definition, type, aggregation, r_code__&lt;time
            point&gt;, r_filter_code__&lt;time point&gt;, …
          </li>
        </ul>
      </div>
      <RadioGroup
        label={t3({ en: "Import Mode", fr: "Mode d'importation" })}
        options={[
          {
            value: "add",
            label: t3({ en: "Add to existing", fr: "Ajouter aux existants" }),
          },
          {
            value: "replace",
            label: t3({
              en: "Replace all existing",
              fr: "Remplacer tous les existants",
            }),
          },
        ]}
        value={p.uploadMode}
        onChange={(val) => p.onUploadModeChange(val as "replace" | "add")}
      />
      <Show when={p.parseErr}>
        <div class="text-danger text-sm">{p.parseErr}</div>
      </Show>
      <div class="ui-gap-sm flex">
        <Button onClick={p.onPickFile} iconName="upload">
          {t3({ en: "Select XLSX file", fr: "Sélectionner un fichier XLSX" })}
        </Button>
        <Button onClick={p.onCancel} intent="neutral">
          {t3(TC.cancel)}
        </Button>
      </div>
    </>
  );
}

// ─── Step 2: reconcile time points ───────────────────────────────────────────

type ReconcileMode = "all" | "one" | "map";

function buildDefaultMapping(
  xlsxCount: number,
  xlsxLabels: Array<string | null>,
  platformTimePoints: string[],
): Array<string | null> {
  if (xlsxCount === 0) return [];

  // New format with labels: map each embedded label to the matching platform TP
  if (xlsxLabels.some((l) => l !== null)) {
    return xlsxLabels.map((label) =>
      label && platformTimePoints.includes(label) ? label : null,
    );
  }

  // Old positional format: map by position
  return Array.from(
    { length: xlsxCount },
    (_, k) => platformTimePoints[k] ?? null,
  );
}

function ReconcileStep(p: {
  shape: WorkbookShape;
  buf: ArrayBuffer;
  uploadMode: "replace" | "add";
  timePoints: string[]; // platform time points in sort order
  onBack: () => void;
  onDone: () => void;
}) {
  const N = p.shape.xlsxCount;
  const M = p.timePoints.length;

  // Scenario detection
  const allLabeled = N > 0 && p.shape.xlsxLabels.every((l) => l !== null);
  const isAutoSingle = N === 1 && M === 1;
  const isApplyOneOrAll = N === 1 && M > 1;
  const isEqual = N === M && N > 1;
  const isMismatch = N !== M && N > 1 && M > 1;

  // "apply to all" mode only applies when N=1,M>1
  const [reconcileMode, setReconcileMode] = createSignal<ReconcileMode>(
    isApplyOneOrAll ? "all" : "map",
  );

  const defaultMapping = buildDefaultMapping(
    N,
    p.shape.xlsxLabels,
    p.timePoints,
  );
  const [mapping, setMapping] =
    createStore<Array<string | null>>(defaultMapping);

  const platformOptions = () => [
    { value: "", label: t3({ en: "— skip —", fr: "— ignorer —" }) },
    ...getSelectOptions(p.timePoints),
  ];

  const xlsxPositionLabel = (k: number) => {
    const embedded = p.shape.xlsxLabels[k];
    return embedded ?? t3({ en: `Position ${k + 1}`, fr: `Position ${k + 1}` });
  };

  const effectiveMapping = (): Array<string | null> => {
    if (isAutoSingle) return [p.timePoints[0]];
    if (isApplyOneOrAll && reconcileMode() === "all")
      return Array(N)
        .fill(null)
        .map(() => mapping[0]);
    return [...mapping];
  };

  const doImport = createFormAction(async () => {
    const finalMapping = effectiveMapping();
    const usedTps = new Set(finalMapping.filter(Boolean));
    if (usedTps.size === 0) {
      return {
        success: false,
        err: t3({
          en: "Select at least one time point to import into",
          fr: "Sélectionnez au moins un point temporel dans lequel importer",
        }),
      };
    }
    const code = applyTimePointMapping(p.shape, finalMapping);
    return await serverActions.importHfaIndicatorsWorkbook({
      categories: p.shape.categories,
      subCategories: p.shape.subCategories,
      serviceCategories: p.shape.serviceCategories,
      indicators: p.shape.indicators,
      code,
      replaceAll: p.uploadMode === "replace",
    });
  }, p.onDone);

  return (
    <>
      <div class="font-700 text-base">
        {t3({ en: "Map time points", fr: "Mapper les points temporels" })}
      </div>
      <div class="text-neutral text-sm">
        {t3({
          en: `XLSX has ${N} code column(s). Platform has ${M} time point(s).`,
          fr: `Le classeur contient ${N} colonne(s) de code. La plateforme a ${M} point(s) temporel(s).`,
        })}
      </div>

      <Show when={isAutoSingle}>
        <div class="text-success text-sm">
          {t3({
            en: `Auto-mapped: the single code column will be imported into "${p.timePoints[0]}".`,
            fr: `Mappage automatique : la colonne de code unique sera importée dans « ${p.timePoints[0]} ».`,
          })}
        </div>
      </Show>

      <Show when={isApplyOneOrAll}>
        <RadioGroup
          label={t3({
            en: "How to apply the single code column:",
            fr: "Comment appliquer la colonne de code unique :",
          })}
          options={[
            {
              value: "all",
              label: t3({
                en: `Apply to all ${M} time points`,
                fr: `Appliquer aux ${M} points temporels`,
              }),
            },
            {
              value: "one",
              label: t3({
                en: "Apply to one specific time point:",
                fr: "Appliquer à un point temporel spécifique :",
              }),
            },
          ]}
          value={reconcileMode()}
          onChange={(v) => setReconcileMode(v as ReconcileMode)}
        />
        <Show when={reconcileMode() === "one"}>
          <div class="w-72">
            <Select
              options={platformOptions()}
              value={mapping[0] ?? ""}
              onChange={(v) => setMapping(0, v || null)}
              fullWidth
            />
          </div>
        </Show>
      </Show>

      <Show when={!isAutoSingle && !isApplyOneOrAll}>
        <Show when={allLabeled && isEqual}>
          <div class="text-success text-xs">
            {t3({
              en: "Time point labels are embedded in the file. Verify the mapping below.",
              fr: "Les libellés des points temporels sont intégrés dans le fichier. Vérifiez le mappage ci-dessous.",
            })}
          </div>
        </Show>
        <Show when={isMismatch}>
          <div class="text-warning text-xs">
            {t3({
              en: "The number of code columns in the XLSX does not match the number of platform time points. Map each XLSX column to a platform time point, or skip it.",
              fr: "Le nombre de colonnes de code dans le XLSX ne correspond pas au nombre de points temporels de la plateforme. Mappez chaque colonne XLSX à un point temporel ou ignorez-la.",
            })}
          </div>
        </Show>
        <div class="ui-spy-sm">
          <For each={Array.from({ length: N }, (_, k) => k)}>
            {(k) => (
              <div class="flex items-center gap-4">
                <div class="w-40 flex-none font-mono text-sm">
                  {xlsxPositionLabel(k)}
                </div>
                <div class="flex-1">
                  <Select
                    options={platformOptions()}
                    value={mapping[k] ?? ""}
                    onChange={(v) => setMapping(k, v || null)}
                    fullWidth
                  />
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <StateHolderFormError state={doImport.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={doImport.click}
          state={doImport.state()}
          intent="primary"
          iconName="upload"
        >
          {t3({ en: "Import", fr: "Importer" })}
        </Button>
        <Button onClick={p.onBack} intent="neutral" iconName="chevronLeft">
          {t3({ en: "Back", fr: "Retour" })}
        </Button>
      </div>
    </>
  );
}
