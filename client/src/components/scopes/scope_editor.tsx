import {
  type APIResponseWithData,
  type Scope,
  type ScopeDefinition,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Checkbox,
  createDeleteAction,
  createFormAction,
  createQuery,
  Input,
  ModalContainer,
  MultiSelectSearch,
  type SelectOption,
  StateHolderWrapper,
} from "panther";
import { createSignal, Show } from "solid-js";
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

type ScopeOptions = {
  hfaTimePoints: Option[];
  modules: Option[];
  hmisIndicators: Option[];
  hfaIndicators: Option[];
  icehIndicators: Option[];
};

// A scope is independent of packages, so there is no one list of the modules
// and indicators a definition may name. The editor offers what the pinned
// package holds (the first ready package when nothing is pinned), read as the
// whole package, and the HFA time points of the instance. With no ready
// package the lists are empty and a definition keeps what it already names.
async function loadScopeOptions(): Promise<APIResponseWithData<ScopeOptions>> {
  const hfaTimePoints = instanceState.hfaTimePoints.map((tp) => ({
    value: tp.label,
    label: tp.label,
  }));
  const pkg = instanceState.readyPackages.find(
    (p) => p.id === instanceState.pinnedRunId,
  ) ?? instanceState.readyPackages.at(0);
  if (pkg === undefined) {
    return {
      success: true,
      data: {
        hfaTimePoints,
        modules: [],
        hmisIndicators: [],
        hfaIndicators: [],
        icehIndicators: [],
      },
    };
  }
  const res = await getRunAuthoringContextFromCacheOrFetch(
    resolveScope({ runId: pkg.id, scopeId: null }),
  );
  if (res.success === false) return res;
  const withId = (o: { id: string; label: string }) => ({
    value: o.id,
    label: `${o.label} (${o.id})`,
  });
  return {
    success: true,
    data: {
      hfaTimePoints,
      modules: res.data.modules.map(withId),
      hmisIndicators: res.data.hmisIndicators.map(withId),
      hfaIndicators: res.data.hfaTaxonomy.indicators.map(withId),
      icehIndicators: res.data.icehIndicators.map(withId),
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
      label: `${value} — ${
        t3({
          en: "not in the current options",
          fr: "absent des options actuelles",
          pt: "não consta das opções atuais",
        })
      }`,
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

function parseYear(text: string): number | undefined {
  return /^[1-9]\d{3}$/.test(text.trim()) ? Number(text.trim()) : undefined;
}

export function ScopeEditor(
  p: AlertComponentProps<Props, undefined>,
) {
  const stored = p.scope?.definition;
  const optionsQuery = createQuery(loadScopeOptions);

  const [tempLabel, setTempLabel] = createSignal(p.scope?.label ?? "");
  const [tempArea, setTempArea] = createSignal<AreaSelection>(
    areaSelectionFromStored(stored?.geography?.adminArea2 ?? null),
  );
  const [tempLimitYears, setTempLimitYears] = createSignal(
    (stored?.time.years ?? null) !== null,
  );
  const [tempStartYear, setTempStartYear] = createSignal(
    stored?.time.years ? String(stored.time.years.start) : "",
  );
  const [tempEndYear, setTempEndYear] = createSignal(
    stored?.time.years ? String(stored.time.years.end) : "",
  );
  const [tempTimePoints, setTempTimePoints] = createSignal(
    stored?.time.hfaTimePoints ?? null,
  );
  const [tempModules, setTempModules] = createSignal(stored?.modules ?? null);
  const [tempHmis, setTempHmis] = createSignal(
    stored?.indicators.hmis ?? null,
  );
  const [tempHfa, setTempHfa] = createSignal(stored?.indicators.hfa ?? null);
  const [tempIceh, setTempIceh] = createSignal(
    stored?.indicators.iceh ?? null,
  );

  function buildDefinition(): APIResponseWithData<ScopeDefinition> {
    const area = tempArea();
    if (area.mode === "single" && area.adminArea2 === undefined) {
      return {
        success: false,
        err: t3({
          en: "Select an area, or choose every area",
          fr: "Sélectionnez une zone, ou choisissez toutes les zones",
          pt: "Selecione uma zona, ou escolha todas as zonas",
        }),
      };
    }
    const start = parseYear(tempStartYear());
    const end = parseYear(tempEndYear());
    if (
      tempLimitYears() &&
      (start === undefined || end === undefined || start > end)
    ) {
      return {
        success: false,
        err: t3({
          en:
            "Enter a first and a last year as four digits, the first not after the last",
          fr:
            "Saisissez une première et une dernière année à quatre chiffres, la première n'étant pas postérieure à la dernière",
          pt:
            "Introduza um primeiro e um último ano com quatro dígitos, o primeiro não posterior ao último",
        }),
      };
    }
    const lists = [
      tempTimePoints(),
      tempModules(),
      tempHmis(),
      tempHfa(),
      tempIceh(),
    ];
    if (lists.some((list) => list !== null && list.length === 0)) {
      return {
        success: false,
        err: t3({
          en:
            "A limit with nothing selected matches no data. Select at least one, or remove the limit",
          fr:
            "Une limite sans sélection ne correspond à aucune donnée. Sélectionnez-en au moins un, ou retirez la limite",
          pt:
            "Um limite sem seleção não corresponde a nenhum dado. Selecione pelo menos um, ou remova o limite",
        }),
      };
    }
    return {
      success: true,
      data: {
        geography: area.mode === "single" && area.adminArea2 !== undefined
          ? { adminArea2: area.adminArea2 }
          : null,
        time: {
          years: tempLimitYears() && start !== undefined && end !== undefined
            ? { start, end }
            : null,
          hfaTimePoints: tempTimePoints(),
        },
        modules: tempModules(),
        indicators: { hmis: tempHmis(), hfa: tempHfa(), iceh: tempIceh() },
      },
    };
  }

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
      const definition = buildDefinition();
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
      <StateHolderWrapper state={optionsQuery.state()}>
        {(options) => {
          const timePointOptions = withStoredValues(
            options.hfaTimePoints,
            stored?.time.hfaTimePoints ?? null,
          );
          const moduleOptions = withStoredValues(
            options.modules,
            stored?.modules ?? null,
          );
          const hmisOptions = withStoredValues(
            options.hmisIndicators,
            stored?.indicators.hmis ?? null,
          );
          const hfaOptions = withStoredValues(
            options.hfaIndicators,
            stored?.indicators.hfa ?? null,
          );
          const icehOptions = withStoredValues(
            options.icehIndicators,
            stored?.indicators.iceh ?? null,
          );
          return (
            <div class="ui-spy">
              <Input
                label={t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" })}
                value={tempLabel()}
                onChange={setTempLabel}
                autoFocus
                fullWidth
              />
              <Show when={p.scope !== undefined}>
                <div class="text-base-content-muted text-sm">
                  {p.productCount === 0
                    ? t3({
                      en: "No product carries this scope.",
                      fr: "Aucun produit ne porte cette portée.",
                      pt: "Nenhum produto tem este âmbito.",
                    })
                    : t3({
                      en:
                        `${p.productCount} product(s) carry this scope, so it cannot be deleted. Changing what it limits marks every visualization in them as out of date.`,
                      fr:
                        `${p.productCount} produit(s) portent cette portée, elle ne peut donc pas être supprimée. Modifier ce qu'elle limite marque chaque visualisation de ces produits comme obsolète.`,
                      pt:
                        `${p.productCount} produto(s) têm este âmbito, pelo que não pode ser eliminado. Alterar o que ele limita marca todas as visualizações desses produtos como desatualizadas.`,
                    })}
                </div>
              </Show>
              <div class="text-base-content-muted text-sm">
                {t3({
                  en:
                    "A limit applies to a table only when the table has a column for it. A table without one is shown whole, unless its module is outside the module limit.",
                  fr:
                    "Une limite s'applique à un tableau seulement s'il a une colonne correspondante. Un tableau sans cette colonne est affiché en entier, sauf si son module est hors de la limite de modules.",
                  pt:
                    "Um limite aplica-se a uma tabela apenas quando esta tem uma coluna correspondente. Uma tabela sem essa coluna é mostrada por inteiro, exceto se o seu módulo estiver fora do limite de módulos.",
                })}
              </div>
              <AreaPicker selection={tempArea()} onChange={setTempArea} />
              <div class="ui-spy-sm">
                <Checkbox
                  label={t3({
                    en: "Limit years",
                    fr: "Limiter les années",
                    pt: "Limitar os anos",
                  })}
                  checked={tempLimitYears()}
                  onChange={setTempLimitYears}
                />
                <Show when={tempLimitYears()}>
                  <div class="ui-gap-sm flex items-end">
                    <Input
                      label={t3({
                        en: "First year",
                        fr: "Première année",
                        pt: "Primeiro ano",
                      })}
                      value={tempStartYear()}
                      onChange={setTempStartYear}
                    />
                    <Input
                      label={t3({
                        en: "Last year",
                        fr: "Dernière année",
                        pt: "Último ano",
                      })}
                      value={tempEndYear()}
                      onChange={setTempEndYear}
                    />
                  </div>
                </Show>
              </div>
              <LimitedList
                limitLabel={t3({
                  en: "Limit HFA time points",
                  fr: "Limiter les points temporels HFA",
                  pt: "Limitar os pontos temporais HFA",
                })}
                values={tempTimePoints()}
                onChange={setTempTimePoints}
                options={timePointOptions}
              />
              <LimitedList
                limitLabel={t3({
                  en: "Limit modules",
                  fr: "Limiter les modules",
                  pt: "Limitar os módulos",
                })}
                values={tempModules()}
                onChange={setTempModules}
                options={moduleOptions}
              />
              <LimitedList
                limitLabel={t3({
                  en: "Limit HMIS indicators",
                  fr: "Limiter les indicateurs HMIS",
                  pt: "Limitar os indicadores HMIS",
                })}
                values={tempHmis()}
                onChange={setTempHmis}
                options={hmisOptions}
              />
              <LimitedList
                limitLabel={t3({
                  en: "Limit HFA indicators",
                  fr: "Limiter les indicateurs HFA",
                  pt: "Limitar os indicadores HFA",
                })}
                values={tempHfa()}
                onChange={setTempHfa}
                options={hfaOptions}
              />
              <LimitedList
                limitLabel={t3({
                  en: "Limit ICEH indicators",
                  fr: "Limiter les indicateurs ICEH",
                  pt: "Limitar os indicadores ICEH",
                })}
                values={tempIceh()}
                onChange={setTempIceh}
                options={icehOptions}
              />
            </div>
          );
        }}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
