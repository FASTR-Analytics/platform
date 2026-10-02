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
import { scopeDisplayLabel } from "~/components/_shared/mod.ts";
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

// "All data" is the one reserved scope: the routes refuse to edit or delete
// it, so it opens as a statement of what it is.
export function AllDataScopeView(
  p: AlertComponentProps<{ scope: Scope; productCount: number }, undefined>,
) {
  return (
    <ModalContainer
      title={scopeDisplayLabel(p.scope)}
      width="md"
      onClose={{ kind: "close", onClick: () => p.close(undefined) }}
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
      if (definition.success === false) {
        return definition;
      }
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
                      hfaOptions={options.hfa}
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

type Option = SelectOption<string>;

type FamilyOptions = { modules: Option[]; indicators: Option[] };

type HfaOptions = {
  timePoints: Option[];
  categories: Option[];
  serviceCategories: Option[];
};

type ScopeOptions = {
  families: Record<DatasetType, FamilyOptions>;
  hfa: HfaOptions;
  // Why the module and indicator lists are empty, when the read failed.
  err: string | undefined;
};

// A scope is independent of packages, so there is no one list of the modules
// and indicators a definition may name. The editor offers what the pinned
// package holds (the first ready package when nothing is pinned), read under
// "All data" (the HFA categories and service categories with them), and the
// HFA time points of the instance. With no ready package, or when that read
// fails, the lists are empty and a definition keeps what it already names:
// the editor's controls never depend on the read succeeding.
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
      hfa: { timePoints: hfaTimePoints, categories: [], serviceCategories: [] },
      err,
    },
  });
  const pkg = instanceState.readyPackages.find(
    (p) => p.id === instanceState.pinnedRunId,
  ) ?? instanceState.readyPackages.at(0);
  if (pkg === undefined) {
    return empty(undefined);
  }
  const res = await getRunAuthoringContextFromCacheOrFetch(
    resolveScope({ runId: pkg.id, scopeId: ALL_DATA_SCOPE_ID }),
  );
  if (res.success === false) {
    return empty(res.err);
  }
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
      hfa: {
        timePoints: hfaTimePoints,
        categories: res.data.hfaTaxonomy.categories.map(withId),
        serviceCategories: res.data.hfaTaxonomy.serviceCategories.map(withId),
      },
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
  categories: string[] | null;
  serviceCategories: string[] | null;
  modules: string[] | null;
  indicators: string[] | null;
};

// The lists are copied out of the stored definition, which is a T1 store
// object: the draft is one snapshot, and a `scopes_updated` that arrives while
// the editor is open changes nothing in it.
function sectionFields(
  section: ScopeDefinition[DatasetType],
): SectionFields {
  const included = section.include ? section : undefined;
  const copy = (list: string[] | null) => list === null ? null : [...list];
  return {
    include: section.include,
    adminArea2: included !== undefined && "adminArea2" in included
      ? included.adminArea2
      : null,
    years: included !== undefined && "years" in included
      ? included.years === null ? null : { ...included.years }
      : null,
    timePoints: included !== undefined && "timePoints" in included
      ? copy(included.timePoints)
      : null,
    categories: included !== undefined && "categories" in included
      ? copy(included.categories)
      : null,
    serviceCategories: included !== undefined && "serviceCategories" in included
      ? copy(included.serviceCategories)
      : null,
    modules: copy(included?.modules ?? null),
    indicators: copy(included?.indicators ?? null),
  };
}

function createSectionDraft(stored: SectionFields) {
  const [include, setInclude] = createSignal(stored.include);
  const [area, setArea] = createSignal<AreaSelection>(
    areaSelectionFromStored(stored.adminArea2),
  );
  const [years, setYears] = createSignal(stored.years);
  const [timePoints, setTimePoints] = createSignal(stored.timePoints);
  const [categories, setCategories] = createSignal(stored.categories);
  const [serviceCategories, setServiceCategories] = createSignal(
    stored.serviceCategories,
  );
  const [modules, setModules] = createSignal(stored.modules);
  const [indicators, setIndicators] = createSignal(stored.indicators);
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
    categories,
    setCategories,
    serviceCategories,
    setServiceCategories,
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
  if (area.mode === "all") {
    return { success: true, data: null };
  }
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
  const hmis = buildHmisSection(drafts.hmis);
  if (hmis.success === false) {
    return failed("hmis", hmis.err);
  }
  const hfa = buildHfaSection(drafts.hfa);
  if (hfa.success === false) {
    return failed("hfa", hfa.err);
  }
  const iceh = buildIcehSection(drafts.iceh);
  if (iceh.success === false) {
    return failed("iceh", iceh.err);
  }
  return {
    success: true,
    data: { hmis: hmis.data, hfa: hfa.data, iceh: iceh.data },
  };
}

type BuiltSection<F extends DatasetType> = APIResponseWithData<
  ScopeDefinition[F]
>;

function buildCommonLimits(draft: SectionDraft): APIResponseWithData<
  { include: true; modules: string[] | null; indicators: string[] | null }
> {
  const modules = draftList(draft.modules());
  if (modules.success === false) {
    return modules;
  }
  const indicators = draftList(draft.indicators());
  if (indicators.success === false) {
    return indicators;
  }
  return {
    success: true,
    data: { include: true, modules: modules.data, indicators: indicators.data },
  };
}

function buildHmisSection(draft: SectionDraft): BuiltSection<"hmis"> {
  if (!draft.include()) {
    return { success: true, data: { include: false } };
  }
  const base = buildCommonLimits(draft);
  if (base.success === false) {
    return base;
  }
  const area = draftArea(draft);
  if (area.success === false) {
    return area;
  }
  return {
    success: true,
    data: { ...base.data, adminArea2: area.data, years: draft.years() },
  };
}

function buildHfaSection(draft: SectionDraft): BuiltSection<"hfa"> {
  if (!draft.include()) {
    return { success: true, data: { include: false } };
  }
  const base = buildCommonLimits(draft);
  if (base.success === false) {
    return base;
  }
  const area = draftArea(draft);
  if (area.success === false) {
    return area;
  }
  const timePoints = draftList(draft.timePoints());
  if (timePoints.success === false) {
    return timePoints;
  }
  const categories = draftList(draft.categories());
  if (categories.success === false) {
    return categories;
  }
  const serviceCategories = draftList(draft.serviceCategories());
  if (serviceCategories.success === false) {
    return serviceCategories;
  }
  return {
    success: true,
    data: {
      ...base.data,
      adminArea2: area.data,
      timePoints: timePoints.data,
      categories: categories.data,
      serviceCategories: serviceCategories.data,
    },
  };
}

function buildIcehSection(draft: SectionDraft): BuiltSection<"iceh"> {
  if (!draft.include()) {
    return { success: true, data: { include: false } };
  }
  const base = buildCommonLimits(draft);
  if (base.success === false) {
    return base;
  }
  return { success: true, data: { ...base.data, years: draft.years() } };
}

// One family's tab: the include switch, then that family's own dimensions.
function SectionTab(p: {
  family: DatasetType;
  draft: SectionDraft;
  options: FamilyOptions;
  hfaOptions: HfaOptions;
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
    p.hfaOptions.timePoints,
    p.draft.stored.timePoints,
  );
  const categoryOptions = withStoredValues(
    p.hfaOptions.categories,
    p.draft.stored.categories,
  );
  const serviceCategoryOptions = withStoredValues(
    p.hfaOptions.serviceCategories,
    p.draft.stored.serviceCategories,
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
                  <div class="ui-pad-t-sm">
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
          <LimitedList
            limitLabel={t3({
              en: "Limit categories",
              fr: "Limiter les catégories",
              pt: "Limitar as categorias",
            })}
            values={p.draft.categories()}
            onChange={p.draft.setCategories}
            options={categoryOptions}
          />
          <LimitedList
            limitLabel={t3({
              en: "Limit service categories",
              fr: "Limiter les catégories de service",
              pt: "Limitar as categorias de serviço",
            })}
            values={p.draft.serviceCategories()}
            onChange={p.draft.setServiceCategories}
            options={serviceCategoryOptions}
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
        <Match when={p.productCount > 0 && p.reserved}>
          {t3({
            en: `${p.productCount} product(s) carry this scope.`,
            fr: `${p.productCount} produit(s) portent cette portée.`,
            pt: `${p.productCount} produto(s) têm este âmbito.`,
          })}
        </Match>
        <Match when={p.productCount > 0 && !p.reserved}>
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
