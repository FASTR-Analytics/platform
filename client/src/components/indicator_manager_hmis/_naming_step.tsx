// The naming step (PLAN_A3 ruling 6), one component for both import paths.
// Each candidate source (a DHIS2 element or operand, or a CSV column id)
// becomes the source of a new base under an id generateIndicatorId
// proposes and the user edits inline, or one more source of an existing
// base; a candidate that is already a source keeps its owner. A DHIS2
// indicator that decomposes is a derived row whose formula is previewed
// over the ids its operands are taking. The host owns the state (a Solid
// store) and posts the result; the server applies the same rules again.
import {
  type CommonIndicatorType,
  describeNewIndicatorIdIssue,
  generateIndicatorId,
  getNewIndicatorIdIssue,
  type IndicatorFormat,
  type IndicatorNamingInput,
  type IndicatorNamingTarget,
  type IndicatorWithSources,
  parseIndicatorExpression,
  renameIdentifiers,
  t3,
  TC,
  writeIndicatorExpression,
} from "lib";
import { Input, Select, SelectSearch } from "panther";
import { createMemo, For, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";

export type NamingSourceCandidate = {
  source_id: string;
  source_label: string;
};

export type NamingDerivedCandidate = {
  // What the derived comes from (the DHIS2 indicator id): the host's key.
  key: string;
  label: string;
  // Over source ids; the transaction rewrites it over the bases.
  expression: string;
  format_as: IndicatorFormat;
  note?: string;
};

export type NamingSourceRow = NamingSourceCandidate & {
  ownedBy?: string;
  target: IndicatorNamingTarget;
};

export type NamingDerivedRow = NamingDerivedCandidate & {
  indicator_id: string;
};

export type NamingState = {
  sources: NamingSourceRow[];
  derived: NamingDerivedRow[];
};

// Proposed ids are generated against the dictionary as it stands plus
// every id proposed before, so two candidates never collide by default.
export function createNamingState(args: {
  sources: NamingSourceCandidate[];
  derived: NamingDerivedCandidate[];
  indicators: IndicatorWithSources[];
}): NamingState {
  const owners = new Map<string, string>();
  for (const indicator of args.indicators) {
    for (const s of indicator.sources) {
      owners.set(s.source_id, indicator.indicator_common_id);
    }
  }
  const existingIds = new Set(
    args.indicators.map((i) => i.indicator_common_id),
  );
  const sources = args.sources.map<NamingSourceRow>((candidate) => {
    const ownedBy = owners.get(candidate.source_id);
    if (ownedBy !== undefined) {
      return {
        ...candidate,
        ownedBy,
        target: { kind: "attach", indicator_id: ownedBy },
      };
    }
    const indicatorId = generateIndicatorId({
      label: candidate.source_label,
      sourceId: candidate.source_id,
      existingIds,
    });
    existingIds.add(indicatorId);
    return {
      ...candidate,
      target: {
        kind: "new",
        indicator_id: indicatorId,
        label: candidate.source_label,
      },
    };
  });
  const derived = args.derived.map<NamingDerivedRow>((candidate) => {
    const indicatorId = generateIndicatorId({
      label: candidate.label,
      sourceId: candidate.key,
      existingIds,
    });
    existingIds.add(indicatorId);
    return { ...candidate, indicator_id: indicatorId };
  });
  return { sources, derived };
}

function idIssueText(id: string, type: CommonIndicatorType): string | undefined {
  const issue = getNewIndicatorIdIssue(id, type);
  return issue === undefined ? undefined : describeNewIndicatorIdIssue(issue);
}

// Everything that would make the server refuse the save, stated where the
// user is. Empty means the save can go.
export function namingIssues(
  state: NamingState,
  indicators: IndicatorWithSources[],
): string[] {
  const existingIds = new Set(indicators.map((i) => i.indicator_common_id));
  const issues: string[] = [];
  const newIds = new Set<string>();
  for (const row of state.sources) {
    if (row.target.kind === "attach") {
      if (row.target.indicator_id === "") {
        issues.push(
          `${row.source_id}: ${t3({
            en: "choose the indicator to add it to",
            fr: "choisissez l'indicateur auquel l'ajouter",
            pt: "escolha o indicador ao qual adicioná-la",
          })}`,
        );
      }
      continue;
    }
    const id = row.target.indicator_id.trim();
    const issue = idIssueText(id, "base");
    if (issue !== undefined) {
      issues.push(`${row.source_id}: ${issue}`);
    } else if (existingIds.has(id)) {
      issues.push(
        `${row.source_id}: ${t3({
          en: `"${id}" already exists; choose "Add to an existing indicator" instead`,
          fr: `« ${id} » existe déjà ; choisissez plutôt « Ajouter à un indicateur existant »`,
          pt: `"${id}" já existe; escolha antes "Adicionar a um indicador existente"`,
        })}`,
      );
    }
    newIds.add(id);
    if (row.target.label.trim() === "") {
      issues.push(`${row.source_id}: ${t3({
        en: "a label is required",
        fr: "une étiquette est requise",
        pt: "é necessária uma etiqueta",
      })}`);
    }
  }
  const derivedIds = new Set<string>();
  for (const row of state.derived) {
    const id = row.indicator_id.trim();
    const issue = idIssueText(id, "derived");
    if (issue !== undefined) {
      issues.push(`${row.key}: ${issue}`);
    } else if (existingIds.has(id) || newIds.has(id) || derivedIds.has(id)) {
      issues.push(
        `${row.key}: ${t3({
          en: `"${id}" is already used`,
          fr: `« ${id} » est déjà utilisé`,
          pt: `"${id}" já está a ser utilizado`,
        })}`,
      );
    }
    derivedIds.add(id);
    if (row.label.trim() === "") {
      issues.push(`${row.key}: ${t3({
        en: "a label is required",
        fr: "une étiquette est requise",
        pt: "é necessária uma etiqueta",
      })}`);
    }
  }
  return issues;
}

function trimmedTarget(target: IndicatorNamingTarget): IndicatorNamingTarget {
  return target.kind === "new"
    ? {
      kind: "new",
      indicator_id: target.indicator_id.trim(),
      label: target.label.trim(),
    }
    : target;
}

export function namingInputFromState(state: NamingState): IndicatorNamingInput {
  return {
    sources: state.sources.map((row) => ({
      source_id: row.source_id,
      source_label: row.source_label,
      target: trimmedTarget(row.target),
    })),
    derived: state.derived.map((row) => ({
      indicator_id: row.indicator_id.trim(),
      label: row.label.trim(),
      expression: row.expression,
      format_as: row.format_as,
    })),
  };
}

// The formula as the transaction will store it, over the ids the sources
// are taking; the raw formula while an id is still blank or unparseable.
function previewExpression(row: NamingDerivedRow, state: NamingState): string {
  const mapping: Record<string, string> = {};
  for (const s of state.sources) {
    const id = s.target.indicator_id.trim();
    if (id !== "") mapping[s.source_id] = id;
  }
  try {
    return writeIndicatorExpression(
      renameIdentifiers(parseIndicatorExpression(row.expression), mapping),
    );
  } catch {
    return row.expression;
  }
}

const FORMAT_LABELS: Record<IndicatorFormat, () => string> = {
  number: () => t3({ en: "Number", fr: "Nombre", pt: "Número" }),
  percent: () => t3({ en: "Percent", fr: "Pourcentage", pt: "Percentagem" }),
  rate_per_10k: () =>
    t3({ en: "Rate per 10,000", fr: "Taux pour 10 000", pt: "Taxa por 10 000" }),
};

type TargetKind = IndicatorNamingTarget["kind"];

export function NamingStep(p: {
  state: NamingState;
  setState: SetStoreFunction<NamingState>;
  indicators: IndicatorWithSources[];
}) {
  const baseOptions = createMemo(() =>
    p.indicators
      .filter((i) => i.definition.type === "base")
      .map((i) => ({
        value: i.indicator_common_id,
        label: `${i.indicator_common_label} (${i.indicator_common_id})`,
      }))
  );

  const targetOptions: { value: TargetKind; label: string }[] = [
    {
      value: "new",
      label: t3({
        en: "New indicator",
        fr: "Nouvel indicateur",
        pt: "Novo indicador",
      }),
    },
    {
      value: "attach",
      label: t3({
        en: "Add to an existing indicator",
        fr: "Ajouter à un indicateur existant",
        pt: "Adicionar a um indicador existente",
      }),
    },
  ];

  function setTargetKind(index: number, kind: TargetKind) {
    const row = p.state.sources[index];
    if (row.target.kind === kind) return;
    p.setState(
      "sources",
      index,
      "target",
      kind === "new"
        ? {
          kind: "new",
          indicator_id: generateIndicatorId({
            label: row.source_label,
            sourceId: row.source_id,
            existingIds: [
              ...p.indicators.map((i) => i.indicator_common_id),
              ...p.state.sources.flatMap((s, i) =>
                i !== index && s.target.kind === "new"
                  ? [s.target.indicator_id.trim()]
                  : []
              ),
              ...p.state.derived.map((d) => d.indicator_id.trim()),
            ],
          }),
          label: row.source_label,
        }
        : { kind: "attach", indicator_id: "" },
    );
  }

  const issues = createMemo(() => namingIssues(p.state, p.indicators));

  return (
    <div class="ui-spy">
      <div class="ui-spy-sm">
        <div class="font-700">
          {t3({ en: "Sources", fr: "Sources", pt: "Fontes" })}
        </div>
        <div class="ui-text-caption text-xs">
          {t3({
            en: "Each source becomes a new base indicator under the id shown (edit it here; ids cannot change later), or is added to an existing base indicator. Several sources given the same new id become one indicator.",
            fr: "Chaque source devient un nouvel indicateur de base sous l'identifiant affiché (modifiez-le ici ; les identifiants ne peuvent plus changer ensuite), ou est ajoutée à un indicateur de base existant. Plusieurs sources portant le même nouvel identifiant deviennent un seul indicateur.",
            pt: "Cada fonte torna-se um novo indicador de base com o ID mostrado (edite-o aqui; os IDs não podem mudar depois), ou é adicionada a um indicador de base existente. Várias fontes com o mesmo ID novo tornam-se um único indicador.",
          })}
        </div>
        <For each={p.state.sources}>
          {(row, index) => (
            <div class="ui-pad-sm ui-spy-sm rounded border">
              <div class="ui-gap-sm flex items-baseline text-sm">
                <span class="font-mono">{row.source_id}</span>
                <Show when={row.source_label !== row.source_id}>
                  <span class="text-base-content-muted">{row.source_label}</span>
                </Show>
              </div>
              <Show
                when={row.ownedBy === undefined}
                fallback={
                  <div class="text-sm">
                    {t3({
                      en: "Already a source of",
                      fr: "Déjà une source de",
                      pt: "Já é uma fonte de",
                    })}{" "}
                    <span class="font-mono">{row.ownedBy}</span>
                  </div>
                }
              >
                <div class="ui-gap-sm grid grid-cols-[minmax(12rem,1fr)_2fr] items-end">
                  <Select
                    value={row.target.kind}
                    onChange={(v) => setTargetKind(index(), v)}
                    options={targetOptions}
                    fullWidth
                  />
                  <Show when={row.target.kind === "new"}>
                    <div class="ui-gap-sm grid grid-cols-2">
                      <Input
                        label={t3({
                          en: "Indicator ID",
                          fr: "ID de l'indicateur",
                          pt: "ID do indicador",
                        })}
                        value={row.target.indicator_id}
                        onChange={(v) =>
                          p.setState("sources", index(), "target", {
                            kind: "new",
                            indicator_id: v,
                            label: row.target.kind === "new" ? row.target.label : "",
                          })}
                        mono
                        fullWidth
                      />
                      <Input
                        label={t3(TC.label)}
                        value={row.target.kind === "new" ? row.target.label : ""}
                        onChange={(v) =>
                          p.setState("sources", index(), "target", {
                            kind: "new",
                            indicator_id: row.target.indicator_id,
                            label: v,
                          })}
                        fullWidth
                      />
                    </div>
                  </Show>
                  <Show when={row.target.kind === "attach"}>
                    <SelectSearch
                      label={t3({
                        en: "Existing base indicator",
                        fr: "Indicateur de base existant",
                        pt: "Indicador de base existente",
                      })}
                      value={row.target.indicator_id || undefined}
                      onChange={(v) =>
                        p.setState("sources", index(), "target", {
                          kind: "attach",
                          indicator_id: v,
                        })}
                      options={baseOptions()}
                      placeholder={t3({
                        en: "Search indicators...",
                        fr: "Rechercher des indicateurs...",
                        pt: "Pesquisar indicadores...",
                      })}
                      fullWidth
                    />
                  </Show>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      <Show when={p.state.derived.length > 0}>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({
              en: "Derived indicators",
              fr: "Indicateurs dérivés",
              pt: "Indicadores derivados",
            })}
          </div>
          <div class="ui-text-caption text-xs">
            {t3({
              en: "Each DHIS2 indicator becomes a derived indicator whose formula is over the base indicators its operands become.",
              fr: "Chaque indicateur DHIS2 devient un indicateur dérivé dont la formule porte sur les indicateurs de base que ses opérandes deviennent.",
              pt: "Cada indicador DHIS2 torna-se um indicador derivado cuja fórmula é sobre os indicadores de base em que os seus operandos se tornam.",
            })}
          </div>
          <For each={p.state.derived}>
            {(row, index) => (
              <div class="ui-pad-sm ui-spy-sm rounded border">
                <div class="ui-gap-sm flex items-baseline text-sm">
                  <span class="font-mono">{row.key}</span>
                  <span class="text-base-content-muted">{row.label}</span>
                </div>
                <div class="ui-gap-sm grid grid-cols-2">
                  <Input
                    label={t3({
                      en: "Indicator ID",
                      fr: "ID de l'indicateur",
                      pt: "ID do indicador",
                    })}
                    value={row.indicator_id}
                    onChange={(v) => p.setState("derived", index(), "indicator_id", v)}
                    mono
                    fullWidth
                  />
                  <Input
                    label={t3(TC.label)}
                    value={row.label}
                    onChange={(v) => p.setState("derived", index(), "label", v)}
                    fullWidth
                  />
                </div>
                <div class="text-sm">
                  <span class="text-base-content-muted">
                    {t3({ en: "Formula:", fr: "Formule :", pt: "Fórmula:" })}
                  </span>{" "}
                  <span class="font-mono">{previewExpression(row, p.state)}</span>
                  <span class="text-base-content-muted ml-3">
                    {FORMAT_LABELS[row.format_as]()}
                  </span>
                </div>
                <Show when={row.note}>
                  {(note) => <div class="text-warning text-xs">{note()}</div>}
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={issues().length > 0}>
        <div class="ui-spy-xs text-danger text-xs">
          <For each={issues()}>{(issue) => <div>{issue}</div>}</For>
        </div>
      </Show>
    </div>
  );
}
