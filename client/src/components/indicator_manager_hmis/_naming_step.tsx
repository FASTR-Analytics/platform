// The naming step (PLAN_A6 ruling 7): the DHIS2 select form's. A DHIS2
// element or operand becomes a new DHIS2 element under an id
// generateIndicatorId proposes and the user edits inline; an existing id
// is refused; a UID some indicator already carries as its data id is shown
// as imported and creates nothing. A DHIS2 indicator that decomposes is a
// calculated row whose formula is previewed over the ids its operands are
// taking. The host owns the state (a Solid store) and posts the result; the
// server applies the same rules again.
import {
  definitionDataId,
  type HmisIndicator,
  describeNewIndicatorIdIssue,
  generateIndicatorId,
  getNewIndicatorIdIssue,
  type IndicatorFormat,
  type IndicatorNamingInput,
  parseIndicatorExpression,
  renameIdentifiers,
  t3,
  TC,
  writeIndicatorExpression,
} from "lib";
import { Input } from "panther";
import { indicatorFormatWord } from "./_indicator_display";
import { createMemo, For, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";

// A DHIS2 element or operand by its UID, with the name DHIS2 gives it.
export type NamingElementCandidate = {
  data_id: string;
  data_label: string;
};

export type NamingCalculatedCandidate = {
  // What the calculated comes from (the DHIS2 indicator id): the host's key.
  key: string;
  label: string;
  // Over data ids; the transaction rewrites it over the indicators.
  expression: string;
  format_as: IndicatorFormat;
  note?: string;
};

// One row per element the step names: its UID (`data_id`, shown with
// `data_label`, the DHIS2 name), the indicator id chosen for it and its
// label.
export type NamingValueRow = NamingElementCandidate & {
  indicator_id: string;
  label: string;
  // The indicator that already carries this value as its data id: the row
  // creates nothing.
  importedAs?: string;
};

export type NamingCalculatedRow = NamingCalculatedCandidate & {
  indicator_id: string;
};

export type NamingState = {
  elements: NamingValueRow[];
  calculated: NamingCalculatedRow[];
};

export const EMPTY_NAMING_STATE: NamingState = {
  elements: [],
  calculated: [],
};

function ownersOfDataIds(indicators: HmisIndicator[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const indicator of indicators) {
    const dataId = definitionDataId(indicator.definition);
    if (dataId !== null) owners.set(dataId, indicator.indicator_common_id);
  }
  return owners;
}

// Proposed ids are generated against the dictionary as it stands plus every
// id proposed before, so two rows never collide by default.
export function createNamingState(args: {
  elements: NamingElementCandidate[];
  calculated: NamingCalculatedCandidate[];
  indicators: HmisIndicator[];
}): NamingState {
  const owners = ownersOfDataIds(args.indicators);
  const existingIds = new Set(args.indicators.map((i) => i.indicator_common_id));
  const elements = args.elements.map<NamingValueRow>((candidate) => {
    const importedAs = owners.get(candidate.data_id);
    if (importedAs !== undefined) {
      return {
        ...candidate,
        indicator_id: importedAs,
        label: candidate.data_label,
        importedAs,
      };
    }
    const indicatorId = generateIndicatorId({
      label: candidate.data_label,
      fallbackId: candidate.data_id,
      existingIds,
    });
    existingIds.add(indicatorId);
    return { ...candidate, indicator_id: indicatorId, label: candidate.data_label };
  });
  const calculated = args.calculated.map<NamingCalculatedRow>((candidate) => {
    const indicatorId = generateIndicatorId({
      label: candidate.label,
      fallbackId: candidate.key,
      existingIds,
    });
    existingIds.add(indicatorId);
    return { ...candidate, indicator_id: indicatorId };
  });
  return { elements, calculated };
}

function idIssueText(id: string): string | undefined {
  const issue = getNewIndicatorIdIssue(id, "dhis2_element");
  return issue === undefined ? undefined : describeNewIndicatorIdIssue(issue);
}

function labelRequired(key: string): string {
  return `${key}: ${t3({
    en: "a label is required",
    fr: "une étiquette est requise",
    pt: "é necessária uma etiqueta",
  })}`;
}

function chosenTwice(key: string, id: string): string {
  return `${key}: ${t3({
    en: `"${id}" is chosen more than once; one indicator carries one DHIS2 id`,
    fr: `« ${id} » est choisi plus d'une fois ; un indicateur ne porte qu'un identifiant DHIS2`,
    pt: `"${id}" é escolhido mais de uma vez; um indicador tem um único ID DHIS2`,
  })}`;
}

// Everything that would make the server refuse the save, stated where the
// user is. Empty means the save can go.
export function namingIssues(
  state: NamingState,
  indicators: HmisIndicator[],
): string[] {
  const existingIds = new Set(indicators.map((i) => i.indicator_common_id));
  const issues: string[] = [];
  const chosen = new Set<string>();
  for (const row of state.elements) {
    if (row.importedAs !== undefined) continue;
    const id = row.indicator_id.trim();
    if (chosen.has(id)) {
      issues.push(chosenTwice(row.data_id, id));
    }
    chosen.add(id);
    const issue = idIssueText(id);
    if (issue !== undefined) {
      issues.push(`${row.data_id}: ${issue}`);
    } else if (existingIds.has(id)) {
      issues.push(
        `${row.data_id}: ${t3({
          en: `"${id}" already exists; choose another id`,
          fr: `« ${id} » existe déjà ; choisissez un autre identifiant`,
          pt: `"${id}" já existe; escolha outro ID`,
        })}`,
      );
    }
    if (row.label.trim() === "") {
      issues.push(labelRequired(row.data_id));
    }
  }
  for (const row of state.calculated) {
    const id = row.indicator_id.trim();
    const issue = getNewIndicatorIdIssue(id, "calculated");
    if (issue !== undefined) {
      issues.push(`${row.key}: ${describeNewIndicatorIdIssue(issue)}`);
    } else if (existingIds.has(id) || chosen.has(id)) {
      issues.push(
        `${row.key}: ${t3({
          en: `"${id}" is already used`,
          fr: `« ${id} » est déjà utilisé`,
          pt: `"${id}" já está a ser utilizado`,
        })}`,
      );
    }
    chosen.add(id);
    if (row.label.trim() === "") {
      issues.push(labelRequired(row.key));
    }
  }
  return issues;
}

// Every row is posted, an imported one included: the server needs its
// value in the landing map to rewrite a calculated formula that names it, and
// creates nothing for it.
export function namingInputFromState(state: NamingState): IndicatorNamingInput {
  const valueRows = (rows: NamingValueRow[]) =>
    rows.map((row) => ({
      data_id: row.data_id,
      indicator_id: row.indicator_id.trim(),
      label: row.label.trim(),
    }));
  return {
    elements: valueRows(state.elements),
    calculated: state.calculated.map((row) => ({
      indicator_id: row.indicator_id.trim(),
      label: row.label.trim(),
      expression: row.expression,
      format_as: row.format_as,
    })),
  };
}

// The formula as the transaction will store it, over the ids the elements
// are taking; the raw formula while an id is still blank or unparseable.
function previewExpression(row: NamingCalculatedRow, state: NamingState): string {
  const landing: Record<string, string> = {};
  for (const element of state.elements) {
    const id = element.indicator_id.trim();
    if (id !== "") landing[element.data_id] = id;
  }
  try {
    return writeIndicatorExpression(
      renameIdentifiers(parseIndicatorExpression(row.expression), landing),
    );
  } catch {
    return row.expression;
  }
}

export function NamingStep(p: {
  state: NamingState;
  setState: SetStoreFunction<NamingState>;
  indicators: HmisIndicator[];
}) {
  const issues = createMemo(() => namingIssues(p.state, p.indicators));

  return (
    <div class="ui-spy">
      <Show when={p.state.elements.length > 0}>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({ en: "Data elements", fr: "Éléments de données", pt: "Elementos de dados" })}
          </div>
          <div class="ui-text-caption">
            {t3({
              en: "Each element becomes a new DHIS2 element indicator under the id shown (edit it here; the indicator can be renamed later).",
              fr: "Chaque élément devient un nouvel indicateur élément DHIS2 sous l'identifiant affiché (modifiez-le ici ; l'indicateur pourra être renommé ensuite).",
              pt: "Cada elemento torna-se um novo indicador elemento DHIS2 com o ID mostrado (edite-o aqui; o indicador pode ser renomeado depois).",
            })}
          </div>
          <ElementRows state={p.state} setState={p.setState} />
        </div>
      </Show>

      <Show when={p.state.calculated.length > 0}>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({
              en: "Calculated indicators",
              fr: "Indicateurs calculés",
              pt: "Indicadores calculados",
            })}
          </div>
          <div class="ui-text-caption">
            {t3({
              en: "Each DHIS2 indicator becomes a calculated indicator whose formula is over the indicators its operands become.",
              fr: "Chaque indicateur DHIS2 devient un indicateur calculé dont la formule porte sur les indicateurs que ses opérandes deviennent.",
              pt: "Cada indicador DHIS2 torna-se um indicador calculado cuja fórmula é sobre os indicadores em que os seus operandos se tornam.",
            })}
          </div>
          <For each={p.state.calculated}>
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
                    onChange={(v) => p.setState("calculated", index(), "indicator_id", v)}
                    mono
                    fullWidth
                  />
                  <Input
                    label={t3(TC.label)}
                    value={row.label}
                    onChange={(v) => p.setState("calculated", index(), "label", v)}
                    fullWidth
                  />
                </div>
                <div class="text-sm">
                  <span class="text-base-content-muted">
                    {t3({ en: "Formula:", fr: "Formule :", pt: "Fórmula:" })}
                  </span>{" "}
                  <span class="font-mono">{previewExpression(row, p.state)}</span>
                  <span class="text-base-content-muted ml-3">
                    {indicatorFormatWord(row.format_as)}
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
        <div class="ui-spy-sm text-danger text-xs">
          <For each={issues()}>{(issue) => <div>{issue}</div>}</For>
        </div>
      </Show>
    </div>
  );
}

// One row per element: its UID and name, the id chosen for it and its
// label, or the indicator that already carries the UID.
function ElementRows(p: {
  state: NamingState;
  setState: SetStoreFunction<NamingState>;
}) {
  return (
    <For each={p.state.elements}>
      {(row, index) => (
        <div class="ui-pad-sm ui-spy-sm rounded border">
          <div class="ui-gap-sm flex items-baseline text-sm">
            <span class="font-mono">{row.data_id}</span>
            <Show when={row.data_label !== row.data_id}>
              <span class="text-base-content-muted">{row.data_label}</span>
            </Show>
          </div>
          <Show
            when={row.importedAs === undefined}
            fallback={
              <div class="text-sm">
                {t3({
                  en: "Already added as",
                  fr: "Déjà ajouté sous",
                  pt: "Já adicionado como",
                })}{" "}
                <span class="font-mono">{row.importedAs}</span>
              </div>
            }
          >
            <div class="ui-gap-sm grid grid-cols-2">
              <Input
                label={t3({
                  en: "Indicator ID",
                  fr: "ID de l'indicateur",
                  pt: "ID do indicador",
                })}
                value={row.indicator_id}
                onChange={(v) => p.setState("elements", index(), "indicator_id", v)}
                mono
                fullWidth
              />
              <Input
                label={t3(TC.label)}
                value={row.label}
                onChange={(v) => p.setState("elements", index(), "label", v)}
                fullWidth
              />
            </div>
          </Show>
        </div>
      )}
    </For>
  );
}
