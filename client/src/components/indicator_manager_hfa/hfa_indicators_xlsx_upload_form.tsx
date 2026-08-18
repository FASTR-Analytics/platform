import { createSignal, onMount, type Accessor } from "solid-js";
import { t3, TC } from "lib";
import {
  Button,
  type EditorComponentProps,
  FrameTop,
  HeadingBar,
  Input,
  RadioGroup,
  Select,
  type StateHolder,
  StateHolderFormError,
  StateHolderWrapper,
  getSelectOptions,
  openAlert,
  pickFileAsArrayBuffer,
  createFormAction,
} from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { createStore } from "solid-js/store";
import { serverActions } from "~/server_actions";
import {
  applyTimePointMapping,
  applyVariantTimePointMapping,
  detectHfaWorkbookShape,
  type WorkbookShape,
} from "./_xlsx_workbook";

export type HfaWorkbookSource = { kind: "pick" } | { kind: "default" };

const DEFAULT_INDICATORS_XLSX_URL =
  "https://raw.githubusercontent.com/FASTR-Analytics/fastr-resource-hub/refs/heads/main/hfa_default_indicators.xlsx";

async function fetchDefaultWorkbookShape(): Promise<StateHolder<WorkbookShape>> {
  let buf: ArrayBuffer;
  try {
    const res = await fetch(`${DEFAULT_INDICATORS_XLSX_URL}?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        status: "error",
        err: t3({
          en: `Could not fetch the default indicators from GitHub (${res.status} ${res.statusText}).`,
          fr: `Impossible de récupérer les indicateurs par défaut depuis GitHub (${res.status} ${res.statusText}).`,
          pt: `Não foi possível obter os indicadores predefinidos do GitHub (${res.status} ${res.statusText}).`,
        }),
      };
    }
    buf = await res.arrayBuffer();
  } catch (e) {
    return {
      status: "error",
      err: t3({
        en: `Could not fetch the default indicators from GitHub: ${e instanceof Error ? e.message : String(e)}`,
        fr: `Impossible de récupérer les indicateurs par défaut depuis GitHub : ${e instanceof Error ? e.message : String(e)}`,
        pt: `Não foi possível obter os indicadores predefinidos do GitHub: ${e instanceof Error ? e.message : String(e)}`,
      }),
    };
  }
  const detected = detectHfaWorkbookShape(buf);
  return detected.ok
    ? { status: "ready", data: detected.shape }
    : { status: "error", err: detected.err };
}

type Props = EditorComponentProps<
  {
    source: HfaWorkbookSource;
    timePoints: string[];
    surveyVarNames: string[];
    showAi: Accessor<boolean>;
    openAi: () => void;
  },
  undefined
>;

type Step =
  | { name: "pick" }
  | { name: "reconcile"; shape: WorkbookShape };

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
    setStep({ name: "reconcile", shape: detected.shape });
  }

  const [parseErr, setParseErr] = createSignal<string | null>(null);

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          heading={
            p.source.kind === "default"
              ? t3({
                  en: "Import default HFA indicators",
                  fr: "Importer les indicateurs HFA par défaut",
                  pt: "Importar indicadores HFA predefinidos",
                })
              : t3({
                  en: "Import HFA Indicators from Excel",
                  fr: "Importer des indicateurs HFA depuis Excel",
                  pt: "Importar indicadores HFA a partir do Excel",
                })
          }
          onBack={() => p.close(undefined)}
        >
          <Show when={!p.showAi()}>
            <Button iconName="chevronLeft" outline onBackground="base-200" onClick={p.openAi}>
              {t3({ en: "AI", fr: "IA", pt: "IA" })}
            </Button>
          </Show>
        </HeadingBar>
      }
    >
      <div class="ui-pad ui-spy max-w-3xl">
        <Switch>
          <Match when={step().name === "pick" && p.source.kind === "pick"}>
            <PickStep
              uploadMode={uploadMode()}
              onUploadModeChange={setUploadMode}
              parseErr={parseErr()}
              onPickFile={pickFile}
              onCancel={() => p.close(undefined)}
            />
          </Match>
          <Match when={step().name === "pick" && p.source.kind === "default"}>
            <DefaultStep
              uploadMode={uploadMode()}
              onUploadModeChange={setUploadMode}
              onContinue={(shape) => setStep({ name: "reconcile", shape })}
              onCancel={() => p.close(undefined)}
            />
          </Match>
          <Match when={step().name === "reconcile"}>
            {(_) => {
              const s = step() as {
                name: "reconcile";
                shape: WorkbookShape;
              };
              return (
                <ReconcileStep
                  shape={s.shape}
                  uploadMode={uploadMode()}
                  timePoints={p.timePoints}
                  surveyVarNames={p.surveyVarNames}
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

// ─── Step 1: choose source + import mode ──────────────────────────────────────

function ImportModeRadio(p: {
  uploadMode: "replace" | "add";
  onUploadModeChange: (v: "replace" | "add") => void;
}) {
  return (
    <RadioGroup
      label={t3({ en: "Import Mode", fr: "Mode d'importation", pt: "Modo de importação" })}
      options={[
        {
          value: "add",
          label: t3({ en: "Add to existing", fr: "Ajouter aux existants", pt: "Adicionar aos existentes" }),
        },
        {
          value: "replace",
          label: t3({
            en: "Replace all existing",
            fr: "Remplacer tous les existants",
            pt: "Substituir todos os existentes",
          }),
        },
      ]}
      value={p.uploadMode}
      onChange={(val) => p.onUploadModeChange(val as "replace" | "add")}
    />
  );
}

function DefaultStep(p: {
  uploadMode: "replace" | "add";
  onUploadModeChange: (v: "replace" | "add") => void;
  onContinue: (shape: WorkbookShape) => void;
  onCancel: () => void;
}) {
  const loadingState = (): StateHolder<WorkbookShape> => ({
    status: "loading",
    msg: t3({
      en: "Fetching the default indicators from GitHub...",
      fr: "Récupération des indicateurs par défaut depuis GitHub...",
      pt: "A obter os indicadores predefinidos do GitHub...",
    }),
  });
  const [workbook, setWorkbook] = createSignal<StateHolder<WorkbookShape>>(loadingState());
  async function load() {
    setWorkbook(loadingState());
    setWorkbook(await fetchDefaultWorkbookShape());
  }
  onMount(load);

  return (
    <StateHolderWrapper
      state={workbook()}
      noPad
      onErrorButton={{ label: t3({ en: "Retry", fr: "Réessayer", pt: "Tentar novamente" }), onClick: load }}
      onErrorSecondaryButton={{ label: t3(TC.cancel), onClick: p.onCancel }}
    >
      {(shape) => (
        <>
          <div class="text-sm">
            {t3({
              en: `The default FASTR HFA indicator set was fetched from the FASTR resource hub on GitHub: ${shape.indicators.length} indicator(s) in ${shape.categories.length} category(ies).`,
              fr: `L'ensemble d'indicateurs HFA FASTR par défaut a été récupéré depuis le hub de ressources FASTR sur GitHub : ${shape.indicators.length} indicateur(s) dans ${shape.categories.length} catégorie(s).`,
              pt: `O conjunto predefinido de indicadores HFA FASTR foi obtido do hub de recursos FASTR no GitHub: ${shape.indicators.length} indicador(es) em ${shape.categories.length} categoria(s).`,
            })}
          </div>
          <ImportModeRadio
            uploadMode={p.uploadMode}
            onUploadModeChange={p.onUploadModeChange}
          />
          <div class="ui-gap-sm flex">
            <Button onClick={() => p.onContinue(shape)} iconName="chevronRight">
              {t3({ en: "Continue", fr: "Continuer", pt: "Continuar" })}
            </Button>
            <Button onClick={p.onCancel} intent="neutral">
              {t3(TC.cancel)}
            </Button>
          </div>
        </>
      )}
    </StateHolderWrapper>
  );
}

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
          en: "Upload an Excel workbook (.xlsx) with four sheets:",
          fr: "Téléversez un classeur Excel (.xlsx) comportant quatre feuilles :",
          pt: "Carregue um livro do Excel (.xlsx) com quatro folhas:",
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
            label ({t3({ en: "optional", fr: "facultatif", pt: "opcional" })})
          </li>
          <li>
            <span class="font-700 font-mono">Indicators</span>: varName,
            categoryId, subCategoryId, serviceCategoryId (
            {t3({
              en: "pipe-separated for multiple",
              fr: "séparés par | pour plusieurs",
              pt: "separados por | para vários",
            })}
            ), shortLabel, definition, type, aggregation, r_code__&lt;time
            point&gt;, r_filter_code__&lt;time point&gt;, …
          </li>
        </ul>
      </div>
      <ImportModeRadio
        uploadMode={p.uploadMode}
        onUploadModeChange={p.onUploadModeChange}
      />
      <Show when={p.parseErr}>
        <div class="text-danger text-sm">{p.parseErr}</div>
      </Show>
      <div class="ui-gap-sm flex">
        <Button onClick={p.onPickFile} iconName="upload">
          {t3({ en: "Select XLSX file", fr: "Sélectionner un fichier XLSX", pt: "Selecionar ficheiro XLSX" })}
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
  uploadMode: "replace" | "add";
  timePoints: string[]; // platform time points in sort order
  surveyVarNames: string[];
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
    { value: "", label: t3({ en: "— skip —", fr: "— ignorer —", pt: "— ignorar —" }) },
    ...getSelectOptions(p.timePoints),
  ];

  const xlsxPositionLabel = (k: number) => {
    const embedded = p.shape.xlsxLabels[k];
    return embedded ?? t3({ en: `Position ${k + 1}`, fr: `Position ${k + 1}`, pt: `Posição ${k + 1}` });
  };

  const effectiveMapping = (): Array<string | null> => {
    if (isAutoSingle) return [p.timePoints[0]];
    if (isApplyOneOrAll && reconcileMode() === "all")
      return Array(N)
        .fill(null)
        .map(() => mapping[0]);
    return [...mapping];
  };

  const [replaceCheckText, setReplaceCheckText] = createSignal("");
  const replaceConfirmed = () =>
    p.uploadMode !== "replace" || replaceCheckText() === "yes please delete";

  const doImport = createFormAction(
    async () => {
      const finalMapping = effectiveMapping();
      const usedTps = new Set(finalMapping.filter(Boolean));
      if (usedTps.size === 0) {
        return {
          success: false,
          err: t3({
            en: "Select at least one time point to import into",
            fr: "Sélectionnez au moins un point temporel dans lequel importer",
            pt: "Selecione pelo menos um ponto temporal para a importação",
          }),
        };
      }

      const mappedTps = finalMapping.filter((tp): tp is string => !!tp);
      const duplicateTp = mappedTps.find(
        (tp, i) => mappedTps.indexOf(tp) !== i,
      );
      if (duplicateTp) {
        return {
          success: false,
          err: t3({
            en: `Two workbook columns are mapped to the same time point ("${duplicateTp}"). Each platform time point can receive at most one column.`,
            fr: `Deux colonnes du classeur sont mappées au même point temporel (« ${duplicateTp} »). Chaque point temporel de la plateforme ne peut recevoir qu'une seule colonne.`,
            pt: `Duas colunas do livro estão associadas ao mesmo ponto temporal ("${duplicateTp}"). Cada ponto temporal da plataforma pode receber no máximo uma coluna.`,
          }),
        };
      }

      if (p.uploadMode === "add") {
        const shadowing = p.shape.indicators
          .map((ind) => ind.varName)
          .filter((v) => p.surveyVarNames.includes(v));
        if (shadowing.length > 0) {
          return {
            success: false,
            err: t3({
              en: `These varNames are survey variable names and would shadow the dataset columns in other indicators' code: ${shadowing.join(", ")}. Rename them in the workbook.`,
              fr: `Ces noms de variables sont des noms de variables d'enquête et masqueraient les colonnes du jeu de données dans le code des autres indicateurs : ${shadowing.join(", ")}. Renommez-les dans le classeur.`,
              pt: `Estes varNames são nomes de variáveis de inquérito e ocultariam as colunas do conjunto de dados no código dos outros indicadores: ${shadowing.join(", ")}. Renomeie-os no livro.`,
            }),
          };
        }
      }

      const code = applyTimePointMapping(p.shape, finalMapping);

      const seenKeys = new Set<string>();
      const duplicateKeys = new Set<string>();
      for (const c of code) {
        const key = `${c.varName} / ${c.timePoint}`;
        if (seenKeys.has(key)) duplicateKeys.add(key);
        seenKeys.add(key);
      }
      if (duplicateKeys.size > 0) {
        return {
          success: false,
          err: t3({
            en: `The workbook produces duplicate code rows for: ${[...duplicateKeys].join("; ")}. Each indicator can have only one code entry per time point.`,
            fr: `Le classeur produit des lignes de code en double pour : ${[...duplicateKeys].join("; ")}. Chaque indicateur ne peut avoir qu'une seule entrée de code par point temporel.`,
            pt: `O livro produz linhas de código duplicadas para: ${[...duplicateKeys].join("; ")}. Cada indicador só pode ter uma entrada de código por ponto temporal.`,
          }),
        };
      }

      const filterOnly = code.filter(
        (c) => !c.rCode.trim() && (c.rFilterCode ?? "").trim(),
      );
      if (filterOnly.length > 0) {
        return {
          success: false,
          err: t3({
            en: `Filter code requires R code. Rows with filter code but no R code: ${filterOnly.map((c) => `${c.varName} / ${c.timePoint}`).join("; ")}.`,
            fr: `Le code filtre nécessite un code R. Lignes avec un code filtre mais sans code R : ${filterOnly.map((c) => `${c.varName} / ${c.timePoint}`).join("; ")}.`,
            pt: `O código de filtro requer código R. Linhas com código de filtro mas sem código R: ${filterOnly.map((c) => `${c.varName} / ${c.timePoint}`).join("; ")}.`,
          }),
        };
      }

      const variantCode = applyVariantTimePointMapping(p.shape, finalMapping);

      return await serverActions.importHfaIndicatorsWorkbook({
        categories: p.shape.categories,
        subCategories: p.shape.subCategories,
        serviceCategories: p.shape.serviceCategories,
        variantGroups: p.shape.variantGroups,
        variantItems: p.shape.variantItems,
        indicators: p.shape.indicators,
        code,
        variantCode,
        replaceAll: p.uploadMode === "replace",
      });
    },
    async (data) => {
      if (data.skippedExisting.length > 0) {
        await openAlert({
          title: t3({ en: "Import complete", fr: "Importation terminée", pt: "Importação concluída" }),
          text: t3({
            en: `Imported ${data.imported} new indicator(s); ${data.skippedExisting.length} existing were skipped (add mode does not modify existing indicators): ${data.skippedExisting.join(", ")}`,
            fr: `${data.imported} nouveau(x) indicateur(s) importé(s) ; ${data.skippedExisting.length} existant(s) ont été ignoré(s) (le mode ajout ne modifie pas les indicateurs existants) : ${data.skippedExisting.join(", ")}`,
            pt: `${data.imported} novo(s) indicador(es) importado(s); ${data.skippedExisting.length} existente(s) foram ignorado(s) (o modo adicionar não modifica os indicadores existentes): ${data.skippedExisting.join(", ")}`,
          }),
        });
      }
      p.onDone();
    },
  );

  return (
    <>
      <div class="font-700 text-base">
        {t3({ en: "Map time points", fr: "Mapper les points temporels", pt: "Mapear pontos temporais" })}
      </div>
      <div class="text-base-content-muted text-sm">
        {t3({
          en: `XLSX has ${N} code column(s). Platform has ${M} time point(s).`,
          fr: `Le classeur contient ${N} colonne(s) de code. La plateforme a ${M} point(s) temporel(s).`,
          pt: `O XLSX tem ${N} coluna(s) de código. A plataforma tem ${M} ponto(s) temporal(is).`,
        })}
      </div>

      <Show when={isAutoSingle}>
        <div class="text-success text-sm">
          {t3({
            en: `Auto-mapped: the single code column will be imported into "${p.timePoints[0]}".`,
            fr: `Mappage automatique : la colonne de code unique sera importée dans « ${p.timePoints[0]} ».`,
            pt: `Mapeamento automático: a única coluna de código será importada para "${p.timePoints[0]}".`,
          })}
        </div>
      </Show>

      <Show when={isApplyOneOrAll}>
        <RadioGroup
          label={t3({
            en: "How to apply the single code column:",
            fr: "Comment appliquer la colonne de code unique :",
            pt: "Como aplicar a única coluna de código:",
          })}
          options={[
            {
              value: "all",
              label: t3({
                en: `Apply to all ${M} time points`,
                fr: `Appliquer aux ${M} points temporels`,
                pt: `Aplicar a todos os ${M} pontos temporais`,
              }),
            },
            {
              value: "one",
              label: t3({
                en: "Apply to one specific time point:",
                fr: "Appliquer à un point temporel spécifique :",
                pt: "Aplicar a um ponto temporal específico:",
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
              pt: "As etiquetas dos pontos temporais estão incorporadas no ficheiro. Verifique o mapeamento abaixo.",
            })}
          </div>
        </Show>
        <Show when={isMismatch}>
          <div class="text-warning text-xs">
            {t3({
              en: "The number of code columns in the XLSX does not match the number of platform time points. Map each XLSX column to a platform time point, or skip it.",
              fr: "Le nombre de colonnes de code dans le XLSX ne correspond pas au nombre de points temporels de la plateforme. Mappez chaque colonne XLSX à un point temporel ou ignorez-la.",
              pt: "O número de colunas de código no XLSX não corresponde ao número de pontos temporais da plataforma. Associe cada coluna do XLSX a um ponto temporal ou ignore-a.",
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

      <Show when={p.uploadMode === "replace"}>
        <div class="text-danger font-700 text-sm">
          {t3({
            en: "Replace mode permanently deletes ALL existing indicators, categories, sub-categories, and service categories before importing.",
            fr: "Le mode remplacement supprime définitivement TOUS les indicateurs, catégories, sous-catégories et catégories de service existants avant l'importation.",
            pt: "O modo de substituição elimina definitivamente TODOS os indicadores, categorias, subcategorias e categorias de serviço existentes antes da importação.",
          })}
        </div>
        <div class="text-sm">
          {t3({ en: "To confirm, write", fr: "Pour confirmer, écrivez", pt: "Para confirmar, escreva" })}{" "}
          <span class="font-700">yes please delete</span>{" "}
          {t3({ en: "in the input box", fr: "dans le champ de saisie", pt: "no campo de introdução" })}
        </div>
        <div class="w-96">
          <Input value={replaceCheckText()} onChange={setReplaceCheckText} />
        </div>
      </Show>
      <StateHolderFormError state={doImport.state()} />
      <div class="ui-gap-sm flex">
        <Button
          onClick={doImport.click}
          state={doImport.state()}
          intent="primary"
          iconName="upload"
          disabled={!replaceConfirmed()}
        >
          {t3({ en: "Import", fr: "Importer", pt: "Importar" })}
        </Button>
        <Button onClick={p.onBack} intent="neutral" iconName="chevronLeft">
          {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
        </Button>
      </div>
    </>
  );
}
