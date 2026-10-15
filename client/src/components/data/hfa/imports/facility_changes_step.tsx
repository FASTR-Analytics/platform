import {
  _RECODABLE_FACILITY_COLUMNS,
  type APIResponseWithData,
  decodeHfaAdminTuple,
  decodeRawCsvHeader,
  findEncodedCsvHeaderIgnoringCase,
  type HfaFacilityChange,
  type HfaFacilityChangeDecision,
  type HfaFacilityChangeGroup,
  type HfaFacilityChangeGroupDecision,
  type HfaFacilityChangesPreview,
  type HfaFacilityChangesReview,
  type HfaFacilityColumnGroup,
  type HfaFacilityColumns,
  type HfaFacilityRecodeRow,
  type HfaFacilitySource,
  type StructureRecodableColumn,
  type StructureRecodes,
  type StructureStagedColumnValues,
  type StructureStagedRecodeRows,
  t3,
  TC,
} from "lib";
import {
  Button,
  ButtonGroup,
  Callout,
  Checkbox,
  createTableConfig,
  plural,
  type StateHolder,
  StateHolderWrapper,
  Table,
  type TableColumn,
  type TableConfig,
  toNum0,
} from "panther";
import {
  batch,
  createEffect,
  createMemo,
  createSignal,
  For,
  Show,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  currentRecodeColumn,
  emptyRecodeEditorUi,
  RecodeEditor,
  type RecodeEditorUi,
} from "../../_shared/mod.ts";
import { facilityColumnLabel } from "./facility_column_label.ts";

const MAX_RECODE_VALUES = 200;

type AdminImpact = Pick<
  HfaFacilityChangesPreview,
  "adminAreasLost" | "adminPathsIntroduced"
>;

export type HfaChangesFetch = (args: {
  decisions: HfaFacilityChangeGroupDecision[];
  contextHeaders: string[];
}) => Promise<APIResponseWithData<HfaFacilityChangesReview>>;

// The user's decisions, kept by change group and facility so that a reloaded
// review keeps every decision whose change is still there. A column's rule
// decides the changes whose cell has no source and no decision of its own.
type HfaChangesUi = {
  columnRules: Partial<
    Record<HfaFacilityColumnGroup, HfaFacilityChangeDecision>
  >;
  decisions: Record<string, Record<string, HfaFacilityChangeDecision>>;
  idsConfirmedNew: boolean;
  contextSeeded: boolean;
  recode: RecodeEditorUi;
};

function groupKey(group: HfaFacilityChangeGroup): string {
  return JSON.stringify([group.column, group.from, group.to]);
}

// The file's columns the recode rows show by default: for each mapped
// recodable column, its questionnaire's "other" text, as id_fac_type has
// id_fac_type_other.
function defaultContextHeaders(
  facilityColumns: HfaFacilityColumns,
  rawHeaders: string[],
): string[] {
  return _RECODABLE_FACILITY_COLUMNS.flatMap((col) => {
    const header = facilityColumns.optional[col]?.header;
    const other = header
      ? findEncodedCsvHeaderIgnoringCase(
        rawHeaders,
        `${decodeRawCsvHeader(header)}_other`,
      )
      : "";
    return other ? [other] : [];
  });
}

// The changes step's review and the user's decisions, owned by the wizard so
// that they survive moving between steps. load() reads the review; the
// areas an admin decision empties and the recode rows' context columns are
// read again as those change.
export function createHfaFacilityChangesState(fetchReview: HfaChangesFetch) {
  const [review, setReview] = createSignal<HfaFacilityChangesReview>();
  const [adminImpact, setAdminImpact] = createSignal<StateHolder<AdminImpact>>(
    { status: "loading", msg: t3(TC.fetchingData) },
  );
  const [recodeRows, setRecodeRows] = createSignal<
    StateHolder<HfaFacilityRecodeRow[]>
  >({ status: "loading", msg: t3(TC.fetchingData) });
  const [ui, setUi] = createStore<HfaChangesUi>({
    columnRules: {},
    decisions: {},
    idsConfirmedNew: false,
    contextSeeded: false,
    recode: emptyRecodeEditorUi(),
  });

  function effective(
    group: HfaFacilityChangeGroup,
    change: HfaFacilityChange,
  ): HfaFacilityChangeDecision | undefined {
    return ui.decisions[groupKey(group)]?.[change.facilityId] ??
      change.defaultDecision ?? ui.columnRules[group.column];
  }

  // Each group as decided: the most common decision, and the members decided
  // the other way. Undecided members are left out, as are the members
  // include() refuses; a launch encoding has neither.
  function encode(
    groups: HfaFacilityChangeGroup[],
    include: (
      change: HfaFacilityChange,
      decision: HfaFacilityChangeDecision,
    ) => boolean = () => true,
  ): HfaFacilityChangeGroupDecision[] {
    return groups.flatMap((group) => {
      const decided = group.facilities.flatMap((change) => {
        const decision = effective(group, change);
        return decision && include(change, decision)
          ? [{ facilityId: change.facilityId, decision }]
          : [];
      });
      if (decided.length === 0) {
        return [];
      }
      const nTake = decided.filter((d) => d.decision === "take").length;
      const decision: HfaFacilityChangeDecision = nTake * 2 > decided.length
        ? "take"
        : "keep";
      return [{
        column: group.column,
        from: group.from,
        to: group.to,
        facilityIds: decided.map((d) => d.facilityId),
        decision,
        exceptions: decided
          .filter((d) => d.decision !== decision)
          .map((d) => d.facilityId),
      }];
    });
  }

  // Above the step, which every visit creates again, so a table's search and
  // sort survive moving between steps.
  const tableConfigs = new Map<string, TableConfig>();
  function tableConfig(key: string): TableConfig {
    let config = tableConfigs.get(key);
    if (!config) {
      config = createTableConfig();
      tableConfigs.set(key, config);
    }
    return config;
  }

  let fetchedAdmin = "";
  let fetchedContext = "";
  let adminRunId = 0;
  let contextRunId = 0;

  // The changes route decides a member no decision names by its default, or
  // takes it, so only the members decided otherwise are sent: a review just
  // loaded with none is not read again.
  createEffect(() => {
    const r = review();
    const decisions = r
      ? encode(
        r.preview.changes.filter((g) => g.column === "admin"),
        (change, decision) => decision !== (change.defaultDecision ?? "take"),
      )
      : [];
    const signature = JSON.stringify(decisions);
    if (!r || signature === fetchedAdmin) {
      return;
    }
    fetchedAdmin = signature;
    const runId = ++adminRunId;
    setAdminImpact({ status: "loading", msg: t3(TC.fetchingData) });
    void fetchReview({ decisions, contextHeaders: [] }).then((res) => {
      if (runId === adminRunId) {
        setAdminImpact(
          res.success
            ? { status: "ready", data: res.data.preview }
            : { status: "error", err: res.err },
        );
      }
    });
  });

  createEffect(() => {
    const r = review();
    const contextHeaders = [...ui.recode.contextColumns];
    const signature = JSON.stringify(contextHeaders);
    if (!r || signature === fetchedContext) {
      return;
    }
    fetchedContext = signature;
    const runId = ++contextRunId;
    setRecodeRows({ status: "loading", msg: t3(TC.fetchingData) });
    void fetchReview({ decisions: [], contextHeaders }).then((res) => {
      if (runId === contextRunId) {
        setRecodeRows(
          res.success
            ? { status: "ready", data: res.data.recodeRows }
            : { status: "error", err: res.err },
        );
      }
    });
  });

  // Reads the review for the wizard's current mappings. Returns the error,
  // or undefined once the review is in.
  async function load(
    facilityColumns: HfaFacilityColumns,
    rawHeaders: string[],
  ): Promise<string | undefined> {
    if (!ui.contextSeeded) {
      const seeded = defaultContextHeaders(facilityColumns, rawHeaders);
      setUi("recode", "contextColumns", [
        ...ui.recode.contextColumns,
        ...seeded.filter((h) => !ui.recode.contextColumns.includes(h)),
      ]);
      setUi("contextSeeded", true);
    }
    const contextHeaders = [...ui.recode.contextColumns];
    adminRunId++;
    contextRunId++;
    const res = await fetchReview({ decisions: [], contextHeaders });
    if (!res.success) {
      return res.err;
    }
    batch(() => {
      fetchedAdmin = JSON.stringify([]);
      fetchedContext = JSON.stringify(contextHeaders);
      setAdminImpact({ status: "ready", data: res.data.preview });
      setRecodeRows({ status: "ready", data: res.data.recodeRows });
      setUi("idsConfirmedNew", false);
      setReview(res.data);
    });
    return undefined;
  }

  function invalidate() {
    setReview(undefined);
  }

  // A new file: nothing decided against the old one applies.
  function reset() {
    batch(() => {
      setReview(undefined);
      setUi(reconcile({
        columnRules: {},
        decisions: {},
        idsConfirmedNew: false,
        contextSeeded: false,
        recode: emptyRecodeEditorUi(),
      }));
    });
  }

  function needsIdConfirmation(r: HfaFacilityChangesReview): boolean {
    const m = r.preview.match;
    return m.known === 0 && m.absent > 0;
  }

  // Why Next is refused, or undefined.
  function problem(): string | undefined {
    const r = review();
    if (!r) {
      return undefined;
    }
    const undecided = [
      ...new Set(
        r.preview.changes
          .filter((g) => g.facilities.some((c) => !effective(g, c)))
          .map((g) => g.column),
      ),
    ];
    if (undecided.length > 0) {
      const columns = undecided.map(facilityColumnLabel).join(", ");
      return t3({
        en:
          `Choose what to do with the values of unknown origin in: ${columns}.`,
        fr:
          `Choisissez que faire des valeurs d'origine inconnue dans : ${columns}.`,
        pt:
          `Escolha o que fazer com os valores de origem desconhecida em: ${columns}.`,
      });
    }
    if (needsIdConfirmation(r) && !ui.idsConfirmedNew) {
      return t3({
        en: "Confirm that this file's facilities are new.",
        fr: "Confirmez que les établissements de ce fichier sont nouveaux.",
        pt: "Confirme que os estabelecimentos deste ficheiro são novos.",
      });
    }
    return undefined;
  }

  function decisions(): HfaFacilityChangeGroupDecision[] {
    return encode(review()?.preview.changes ?? []);
  }

  // Facilities whose cell in a column the import writes from the file, the
  // cells a recode may name: new facilities, and taken changes.
  function recodableIds(column: StructureRecodableColumn): Set<string> {
    const r = review();
    const ids = new Set<string>(r?.preview.newFacilityIds ?? []);
    for (const group of r?.preview.changes ?? []) {
      if (group.column === column) {
        for (const change of group.facilities) {
          if (effective(group, change) === "take") {
            ids.add(change.facilityId);
          }
        }
      }
    }
    return ids;
  }

  function prunedRecodes(
    recodes: StructureRecodes,
    facilityColumns: HfaFacilityColumns,
  ): StructureRecodes {
    const out: StructureRecodes = {};
    for (const [column, map] of Object.entries(recodes)) {
      const col = column as StructureRecodableColumn;
      if (facilityColumns.optional[col] === undefined) {
        continue;
      }
      const ids = recodableIds(col);
      const kept = Object.entries(map ?? {}).filter(([id]) => ids.has(id));
      if (kept.length > 0) {
        out[col] = Object.fromEntries(kept);
      }
    }
    return out;
  }

  return {
    review,
    adminImpact,
    recodeRows,
    ui,
    setUi,
    effective,
    load,
    invalidate,
    reset,
    tableConfig,
    needsIdConfirmation,
    problem,
    decisions,
    recodableIds,
    prunedRecodes,
  };
}

export type HfaFacilityChangesState = ReturnType<
  typeof createHfaFacilityChangesState
>;

function formatChangeValue(
  column: HfaFacilityColumnGroup,
  value: string,
): string {
  if (column === "admin") {
    return decodeHfaAdminTuple(value).join(" › ");
  }
  return value === ""
    ? t3({ en: "(blank)", fr: "(vide)", pt: "(em branco)" })
    : value;
}

function sourceLabel(source: HfaFacilitySource | undefined): string {
  if (!source) {
    return t3({
      en: "Unknown origin",
      fr: "Origine inconnue",
      pt: "Origem desconhecida",
    });
  }
  if (source.kind === "user") {
    return t3({
      en: "Set by a user",
      fr: "Défini par un utilisateur",
      pt: "Definido por um utilizador",
    });
  }
  const timePoint = source.timePoint;
  return timePoint === null
    ? t3({
      en: "From a deleted time point",
      fr: "D'un point temporel supprimé",
      pt: "De um ponto temporal eliminado",
    })
    : t3({
      en: `From time point ${timePoint}`,
      fr: `Du point temporel ${timePoint}`,
      pt: `Do ponto temporal ${timePoint}`,
    });
}

function decisionItems() {
  return [
    {
      id: "keep" as const,
      label: t3({ en: "Keep", fr: "Conserver", pt: "Manter" }),
    },
    {
      id: "take" as const,
      label: t3({ en: "Take", fr: "Prendre", pt: "Aceitar" }),
    },
  ];
}

type Props = {
  state: HfaFacilityChangesState;
  facilityColumns: HfaFacilityColumns;
  encodedHeaders: string[];
  facilityIdColumn: string;
  recodes: StructureRecodes;
  onAssign: (
    column: StructureRecodableColumn,
    facilityId: string,
    value: string,
  ) => void;
};

// Every facility the import would change, decided keep or take per group and
// per facility, what the decisions do to the admin areas, and the
// reassignment of new and changed values.
export function FacilityChangesStep(p: Props) {
  const [openGroup, setOpenGroup] = createSignal<string>();

  function setDecisions(
    entries: { group: HfaFacilityChangeGroup; facilityId: string }[],
    decision: HfaFacilityChangeDecision,
  ) {
    batch(() => {
      for (const { group, facilityId } of entries) {
        p.state.setUi("decisions", groupKey(group), { [facilityId]: decision });
      }
    });
  }

  function groupDecision(
    group: HfaFacilityChangeGroup,
  ): HfaFacilityChangeDecision | undefined {
    const decisions = new Set(
      group.facilities.map((c) => p.state.effective(group, c)),
    );
    return decisions.size === 1 ? [...decisions][0] : undefined;
  }

  return (
    <Show
      when={p.state.review()}
      fallback={
        <div class="text-base-content-muted text-sm">
          {t3(TC.fetchingData)}
        </div>
      }
    >
      {(review) => {
        const columns = createMemo(() => {
          const byColumn = new Map<
            HfaFacilityColumnGroup,
            HfaFacilityChangeGroup[]
          >();
          for (const group of review().preview.changes) {
            byColumn.set(group.column, [
              ...(byColumn.get(group.column) ?? []),
              group,
            ]);
          }
          return [...byColumn].map(([column, groups]) => ({ column, groups }));
        });
        return (
          <div class="ui-spy">
            <MatchSummary
              state={p.state}
              review={review()}
            />
            <Show
              when={columns().length > 0}
              fallback={
                <div class="text-sm">
                  {t3({
                    en:
                      "The file changes nothing for the facilities already in the HFA facility list.",
                    fr:
                      "Le fichier ne modifie rien pour les établissements déjà dans la liste des établissements HFA.",
                    pt:
                      "O ficheiro não altera nada nos estabelecimentos que já estão na lista de estabelecimentos HFA.",
                  })}
                </div>
              }
            >
              <div class="text-base-content-muted text-sm">
                {t3({
                  en:
                    "For each change, keep the value in the HFA facility list or take the file's value. A value set by a user, or by a later time point, is kept by default; a value from this or an earlier time point gives way to the file. Click a row to decide its facilities one by one.",
                  fr:
                    "Pour chaque modification, conservez la valeur de la liste des établissements HFA ou prenez celle du fichier. Une valeur définie par un utilisateur, ou par un point temporel ultérieur, est conservée par défaut ; une valeur de ce point temporel ou d'un point antérieur cède la place au fichier. Cliquez sur une ligne pour décider de ses établissements un par un.",
                  pt:
                    "Para cada alteração, mantenha o valor da lista de estabelecimentos HFA ou aceite o valor do ficheiro. Um valor definido por um utilizador, ou por um ponto temporal posterior, é mantido por defeito; um valor deste ponto temporal ou de um anterior dá lugar ao ficheiro. Clique numa linha para decidir os seus estabelecimentos um a um.",
                })}
              </div>
            </Show>
            <For each={columns()}>
              {(entry) => (
                <ColumnChanges
                  column={entry.column}
                  groups={entry.groups}
                  state={p.state}
                  tableConfig={p.state.tableConfig(entry.column)}
                  facilitiesTableConfig={p.state.tableConfig(
                    `${entry.column}:open`,
                  )}
                  openGroup={openGroup()}
                  setOpenGroup={setOpenGroup}
                  groupDecision={groupDecision}
                  setDecisions={setDecisions}
                />
              )}
            </For>
            <AdminImpactSummary state={p.state} />
            <Recodes
              state={p.state}
              facilityColumns={p.facilityColumns}
              encodedHeaders={p.encodedHeaders}
              facilityIdColumn={p.facilityIdColumn}
              recodes={p.recodes}
              onAssign={p.onAssign}
            />
          </div>
        );
      }}
    </Show>
  );
}

function MatchSummary(p: {
  state: HfaFacilityChangesState;
  review: HfaFacilityChangesReview;
}) {
  const match = () => p.review.preview.match;
  const withoutTuple = () => p.review.preview.newFacilitiesWithoutAdminTuple;
  return (
    <div class="ui-spy-sm">
      <div class="text-sm">
        {t3({
          en: `Already in the HFA facility list: ${
            toNum0(match().known)
          }. New: ${
            toNum0(match().new)
          }. In the list but not in this file, and kept: ${
            toNum0(match().absent)
          }.`,
          fr: `Déjà dans la liste des établissements HFA : ${
            toNum0(match().known)
          }. Nouveaux : ${
            toNum0(match().new)
          }. Dans la liste mais pas dans ce fichier, et conservés : ${
            toNum0(match().absent)
          }.`,
          pt: `Já na lista de estabelecimentos HFA: ${
            toNum0(match().known)
          }. Novos: ${
            toNum0(match().new)
          }. Na lista mas não neste ficheiro, e mantidos: ${
            toNum0(match().absent)
          }.`,
        })}
      </div>
      <Show when={p.state.needsIdConfirmation(p.review)}>
        <Callout intent="danger">
          <div class="ui-spy-sm">
            <div>
              {t3({
                en:
                  "None of this file's facility ids is in the HFA facility list. If the file uses another id system, go back and choose another facility id column. Otherwise every facility in it is added as new.",
                fr:
                  "Aucun identifiant d'établissement de ce fichier n'est dans la liste des établissements HFA. Si le fichier utilise un autre système d'identifiants, revenez en arrière et choisissez une autre colonne d'identifiant. Sinon, chaque établissement du fichier est ajouté comme nouveau.",
                pt:
                  "Nenhum identificador de estabelecimento deste ficheiro está na lista de estabelecimentos HFA. Se o ficheiro usar outro sistema de identificadores, volte atrás e escolha outra coluna de identificador. Caso contrário, todos os estabelecimentos do ficheiro são adicionados como novos.",
              })}
            </div>
            <Checkbox
              checked={p.state.ui.idsConfirmedNew}
              onChange={(checked) => p.state.setUi("idsConfirmedNew", checked)}
              label={t3({
                en: "These facilities are new: add them",
                fr: "Ces établissements sont nouveaux : les ajouter",
                pt: "Estes estabelecimentos são novos: adicioná-los",
              })}
            />
          </div>
        </Callout>
      </Show>
      <Show when={withoutTuple().count > 0}>
        <Callout intent="danger">
          {t3({
            en: `${toNum0(withoutTuple().count)} new ${
              plural(withoutTuple().count, {
                one: "facility has",
                other: "facilities have",
              })
            } no complete admin areas in the file: ${
              withoutTuple().sample.join(", ")
            }. The import will wait for your review, and integrating anyway leaves them and their data out.`,
            fr: `${toNum0(withoutTuple().count)} ${
              plural(withoutTuple().count, {
                one: "nouvel établissement n'a",
                other: "nouveaux établissements n'ont",
              })
            } pas d'unités administratives complètes dans le fichier : ${
              withoutTuple().sample.join(", ")
            }. L'importation attendra votre vérification, et l'intégrer quand même les exclut avec leurs données.`,
            pt: `${toNum0(withoutTuple().count)} ${
              plural(withoutTuple().count, {
                one: "novo estabelecimento não tem",
                other: "novos estabelecimentos não têm",
              })
            } zonas administrativas completas no ficheiro: ${
              withoutTuple().sample.join(", ")
            }. A importação aguardará a sua revisão, e integrá-la mesmo assim deixa-os de fora com os seus dados.`,
          })}
        </Callout>
      </Show>
    </div>
  );
}

type GroupRow = { key: string; group: HfaFacilityChangeGroup };
type FacilityRow = { facilityId: string; change: HfaFacilityChange };

function ColumnChanges(p: {
  column: HfaFacilityColumnGroup;
  groups: HfaFacilityChangeGroup[];
  state: HfaFacilityChangesState;
  tableConfig: TableConfig;
  facilitiesTableConfig: TableConfig;
  openGroup: string | undefined;
  setOpenGroup: (key: string | undefined) => void;
  groupDecision: (
    group: HfaFacilityChangeGroup,
  ) => HfaFacilityChangeDecision | undefined;
  setDecisions: (
    entries: { group: HfaFacilityChangeGroup; facilityId: string }[],
    decision: HfaFacilityChangeDecision,
  ) => void;
}) {
  const rows = createMemo((): GroupRow[] =>
    p.groups.map((group) => ({ key: groupKey(group), group }))
  );
  const nFacilities = () =>
    p.groups.reduce((sum, g) => sum + g.facilities.length, 0);
  const needsRule = () =>
    p.groups.some((g) => g.facilities.some((c) => !c.defaultDecision));
  const allEntries = () =>
    p.groups.flatMap((group) =>
      group.facilities.map((c) => ({ group, facilityId: c.facilityId }))
    );
  const open = () => rows().find((r) => r.key === p.openGroup)?.group;

  const groupColumns: TableColumn<GroupRow>[] = [
    {
      key: "from",
      header: t3({
        en: "In the facility list",
        fr: "Dans la liste",
        pt: "Na lista",
      }),
      searchValue: (r) => formatChangeValue(p.column, r.group.from),
      render: (r) => <span>{formatChangeValue(p.column, r.group.from)}</span>,
    },
    {
      key: "to",
      header: t3({
        en: "In the file",
        fr: "Dans le fichier",
        pt: "No ficheiro",
      }),
      searchValue: (r) => formatChangeValue(p.column, r.group.to),
      render: (r) => <span>{formatChangeValue(p.column, r.group.to)}</span>,
    },
    {
      key: "count",
      header: t3({
        en: "Facilities",
        fr: "Établissements",
        pt: "Estabelecimentos",
      }),
      sortable: true,
      sortValue: (r) => r.group.facilities.length,
      searchValue: (r) => r.group.facilities.map((f) => f.facilityId).join(" "),
      alignH: "right",
      render: (r) => <span>{toNum0(r.group.facilities.length)}</span>,
    },
    {
      key: "decision",
      header: t3({ en: "Decision", fr: "Décision", pt: "Decisão" }),
      searchable: false,
      pullInY: true,
      render: (r) => (
        <ButtonGroup
          size="sm"
          value={p.groupDecision(r.group)}
          items={decisionItems()}
          onChange={(d) =>
            d &&
            p.setDecisions(
              r.group.facilities.map((c) => ({
                group: r.group,
                facilityId: c.facilityId,
              })),
              d,
            )}
        />
      ),
    },
  ];

  function facilityColumns(
    group: HfaFacilityChangeGroup,
  ): TableColumn<FacilityRow>[] {
    return [
      {
        key: "facilityId",
        header: t3({
          en: "Facility ID",
          fr: "Identifiant",
          pt: "Identificador",
        }),
        render: (r) => <span class="font-mono">{r.facilityId}</span>,
      },
      {
        key: "source",
        header: t3({
          en: "Origin of the current value",
          fr: "Origine de la valeur actuelle",
          pt: "Origem do valor atual",
        }),
        searchable: false,
        render: (r) => <span>{sourceLabel(r.change.source)}</span>,
      },
      {
        key: "decision",
        header: t3({ en: "Decision", fr: "Décision", pt: "Decisão" }),
        searchable: false,
        pullInY: true,
        render: (r) => (
          <ButtonGroup
            size="sm"
            value={p.state.effective(group, r.change)}
            items={decisionItems()}
            onChange={(d) =>
              d &&
              p.setDecisions([{ group, facilityId: r.facilityId }], d)}
          />
        ),
      },
    ];
  }

  return (
    <div class="ui-pad ui-spy-sm rounded border">
      <div class="ui-gap flex items-center justify-between">
        <h3 class="ui-text-heading">
          {t3({
            en: `${facilityColumnLabel(p.column)}: ${toNum0(nFacilities())} ${
              plural(nFacilities(), {
                one: "facility changes",
                other: "facilities change",
              })
            }`,
            fr: `${facilityColumnLabel(p.column)} : ${toNum0(nFacilities())} ${
              plural(nFacilities(), {
                one: "établissement change",
                other: "établissements changent",
              })
            }`,
            pt: `${facilityColumnLabel(p.column)}: ${toNum0(nFacilities())} ${
              plural(nFacilities(), {
                one: "estabelecimento muda",
                other: "estabelecimentos mudam",
              })
            }`,
          })}
        </h3>
        <div class="ui-gap-sm flex items-center">
          <Button
            size="sm"
            outline
            onClick={() => p.setDecisions(allEntries(), "keep")}
          >
            {t3({ en: "Keep all", fr: "Tout conserver", pt: "Manter tudo" })}
          </Button>
          <Button
            size="sm"
            outline
            onClick={() => p.setDecisions(allEntries(), "take")}
          >
            {t3({ en: "Take all", fr: "Tout prendre", pt: "Aceitar tudo" })}
          </Button>
        </div>
      </div>
      <Show when={needsRule()}>
        <div class="ui-gap flex items-center">
          <div class="text-sm">
            {t3({
              en:
                "Some of these values are of unknown origin: they were imported before the HFA import recorded where values came from. Decide them:",
              fr:
                "Certaines de ces valeurs sont d'origine inconnue : elles ont été importées avant que l'importation HFA n'enregistre leur provenance. Décidez-en :",
              pt:
                "Alguns destes valores são de origem desconhecida: foram importados antes de a importação HFA registar a sua proveniência. Decida-os:",
            })}
          </div>
          <ButtonGroup
            size="sm"
            value={p.state.ui.columnRules[p.column]}
            items={decisionItems()}
            onChange={(d) => d && p.state.setUi("columnRules", p.column, d)}
          />
        </div>
      </Show>
      <Table
        config={p.tableConfig}
        data={rows()}
        columns={groupColumns}
        keyField="key"
        itemLabel={{
          one: t3({ en: "change", fr: "modification", pt: "alteração" }),
          other: t3({ en: "changes", fr: "modifications", pt: "alterações" }),
        }}
        toolbar={{ search: true }}
        onRowClick={(r) =>
          p.setOpenGroup(p.openGroup === r.key ? undefined : r.key)}
        paddingY="compact"
        maxHeight="40vh"
      />
      <Show when={open()}>
        {(group) => (
          <div class="ui-spy-sm">
            <div class="text-sm">
              {formatChangeValue(p.column, group().from)} {" → "}
              {formatChangeValue(p.column, group().to)}
            </div>
            <Table
              config={p.facilitiesTableConfig}
              data={group().facilities.map((change) => ({
                facilityId: change.facilityId,
                change,
              }))}
              columns={facilityColumns(group())}
              keyField="facilityId"
              paddingY="compact"
              maxHeight="40vh"
            />
          </div>
        )}
      </Show>
    </div>
  );
}

function AdminImpactSummary(p: { state: HfaFacilityChangesState }) {
  return (
    <StateHolderWrapper state={p.state.adminImpact()}>
      {(impact) => (
        <div class="ui-spy-sm">
          <Show when={impact.adminAreasLost.length > 0}>
            <Callout intent="danger">
              <div class="ui-spy-sm">
                <div>
                  {t3({
                    en:
                      "After this import, no facility would be in these admin areas. They leave the facility list, and the scopes and maps that name them no longer match:",
                    fr:
                      "Après cette importation, aucun établissement ne serait dans ces unités administratives. Elles quittent la liste des établissements, et les périmètres et cartes qui les nomment ne correspondent plus :",
                    pt:
                      "Após esta importação, nenhum estabelecimento ficaria nestas zonas administrativas. Saem da lista de estabelecimentos, e os âmbitos e mapas que as nomeiam deixam de corresponder:",
                  })}
                </div>
                <For each={impact.adminAreasLost}>
                  {(lost) => (
                    <div>
                      {facilityColumnLabel(`admin_area_${lost.level}`)}:{" "}
                      {lost.name}
                      <Show when={lost.scopeLabels.length > 0}>
                        {t3({
                          en: `; scopes: ${lost.scopeLabels.join(", ")}`,
                          fr: ` ; périmètres : ${lost.scopeLabels.join(", ")}`,
                          pt: `; âmbitos: ${lost.scopeLabels.join(", ")}`,
                        })}
                      </Show>
                      <Show when={lost.inGeojsonMap}>
                        {t3({
                          en: "; in the map of this level",
                          fr: " ; dans la carte de ce niveau",
                          pt: "; no mapa deste nível",
                        })}
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Callout>
          </Show>
          <Show when={impact.adminPathsIntroduced.length > 0}>
            <div class="ui-spy-sm text-sm">
              <div>
                {t3({
                  en: "Admin areas this import adds to the facility list:",
                  fr:
                    "Unités administratives que cette importation ajoute à la liste des établissements :",
                  pt:
                    "Zonas administrativas que esta importação acrescenta à lista de estabelecimentos:",
                })}
              </div>
              <For each={impact.adminPathsIntroduced}>
                {(path) => <div>{formatChangeValue("admin", path)}</div>}
              </For>
            </div>
          </Show>
        </div>
      )}
    </StateHolderWrapper>
  );
}

function Recodes(p: {
  state: HfaFacilityChangesState;
  facilityColumns: HfaFacilityColumns;
  encodedHeaders: string[];
  facilityIdColumn: string;
  recodes: StructureRecodes;
  onAssign: (
    column: StructureRecodableColumn,
    facilityId: string,
    value: string,
  ) => void;
}) {
  const columns = () =>
    _RECODABLE_FACILITY_COLUMNS.filter((c) =>
      p.facilityColumns.optional[c] !== undefined
    );
  const column = () => currentRecodeColumn(p.state.ui.recode.column, columns());

  // The current column's rows: new facilities, and changes taken in it.
  const eligibleRows = createMemo((): StateHolder<HfaFacilityRecodeRow[]> => {
    const rows = p.state.recodeRows();
    const col = column();
    if (rows.status !== "ready" || !col) {
      return rows;
    }
    const ids = p.state.recodableIds(col);
    return {
      status: "ready",
      data: rows.data.filter((r) => ids.has(r.facilityId)),
    };
  });

  const fromValues = createMemo(() => {
    const col = column();
    const out = new Map<string, string>();
    for (const group of p.state.review()?.preview.changes ?? []) {
      if (group.column === col) {
        for (const change of group.facilities) {
          out.set(change.facilityId, group.from);
        }
      }
    }
    return out;
  });

  const values = createMemo((): StateHolder<StructureStagedColumnValues> => {
    const rows = eligibleRows();
    const col = column();
    if (rows.status !== "ready" || !col) {
      return rows.status === "error"
        ? rows
        : { status: "loading", msg: t3(TC.fetchingData) };
    }
    const counts = new Map<string, number>();
    for (const r of rows.data) {
      const v = r.values[col] ?? "";
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const sorted = [...counts]
      .map(([value, count]) => ({ value, count }))
      .toSorted((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    return {
      status: "ready",
      data: {
        values: sorted.slice(0, MAX_RECODE_VALUES),
        truncated: sorted.length > MAX_RECODE_VALUES,
      },
    };
  });

  const rows = createMemo((): StateHolder<StructureStagedRecodeRows> => {
    const eligible = eligibleRows();
    const col = column();
    if (eligible.status !== "ready" || !col) {
      return eligible.status === "error"
        ? eligible
        : { status: "loading", msg: t3(TC.fetchingData) };
    }
    const checked = new Set(p.state.ui.recode.checkedValues);
    const from = fromValues();
    const data = eligible.data
      .filter((r) => checked.has(r.values[col] ?? ""))
      .map((r) => ({
        facility_id: r.facilityId,
        current: r.isNew
          ? t3({
            en: "New facility",
            fr: "Nouvel établissement",
            pt: "Novo estabelecimento",
          })
          : formatChangeValue(col, from.get(r.facilityId) ?? ""),
        file: r.values[col] ?? "",
        ...r.context,
      }));
    return {
      status: "ready",
      data: {
        columns: ["facility_id", "current", "file"],
        rows: data,
        total: data.length,
      },
    };
  });

  const mappedHeaders = () =>
    new Set([
      p.facilityIdColumn,
      ...[
        ...p.facilityColumns.adminAreas,
        ...Object.values(p.facilityColumns.optional),
      ].flatMap((h) =>
        h.correctionHeader ? [h.header, h.correctionHeader] : [h.header]
      ),
    ]);
  const contextColumnOptions = () =>
    p.encodedHeaders
      .filter((h) => !mappedHeaders().has(h))
      .map((h) => ({ value: h, label: decodeRawCsvHeader(h) }));

  function columnLabel(c: string): string {
    switch (c) {
      case "facility_id":
        return t3({
          en: "Facility ID",
          fr: "Identifiant",
          pt: "Identificador",
        });
      case "current":
        return t3({
          en: "In the facility list",
          fr: "Dans la liste",
          pt: "Na lista",
        });
      case "file":
        return t3({
          en: "In the file",
          fr: "Dans le fichier",
          pt: "No ficheiro",
        });
      default:
        return facilityColumnLabel(c as StructureRecodableColumn);
    }
  }

  const hasRows = () => {
    const r = p.state.recodeRows();
    return r.status !== "ready" || r.data.length > 0;
  };

  return (
    <Show when={columns().length > 0 && hasRows()}>
      <div class="ui-pad ui-spy-sm rounded border">
        <h3 class="ui-text-heading">
          {t3({
            en: "Reassign values",
            fr: "Réassigner des valeurs",
            pt: "Reatribuir valores",
          })}
        </h3>
        <div class="text-base-content-muted text-sm">
          {t3({
            en:
              "Some files classify facilities with values like “Other”. Reassign such values facility by facility for the new facilities and the changes you take. The file's other columns, such as the text given for “Other”, can be shown beside them.",
            fr:
              "Certains fichiers classent les établissements avec des valeurs comme « Autre ». Réassignez ces valeurs établissement par établissement pour les nouveaux établissements et les modifications que vous prenez. Les autres colonnes du fichier, comme le texte donné pour « Autre », peuvent être affichées à côté.",
            pt:
              "Alguns ficheiros classificam os estabelecimentos com valores como «Outro». Reatribua esses valores estabelecimento a estabelecimento para os novos estabelecimentos e as alterações que aceitar. As outras colunas do ficheiro, como o texto dado para «Outro», podem ser mostradas ao lado.",
          })}
        </div>
        <RecodeEditor
          ui={p.state.ui.recode}
          onUiChange={(patch) => p.state.setUi("recode", patch)}
          columns={columns()}
          columnLabel={columnLabel}
          values={values()}
          rows={rows()}
          contextColumnOptions={contextColumnOptions()}
          contextColumnLabel={decodeRawCsvHeader}
          assignments={p.recodes}
          onAssign={p.onAssign}
        />
      </div>
    </Show>
  );
}
