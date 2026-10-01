import {
  ALL_DATA_SCOPE_DEFINITION,
  ALL_DATA_SCOPE_ID,
  type APIResponseWithData,
  type DatasetType,
  getCalendar,
  getModuleFamilyLabel,
  MODULE_FAMILY_ORDER,
  periodIdForDate,
  type Scope,
  type ScopeDefinition,
  t3,
  type YearRange,
} from "lib";
import {
  type AlertComponentProps,
  Checkbox,
  createDeleteAction,
  createFormAction,
  createQuery,
  DoubleSlider,
  Input,
  ModalContainer,
  MultiSelectSearch,
  type SelectOption,
  StateHolderWrapper,
  TabsNavigation,
} from "panther";
import { type Accessor, createSignal, Match, Show, Switch } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState, resolveScope } from "~/state/instance/t1_store";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";
import {
  AreaPicker,
  type AreaSelection,
  areaSelectionFromStored,
} from "./area_picker";

type Props = {
  // undefined = a new scope.
  scope: Scope | undefined;
  productCount: number;
};

type Option = SelectOption<string>;

type FamilyOptions = { modules: Option[]; indicators: Option[] };

type ScopeOptions = {
  families: Record<DatasetType, FamilyOptions>;
  hfaTimePoints: Option[];
  // Why the module and indicator lists are empty, when the read failed.
  err: string | undefined;
};

// A scope is independent of packages, so there is no one list of the modules
// and indicators a definition may name. The editor offers what the pinned
// package holds (the first ready package when nothing is pinned), read under
// "All data", and the HFA time points of the instance. With no ready package,
// or when that read fails, the lists are empty and a definition keeps what it
// already names: the editor's controls never depend on the read succeeding.
async function loadScopeOptions(): Promise<APIResponseWithData<ScopeOptions>> {
  const hfaTimePoints = instanceState.hfaTimePoints.map((tp) => ({
    value: tp.label,
    label: tp.label,
  }));
  const none: FamilyOptions = { modules: [], indicators: [] };
  const empty = (err: string | undefined) => ({
    success: true as const,
    data: {
      families: { hmis: none, hfa: none, iceh: none },
      hfaTimePoints,
      err,
    },
  });
  const pkg = instanceState.readyPackages.find(
    (p) => p.id === instanceState.pinnedRunId,
  ) ?? instanceState.readyPackages.at(0);
  if (pkg === undefined) return empty(undefined);
  const res = await getRunAuthoringContextFromCacheOrFetch(
    resolveScope({ runId: pkg.id, scopeId: ALL_DATA_SCOPE_ID }),
  );
  if (res.success === false) return empty(res.err);
  const withId = (o: { id: string; label: string }) => ({
    value: o.id,
    label: `${o.label} (${o.id})`,
  });
  const modulesOf = (family: DatasetType) =>
    res.data.modules.filter((m) => m.family === family).map(withId);
  return {
    success: true,
    data: {
      families: {
        hmis: {
          modules: modulesOf("hmis"),
          indicators: res.data.hmisIndicators.map(withId),
        },
        hfa: {
          modules: modulesOf("hfa"),
          indicators: res.data.hfaTaxonomy.indicators.map(withId),
        },
        iceh: {
          modules: modulesOf("iceh"),
          indicators: res.data.icehIndicators.map(withId),
        },
      },
      hfaTimePoints,
      err: undefined,
    },
  };
}

// A stored value the offered options lack stays in the list, annotated, so
// saving the editor never drops it. Computed once from the stored list: the
// options must not change while the user toggles.
function withStoredValues(
  offered: Option[],
  stored: string[] | null,
): Option[] {
  const offeredValues = new Set(offered.map((o) => o.value));
  const orphans = (stored ?? []).filter((v) => !offeredValues.has(v));
  return [
    ...orphans.map((value) => ({
      value,
      label: `${value} (${
        t3({
          en: "not in the current options",
          fr: "absent des options actuelles",
          pt: "não consta das opções atuais",
        })
      })`,
    })),
    ...offered,
  ];
}

function LimitedList(p: {
  limitLabel: string;
  values: string[] | null;
  onChange: (values: string[] | null) => void;
  options: Option[];
}) {
  return (
    <div class="ui-spy-sm">
      <Checkbox
        label={p.limitLabel}
        checked={p.values !== null}
        onChange={(checked) => p.onChange(checked ? [] : null)}
      />
      <Show when={p.values !== null}>
        <MultiSelectSearch
          values={p.values ?? []}
          options={p.options}
          onChange={p.onChange}
          placeholder={t3({
            en: "Select at least one",
            fr: "Sélectionnez-en au moins un",
            pt: "Selecione pelo menos um",
          })}
          fullWidth
        />
      </Show>
    </div>
  );
}

// The year slider's track: 2000 to the current year, in the calendar the
// family's years are stored in. HMIS periods are in the instance calendar;
// ICEH years are the survey years of the ICEH export, always Gregorian.
function yearBounds(family: DatasetType): YearRange {
  const calendar = family === "hmis" ? getCalendar() : "gregorian";
  const yearOf = (date: Date) =>
    Math.floor(periodIdForDate(calendar, date) / 100);
  return { start: yearOf(new Date(2000, 0, 1)), end: yearOf(new Date()) };
}

// Every dimension any family has, so one draft serves the three sections.
// Each tab shows, and each built section keeps, only its own family's.
type SectionFields = {
  include: boolean;
  adminArea2: string | null;
  years: YearRange | null;
  timePoints: string[] | null;
  modules: string[] | null;
  indicators: string[] | null;
};

function sectionFields(
  section: ScopeDefinition[DatasetType],
): SectionFields {
  const included = section.include ? section : undefined;
  return {
    include: section.include,
    adminArea2: included !== undefined && "adminArea2" in included
      ? included.adminArea2
      : null,
    years: included !== undefined && "years" in included
      ? included.years
      : null,
    timePoints: included !== undefined && "timePoints" in included
      ? included.timePoints
      : null,
    modules: included?.modules ?? null,
    indicators: included?.indicators ?? null,
  };
}

// The lists are copied out of the stored definition, which is a T1 store
// object: the draft is one snapshot, and a `scopes_updated` that arrives while
// the editor is open changes nothing in it.
function createSectionDraft(stored: SectionFields) {
  const copy = (list: string[] | null) => list === null ? null : [...list];
  const [include, setInclude] = createSignal(stored.include);
  const [area, setArea] = createSignal<AreaSelection>(
    areaSelectionFromStored(stored.adminArea2),
  );
  const [years, setYears] = createSignal(
    stored.years === null ? null : { ...stored.years },
  );
  const [timePoints, setTimePoints] = createSignal(copy(stored.timePoints));
  const [modules, setModules] = createSignal(copy(stored.modules));
  const [indicators, setIndicators] = createSignal(copy(stored.indicators));
  return {
    stored,
    include,
    setInclude,
    area,
    setArea,
    years,
    setYears,
    timePoints,
    setTimePoints,
    modules,
    setModules,
    indicators,
    setIndicators,
  };
}

type SectionDraft = ReturnType<typeof createSectionDraft>;

const HAS_YEARS: Record<DatasetType, boolean> = {
  hmis: true,
  hfa: false,
  iceh: true,
};

function draftArea(draft: SectionDraft): APIResponseWithData<string | null> {
  const area = draft.area();
  if (area.mode === "all") return { success: true, data: null };
  return area.adminArea2 === undefined
    ? {
      success: false,
      err: t3({
        en: "Select an area, or choose every area",
        fr: "Sélectionnez une zone, ou choisissez toutes les zones",
        pt: "Selecione uma zona, ou escolha todas as zonas",
      }),
    }
    : { success: true, data: area.adminArea2 };
}

// The schema refuses an empty list: it would match no data, which is what
// leaving the family out says.
function draftList(
  list: string[] | null,
): APIResponseWithData<string[] | null> {
  return list !== null && list.length === 0
    ? {
      success: false,
      err: t3({
        en:
          "A limit with nothing selected matches no data. Select at least one, or remove the limit",
        fr:
          "Une limite sans sélection ne correspond à aucune donnée. Sélectionnez-en au moins un, ou retirez la limite",
        pt:
          "Um limite sem seleção não corresponde a nenhum dado. Selecione pelo menos um, ou remova o limite",
      }),
    }
    : { success: true, data: list };
}

function buildDefinition(
  drafts: Record<DatasetType, SectionDraft>,
): APIResponseWithData<ScopeDefinition> {
  // An error is named by its family, since its tab may not be the open one.
  const failed = (family: DatasetType, err: string) => ({
    success: false as const,
    err: `${getModuleFamilyLabel(family)}: ${err}`,
  });
  const common = (family: DatasetType) => {
    const modules = draftList(drafts[family].modules());
    if (modules.success === false) return failed(family, modules.err);
    const indicators = draftList(drafts[family].indicators());
    if (indicators.success === false) return failed(family, indicators.err);
    return {
      success: true as const,
      data: {
        include: true as const,
        modules: modules.data,
        indicators: indicators.data,
      },
    };
  };

  let hmis: ScopeDefinition["hmis"] = { include: false };
  if (drafts.hmis.include()) {
    const base = common("hmis");
    if (base.success === false) return base;
    const area = draftArea(drafts.hmis);
    if (area.success === false) return failed("hmis", area.err);
    hmis = { ...base.data, adminArea2: area.data, years: drafts.hmis.years() };
  }
  let hfa: ScopeDefinition["hfa"] = { include: false };
  if (drafts.hfa.include()) {
    const base = common("hfa");
    if (base.success === false) return base;
    const area = draftArea(drafts.hfa);
    if (area.success === false) return failed("hfa", area.err);
    const timePoints = draftList(drafts.hfa.timePoints());
    if (timePoints.success === false) return failed("hfa", timePoints.err);
    hfa = { ...base.data, adminArea2: area.data, timePoints: timePoints.data };
  }
  let iceh: ScopeDefinition["iceh"] = { include: false };
  if (drafts.iceh.include()) {
    const base = common("iceh");
    if (base.success === false) return base;
    iceh = { ...base.data, years: drafts.iceh.years() };
  }
  return { success: true, data: { hmis, hfa, iceh } };
}

// One family's tab: the include switch, then that family's own dimensions.
function SectionTab(p: {
  family: DatasetType;
  draft: SectionDraft;
  options: FamilyOptions;
  timePointOptions: Option[];
}) {
  const name = () => getModuleFamilyLabel(p.family);
  // Once per tab: the options must not change while the user toggles.
  const moduleOptions = withStoredValues(
    p.options.modules,
    p.draft.stored.modules,
  );
  const indicatorOptions = withStoredValues(
    p.options.indicators,
    p.draft.stored.indicators,
  );
  const timePointOptions = withStoredValues(
    p.timePointOptions,
    p.draft.stored.timePoints,
  );
  return (
    <div class="ui-spy">
      <Checkbox
        label={t3({
          en: `Include ${name()}`,
          fr: `Inclure ${name()}`,
          pt: `Incluir ${name()}`,
        })}
        checked={p.draft.include()}
        onChange={p.draft.setInclude}
      />
      <Show
        when={p.draft.include()}
        fallback={
          <div class="text-base-content-muted text-sm">
            {t3({
              en:
                `This scope shows no ${name()} data: every ${name()} table is empty and no ${name()} module is offered.`,
              fr:
                `Cette portée ne montre aucune donnée ${name()} : chaque tableau ${name()} est vide et aucun module ${name()} n'est proposé.`,
              pt:
                `Este âmbito não mostra dados ${name()}: todas as tabelas ${name()} ficam vazias e nenhum módulo ${name()} é oferecido.`,
            })}
          </div>
        }
      >
        <Show
          when={p.family === "hmis" || p.family === "hfa"
            ? p.family
            : undefined}
        >
          {(facilityFamily) => (
            <AreaPicker
              family={facilityFamily()}
              selection={p.draft.area()}
              onChange={p.draft.setArea}
            />
          )}
        </Show>
        <Show when={HAS_YEARS[p.family]}>
          <div class="ui-spy-sm">
            <Checkbox
              label={t3({
                en: "Limit years",
                fr: "Limiter les années",
                pt: "Limitar os anos",
              })}
              checked={p.draft.years() !== null}
              onChange={(checked) =>
                p.draft.setYears(checked ? yearBounds(p.family) : null)}
            />
            <Show when={p.draft.years()}>
              {(years) => (
                <div>
                  <DoubleSlider
                    min={yearBounds(p.family).start}
                    max={yearBounds(p.family).end}
                    increment={1}
                    valueLow={years().start}
                    valueHigh={years().end}
                    onChangeLow={(start) =>
                      p.draft.setYears((prev) => prev && { ...prev, start })}
                    onChangeHigh={(end) =>
                      p.draft.setYears((prev) => prev && { ...prev, end })}
                    fullWidth
                  />
                  <div class="pt-3">
                    {years().start} {t3({ en: "to", fr: "à", pt: "a" })}{" "}
                    {years().end}
                  </div>
                </div>
              )}
            </Show>
          </div>
        </Show>
        <Show when={p.family === "hfa"}>
          <LimitedList
            limitLabel={t3({
              en: "Limit time points",
              fr: "Limiter les points temporels",
              pt: "Limitar os pontos temporais",
            })}
            values={p.draft.timePoints()}
            onChange={p.draft.setTimePoints}
            options={timePointOptions}
          />
        </Show>
        <LimitedList
          limitLabel={t3({
            en: "Limit modules",
            fr: "Limiter les modules",
            pt: "Limitar os módulos",
          })}
          values={p.draft.modules()}
          onChange={p.draft.setModules}
          options={moduleOptions}
        />
        <LimitedList
          limitLabel={t3({
            en: "Limit indicators",
            fr: "Limiter les indicateurs",
            pt: "Limitar os indicadores",
          })}
          values={p.draft.indicators()}
          onChange={p.draft.setIndicators}
          options={indicatorOptions}
        />
      </Show>
    </div>
  );
}

function ProductCountLine(p: { productCount: number; reserved: boolean }) {
  return (
    <div class="text-base-content-muted text-sm">
      <Switch>
        <Match when={p.productCount === 0}>
          {t3({
            en: "No product carries this scope.",
            fr: "Aucun produit ne porte cette portée.",
            pt: "Nenhum produto tem este âmbito.",
          })}
        </Match>
        <Match when={p.reserved}>
          {t3({
            en: `${p.productCount} product(s) carry this scope.`,
            fr: `${p.productCount} produit(s) portent cette portée.`,
            pt: `${p.productCount} produto(s) têm este âmbito.`,
          })}
        </Match>
        <Match when={true}>
          {t3({
            en:
              `${p.productCount} product(s) carry this scope, so it cannot be deleted. Changing what it limits marks every visualization in them as out of date.`,
            fr:
              `${p.productCount} produit(s) portent cette portée, elle ne peut donc pas être supprimée. Modifier ce qu'elle limite marque chaque visualisation de ces produits comme obsolète.`,
            pt:
              `${p.productCount} produto(s) têm este âmbito, pelo que não pode ser eliminado. Alterar o que ele limita marca todas as visualizações desses produtos como desatualizadas.`,
          })}
        </Match>
      </Switch>
    </div>
  );
}

// "All data" is the one reserved scope: the routes refuse to edit or delete
// it, so it opens as a statement of what it is.
export function AllDataScopeView(
  p: AlertComponentProps<{ scope: Scope; productCount: number }, undefined>,
) {
  return (
    <ModalContainer
      title={p.scope.label}
      width="md"
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Close", fr: "Fermer", pt: "Fechar" }),
        onClick: () => p.close(undefined),
      }]}
    >
      <div class="ui-spy">
        <div>
          {t3({
            en:
              "This scope is built in. It includes HMIS, HFA and ICEH data and limits nothing. It cannot be edited or deleted.",
            fr:
              "Cette portée est intégrée. Elle inclut les données HMIS, HFA et ICEH et ne limite rien. Elle ne peut être ni modifiée ni supprimée.",
            pt:
              "Este âmbito é incorporado. Inclui os dados HMIS, HFA e ICEH e não limita nada. Não pode ser editado nem eliminado.",
          })}
        </div>
        <ProductCountLine productCount={p.productCount} reserved />
      </div>
    </ModalContainer>
  );
}

export function ScopeEditor(
  p: AlertComponentProps<Props, undefined>,
) {
  const stored = p.scope?.definition ?? ALL_DATA_SCOPE_DEFINITION;
  const optionsQuery = createQuery(loadScopeOptions);

  const [tempLabel, setTempLabel] = createSignal(p.scope?.label ?? "");
  const drafts: Record<DatasetType, SectionDraft> = {
    hmis: createSectionDraft(sectionFields(stored.hmis)),
    hfa: createSectionDraft(sectionFields(stored.hfa)),
    iceh: createSectionDraft(sectionFields(stored.iceh)),
  };
  const [tab, setTab] = createSignal<DatasetType>("hmis");
  const tabs: Accessor<{ id: DatasetType; label: string }[]> = () =>
    MODULE_FAMILY_ORDER.map((family) => ({
      id: family,
      label: getModuleFamilyLabel(family),
    }));

  const save = createFormAction(
    async (e: MouseEvent) => {
      e.preventDefault();
      const label = tempLabel().trim();
      if (label === "") {
        return {
          success: false,
          err: t3({
            en: "Enter a label",
            fr: "Saisissez un libellé",
            pt: "Introduza uma etiqueta",
          }),
        };
      }
      const definition = buildDefinition(drafts);
      if (definition.success === false) return definition;
      const body = { label, definition: definition.data };
      return p.scope === undefined
        ? await serverActions.createScope(body)
        : await serverActions.updateScope({ scope_id: p.scope.id, ...body });
    },
    () => p.close(undefined),
  );

  const scopeId = p.scope?.id;
  const attemptDelete = scopeId === undefined ? undefined : createDeleteAction(
    t3({
      en: "Are you sure you want to delete this scope?",
      fr: "Êtes-vous sûr de vouloir supprimer cette portée ?",
      pt: "Tem a certeza de que pretende eliminar este âmbito?",
    }),
    () => serverActions.deleteScope({ scope_id: scopeId }),
    () => p.close(undefined),
  );

  return (
    <ModalContainer
      title={p.scope === undefined
        ? t3({ en: "New scope", fr: "Nouvelle portée", pt: "Novo âmbito" })
        : t3({
          en: "Edit scope",
          fr: "Modifier la portée",
          pt: "Editar âmbito",
        })}
      width="lg"
      height="lg"
      form
      onCancel={() => p.close(undefined)}
      actions={[
        ...(attemptDelete === undefined ? [] : [{
          label: t3({ en: "Delete", fr: "Supprimer", pt: "Eliminar" }),
          onClick: () => void attemptDelete.click(),
          intent: "danger" as const,
          outline: true,
          disabled: p.productCount > 0,
        }]),
        {
          label: t3({ en: "Save", fr: "Enregistrer", pt: "Guardar" }),
          onClick: save.click,
          state: save.state(),
        },
      ]}
    >
      <div class="ui-spy">
        <Input
          label={t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" })}
          value={tempLabel()}
          onChange={setTempLabel}
          autoFocus
          fullWidth
        />
        <Show when={p.scope !== undefined}>
          <ProductCountLine productCount={p.productCount} reserved={false} />
        </Show>
        <div class="text-base-content-muted text-sm">
          {t3({
            en:
              "Each family has its own limits. A limit applies to a table only when the table has a column for it. A table without one is shown whole, unless its module is outside the family's module limit.",
            fr:
              "Chaque famille a ses propres limites. Une limite s'applique à un tableau seulement s'il a une colonne correspondante. Un tableau sans cette colonne est affiché en entier, sauf si son module est hors de la limite de modules de la famille.",
            pt:
              "Cada família tem os seus próprios limites. Um limite aplica-se a uma tabela apenas quando esta tem uma coluna correspondente. Uma tabela sem essa coluna é mostrada por inteiro, exceto se o seu módulo estiver fora do limite de módulos da família.",
          })}
        </div>
        <TabsNavigation
          items={tabs()}
          value={tab()}
          onChange={setTab}
          noPad
        />
        <StateHolderWrapper state={optionsQuery.state()}>
          {(options) => (
            <>
              <Show when={options.err}>
                {(err) => (
                  <div class="text-danger text-sm">
                    {t3({
                      en:
                        "The modules and indicators of the current package could not be read, so none are offered:",
                      fr:
                        "Les modules et indicateurs du paquet actuel n'ont pas pu être lus, aucun n'est donc proposé :",
                      pt:
                        "Não foi possível ler os módulos e indicadores do pacote atual, pelo que nenhum é oferecido:",
                    })} {err()}
                  </div>
                )}
              </Show>
              <Switch>
                {MODULE_FAMILY_ORDER.map((family) => (
                  <Match when={tab() === family}>
                    <SectionTab
                      family={family}
                      draft={drafts[family]}
                      options={options.families[family]}
                      timePointOptions={options.hfaTimePoints}
                    />
                  </Match>
                ))}
              </Switch>
            </>
          )}
        </StateHolderWrapper>
      </div>
    </ModalContainer>
  );
}
