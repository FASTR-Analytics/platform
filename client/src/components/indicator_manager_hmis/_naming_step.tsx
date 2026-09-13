// The naming step (PLAN_A5 rulings 6 and 7), one component for both import
// paths. A DHIS2 element or operand becomes a new DHIS2 element under an id
// generateIndicatorId proposes and the user edits inline; a file value the
// CSV hold could not resolve becomes a new Uploaded indicator carrying the
// value as its file id, under the value itself when that passes the
// validator and a generated id otherwise. In either case, typing the id of
// an existing Uploaded indicator that has no data id assigns the value to
// that indicator instead (the adopt row); any other existing id is refused;
// a value some indicator already carries as its data id is shown as
// imported and creates nothing. A DHIS2 indicator that decomposes is a
// derived row whose formula is previewed over the ids its operands are
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
import { createMemo, For, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { dataIdLabel } from "./_indicator_display";

// A DHIS2 element or operand by its UID, with the name DHIS2 gives it.
export type NamingElementCandidate = {
  data_id: string;
  data_label: string;
};

export type NamingDerivedCandidate = {
  // What the derived comes from (the DHIS2 indicator id): the host's key.
  key: string;
  label: string;
  // Over data ids; the transaction rewrites it over the indicators.
  expression: string;
  format_as: IndicatorFormat;
  note?: string;
};

// One row per value the step names: a DHIS2 element's UID or a file value
// (`data_id`, shown with `data_label`, the DHIS2 name or the value itself),
// the indicator id chosen for it and its label.
export type NamingValueRow = NamingElementCandidate & {
  indicator_id: string;
  label: string;
  // The indicator that already carries this value as its data id: the row
  // creates nothing.
  importedAs?: string;
};

export type NamingDerivedRow = NamingDerivedCandidate & {
  indicator_id: string;
};

export type NamingState = {
  elements: NamingValueRow[];
  uploaded: NamingValueRow[];
  derived: NamingDerivedRow[];
};

type ValueKind = "elements" | "uploaded";

export const EMPTY_NAMING_STATE: NamingState = {
  elements: [],
  uploaded: [],
  derived: [],
};

function ownersOfDataIds(indicators: HmisIndicator[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const indicator of indicators) {
    const dataId = definitionDataId(indicator.definition);
    if (dataId !== null) owners.set(dataId, indicator.indicator_common_id);
  }
  return owners;
}

// The existing Uploaded indicator without a data id that a typed id names,
// if any: the value is assigned to it instead of creating a new indicator.
export function namingAssignTarget(
  indicatorId: string,
  indicators: HmisIndicator[],
): HmisIndicator | undefined {
  const target = indicators.find((i) => i.indicator_common_id === indicatorId);
  return target?.definition.type === "uploaded" && target.definition.data_id === null
    ? target
    : undefined;
}

// A file value is its own indicator id when it passes the validator and is
// free, or names an Uploaded indicator it can be assigned to (ruling 6);
// otherwise the id is generated from it.
function proposeUploadedId(
  value: string,
  indicators: HmisIndicator[],
  existingIds: Set<string>,
): string {
  const free = !existingIds.has(value) ||
    namingAssignTarget(value, indicators) !== undefined;
  if (free && getNewIndicatorIdIssue(value, "uploaded") === undefined) {
    return value;
  }
  return generateIndicatorId({ label: value, fallbackId: value, existingIds });
}

// Proposed ids are generated against the dictionary as it stands plus every
// id proposed before, so two rows never collide by default.
export function createNamingState(args: {
  elements: NamingElementCandidate[];
  uploadedValues: string[];
  derived: NamingDerivedCandidate[];
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
  const uploaded = args.uploadedValues.map<NamingValueRow>((value) => {
    const importedAs = owners.get(value);
    if (importedAs !== undefined) {
      return { data_id: value, data_label: value, indicator_id: importedAs, label: value, importedAs };
    }
    const indicatorId = proposeUploadedId(value, args.indicators, existingIds);
    existingIds.add(indicatorId);
    return { data_id: value, data_label: value, indicator_id: indicatorId, label: value };
  });
  const derived = args.derived.map<NamingDerivedRow>((candidate) => {
    const indicatorId = generateIndicatorId({
      label: candidate.label,
      fallbackId: candidate.key,
      existingIds,
    });
    existingIds.add(indicatorId);
    return { ...candidate, indicator_id: indicatorId };
  });
  return { elements, uploaded, derived };
}

function idIssueText(id: string, kind: ValueKind): string | undefined {
  const issue = getNewIndicatorIdIssue(
    id,
    kind === "elements" ? "dhis2_element" : "uploaded",
  );
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
    en: `"${id}" is chosen more than once; one indicator carries one DHIS2 id or file id`,
    fr: `« ${id} » est choisi plus d'une fois ; un indicateur ne porte qu'un identifiant DHIS2 ou du fichier`,
    pt: `"${id}" é escolhido mais de uma vez; um indicador tem um único ID DHIS2 ou do ficheiro`,
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
  const checkValueRows = (kind: ValueKind) => {
    for (const row of state[kind]) {
      if (row.importedAs !== undefined) continue;
      const id = row.indicator_id.trim();
      if (chosen.has(id)) {
        issues.push(chosenTwice(row.data_id, id));
      }
      chosen.add(id);
      if (namingAssignTarget(id, indicators) !== undefined) continue;
      const issue = idIssueText(id, kind);
      if (issue !== undefined) {
        issues.push(`${row.data_id}: ${issue}`);
      } else if (existingIds.has(id)) {
        issues.push(
          `${row.data_id}: ${t3({
            en: `"${id}" already exists and cannot take this value: only an Uploaded indicator without a file id or DHIS2 id can be assigned one; choose another id`,
            fr: `« ${id} » existe déjà et ne peut pas recevoir cette valeur : seul un indicateur téléversé sans identifiant du fichier ni identifiant DHIS2 peut s'en voir attribuer une ; choisissez un autre identifiant`,
            pt: `"${id}" já existe e não pode receber este valor: só um indicador carregado sem ID do ficheiro nem ID DHIS2 pode receber um; escolha outro ID`,
          })}`,
        );
      }
      if (row.label.trim() === "") {
        issues.push(labelRequired(row.data_id));
      }
    }
  };
  checkValueRows("elements");
  checkValueRows("uploaded");
  for (const row of state.derived) {
    const id = row.indicator_id.trim();
    const issue = getNewIndicatorIdIssue(id, "derived");
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
// value in the landing map to rewrite a derived formula that names it, and
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
    uploaded: valueRows(state.uploaded),
    derived: state.derived.map((row) => ({
      indicator_id: row.indicator_id.trim(),
      label: row.label.trim(),
      expression: row.expression,
      format_as: row.format_as,
    })),
  };
}

// The formula as the transaction will store it, over the ids the elements
// are taking; the raw formula while an id is still blank or unparseable.
function previewExpression(row: NamingDerivedRow, state: NamingState): string {
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

const FORMAT_LABELS: Record<IndicatorFormat, () => string> = {
  number: () => t3({ en: "Number", fr: "Nombre", pt: "Número" }),
  percent: () => t3({ en: "Percent", fr: "Pourcentage", pt: "Percentagem" }),
  rate_per_10k: () =>
    t3({ en: "Rate per 10,000", fr: "Taux pour 10 000", pt: "Taxa por 10 000" }),
};

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
            {t3({ en: "DHIS2 elements", fr: "Éléments DHIS2", pt: "Elementos DHIS2" })}
          </div>
          <div class="ui-text-caption text-xs">
            {t3({
              en: "Each element becomes a new DHIS2 element indicator under the id shown (edit it here; the indicator can be renamed later). Type the id of an existing Uploaded indicator that has no file id to assign the DHIS2 id to that indicator instead.",
              fr: "Chaque élément devient un nouvel indicateur élément DHIS2 sous l'identifiant affiché (modifiez-le ici ; l'indicateur pourra être renommé ensuite). Saisissez l'identifiant d'un indicateur téléversé existant sans identifiant du fichier pour lui attribuer l'identifiant DHIS2 à la place.",
              pt: "Cada elemento torna-se um novo indicador elemento DHIS2 com o ID mostrado (edite-o aqui; o indicador pode ser renomeado depois). Escreva o ID de um indicador carregado existente sem ID do ficheiro para lhe atribuir o ID DHIS2 em vez disso.",
            })}
          </div>
          <ValueRows kind="elements" state={p.state} setState={p.setState} indicators={p.indicators} />
        </div>
      </Show>

      <Show when={p.state.uploaded.length > 0}>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({
              en: "Uploaded indicators",
              fr: "Indicateurs téléversés",
              pt: "Indicadores carregados",
            })}
          </div>
          <div class="ui-text-caption text-xs">
            {t3({
              en: "Each value the file's indicator column says becomes a new Uploaded indicator carrying it as its file id, under the id shown (edit it here; the indicator can be renamed later). Type the id of an existing Uploaded indicator that has no file id to assign the value to that indicator instead.",
              fr: "Chaque valeur de la colonne d'indicateur du fichier devient un nouvel indicateur téléversé qui la porte comme identifiant du fichier, sous l'identifiant affiché (modifiez-le ici ; l'indicateur pourra être renommé ensuite). Saisissez l'identifiant d'un indicateur téléversé existant sans identifiant du fichier pour lui attribuer la valeur à la place.",
              pt: "Cada valor da coluna de indicador do ficheiro torna-se um novo indicador carregado que o tem como ID do ficheiro, com o ID mostrado (edite-o aqui; o indicador pode ser renomeado depois). Escreva o ID de um indicador carregado existente sem ID do ficheiro para lhe atribuir o valor em vez disso.",
            })}
          </div>
          <ValueRows kind="uploaded" state={p.state} setState={p.setState} indicators={p.indicators} />
        </div>
      </Show>

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
              en: "Each DHIS2 indicator becomes a derived indicator whose formula is over the indicators its operands become.",
              fr: "Chaque indicateur DHIS2 devient un indicateur dérivé dont la formule porte sur les indicateurs que ses opérandes deviennent.",
              pt: "Cada indicador DHIS2 torna-se um indicador derivado cuja fórmula é sobre os indicadores em que os seus operandos se tornam.",
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

// The rows of one kind: the value, the id chosen for it, its label, and
// what the choice amounts to (a new indicator, an assignment to an existing
// one, or nothing because the value is already imported).
function ValueRows(p: {
  kind: ValueKind;
  state: NamingState;
  setState: SetStoreFunction<NamingState>;
  indicators: HmisIndicator[];
}) {
  const what = () => dataIdLabel(p.kind === "elements" ? "dhis2_element" : "uploaded");
  return (
    <For each={p.state[p.kind]}>
      {(row, index) => {
        const assignTarget = createMemo(() =>
          row.importedAs === undefined
            ? namingAssignTarget(row.indicator_id.trim(), p.indicators)
            : undefined
        );
        return (
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
                    en: "Already imported as",
                    fr: "Déjà importé sous",
                    pt: "Já importado como",
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
                  onChange={(v) => p.setState(p.kind, index(), "indicator_id", v)}
                  mono
                  fullWidth
                />
                <Input
                  label={t3(TC.label)}
                  value={assignTarget()?.indicator_common_label ?? row.label}
                  onChange={(v) => p.setState(p.kind, index(), "label", v)}
                  disabled={assignTarget() !== undefined}
                  fullWidth
                />
              </div>
              <Show when={assignTarget()}>
                {(target) => (
                  <div class="text-sm">
                    {t3({
                      en: `Assigns this ${what()} to the existing indicator`,
                      fr: `Attribue cet ${what()} à l'indicateur existant`,
                      pt: `Atribui este ${what()} ao indicador existente`,
                    })}{" "}
                    <span class="font-mono">{target().indicator_common_id}</span>
                  </div>
                )}
              </Show>
            </Show>
          </div>
        );
      }}
    </For>
  );
}
