// The naming step (PLAN_A4 ruling 6), one component for both import paths.
// A DHIS2 element or operand becomes a new base under an id
// generateIndicatorId proposes and the user edits inline; typing the id of
// an existing base that has no DHIS2 id assigns the UID to that base; any
// other existing id is refused; an element whose UID already belongs to an
// indicator is shown as imported and creates nothing. A CSV column id
// becomes an uploaded base under the file's own id. A DHIS2 indicator that
// decomposes is a derived row whose formula is previewed over the ids its
// operands are taking. The host owns the state (a Solid store) and posts
// the result; the server applies the same rules again.
import {
  definitionDataId,
  type HmisIndicator,
  type HmisIndicatorType,
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

// A DHIS2 element or operand by its UID, with the name DHIS2 gives it.
export type NamingElementCandidate = {
  dhis2_id: string;
  dhis2_label: string;
};

export type NamingDerivedCandidate = {
  // What the derived comes from (the DHIS2 indicator id): the host's key.
  key: string;
  label: string;
  // Over dhis2_ids; the transaction rewrites it over the indicators.
  expression: string;
  format_as: IndicatorFormat;
  note?: string;
};

export type NamingElementRow = NamingElementCandidate & {
  indicator_id: string;
  label: string;
  // The indicator that already carries this UID: the row creates nothing.
  importedAs?: string;
};

// A CSV column id: the file's own id is the indicator's id, so only the
// label is chosen.
export type NamingUploadedRow = {
  indicator_id: string;
  label: string;
};

export type NamingDerivedRow = NamingDerivedCandidate & {
  indicator_id: string;
};

export type NamingState = {
  elements: NamingElementRow[];
  uploaded: NamingUploadedRow[];
  derived: NamingDerivedRow[];
};

export const EMPTY_NAMING_STATE: NamingState = {
  elements: [],
  uploaded: [],
  derived: [],
};

function ownersOfDhis2Ids(indicators: HmisIndicator[]): Map<string, string> {
  const owners = new Map<string, string>();
  for (const indicator of indicators) {
    const dataId = definitionDataId(indicator.definition);
    if (dataId !== null) owners.set(dataId, indicator.indicator_common_id);
  }
  return owners;
}

// Proposed ids are generated against the dictionary as it stands plus the
// uploaded ids and every id proposed before, so two rows never collide by
// default.
export function createNamingState(args: {
  elements: NamingElementCandidate[];
  uploadedIds: string[];
  derived: NamingDerivedCandidate[];
  indicators: HmisIndicator[];
}): NamingState {
  const owners = ownersOfDhis2Ids(args.indicators);
  const existingIds = new Set([
    ...args.indicators.map((i) => i.indicator_common_id),
    ...args.uploadedIds,
  ]);
  const elements = args.elements.map<NamingElementRow>((candidate) => {
    const importedAs = owners.get(candidate.dhis2_id);
    if (importedAs !== undefined) {
      return {
        ...candidate,
        indicator_id: importedAs,
        label: candidate.dhis2_label,
        importedAs,
      };
    }
    const indicatorId = generateIndicatorId({
      label: candidate.dhis2_label,
      fallbackId: candidate.dhis2_id,
      existingIds,
    });
    existingIds.add(indicatorId);
    return { ...candidate, indicator_id: indicatorId, label: candidate.dhis2_label };
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
  return {
    elements,
    uploaded: args.uploadedIds.map((id) => ({ indicator_id: id, label: id })),
    derived,
  };
}

// The existing base without a DHIS2 id that a typed id names, if any: the
// element's UID is assigned to it instead of creating a new indicator.
export function namingAssignTarget(
  indicatorId: string,
  indicators: HmisIndicator[],
): HmisIndicator | undefined {
  const target = indicators.find((i) => i.indicator_common_id === indicatorId);
  return target?.definition.type === "uploaded" && target.definition.data_id === null
    ? target
    : undefined;
}

function idIssueText(id: string, type: HmisIndicatorType): string | undefined {
  const issue = getNewIndicatorIdIssue(id, type);
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
    fr: `« ${id} » est choisi plus d'une fois ; un indicateur porte un seul identifiant DHIS2`,
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
      issues.push(chosenTwice(row.dhis2_id, id));
    }
    chosen.add(id);
    if (namingAssignTarget(id, indicators) !== undefined) continue;
    const issue = idIssueText(id, "dhis2_element");
    if (issue !== undefined) {
      issues.push(`${row.dhis2_id}: ${issue}`);
    } else if (existingIds.has(id)) {
      issues.push(
        `${row.dhis2_id}: ${t3({
          en: `"${id}" already exists and is not an uploaded indicator, so it cannot take a DHIS2 id; choose another id`,
          fr: `« ${id} » existe déjà et n'est pas un indicateur téléversé, il ne peut donc pas recevoir d'identifiant DHIS2 ; choisissez un autre identifiant`,
          pt: `"${id}" já existe e não é um indicador carregado, pelo que não pode receber um ID DHIS2; escolha outro ID`,
        })}`,
      );
    }
    if (row.label.trim() === "") {
      issues.push(labelRequired(row.dhis2_id));
    }
  }
  for (const row of state.uploaded) {
    const id = row.indicator_id;
    if (chosen.has(id)) {
      issues.push(chosenTwice(id, id));
    }
    chosen.add(id);
    const issue = idIssueText(id, "uploaded");
    if (issue !== undefined) {
      issues.push(`${id}: ${issue}`);
    } else if (existingIds.has(id)) {
      issues.push(
        `${id}: ${t3({
          en: "already exists",
          fr: "existe déjà",
          pt: "já existe",
        })}`,
      );
    }
    if (row.label.trim() === "") {
      issues.push(labelRequired(id));
    }
  }
  for (const row of state.derived) {
    const id = row.indicator_id.trim();
    const issue = idIssueText(id, "derived");
    if (issue !== undefined) {
      issues.push(`${row.key}: ${issue}`);
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

// Every element is posted, an imported one included: the server needs its
// UID in the landing map to rewrite a derived formula that names it, and
// creates nothing for it.
export function namingInputFromState(state: NamingState): IndicatorNamingInput {
  return {
    elements: state.elements.map((row) => ({
      data_id: row.dhis2_id,
      indicator_id: row.indicator_id.trim(),
      label: row.label.trim(),
    })),
    uploaded: state.uploaded.map((row) => ({
      data_id: row.indicator_id,
      indicator_id: row.indicator_id,
      label: row.label.trim(),
    })),
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
    if (id !== "") landing[element.dhis2_id] = id;
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
              en: "Each element becomes a new indicator under the id shown (edit it here; ids cannot change later). Type the id of an existing uploaded indicator to assign the DHIS2 id to that indicator instead.",
              fr: "Chaque élément devient un nouvel indicateur sous l'identifiant affiché (modifiez-le ici ; les identifiants ne peuvent plus changer ensuite). Saisissez l'identifiant d'un indicateur téléversé existant pour lui attribuer l'identifiant DHIS2 à la place.",
              pt: "Cada elemento torna-se um novo indicador com o ID mostrado (edite-o aqui; os IDs não podem mudar depois). Escreva o ID de um indicador carregado existente para lhe atribuir o ID DHIS2 em vez disso.",
            })}
          </div>
          <For each={p.state.elements}>
            {(row, index) => {
              const assignTarget = createMemo(() =>
                row.importedAs === undefined
                  ? namingAssignTarget(row.indicator_id.trim(), p.indicators)
                  : undefined
              );
              return (
                <div class="ui-pad-sm ui-spy-sm rounded border">
                  <div class="ui-gap-sm flex items-baseline text-sm">
                    <span class="font-mono">{row.dhis2_id}</span>
                    <Show when={row.dhis2_label !== row.dhis2_id}>
                      <span class="text-base-content-muted">{row.dhis2_label}</span>
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
                        onChange={(v) => p.setState("elements", index(), "indicator_id", v)}
                        mono
                        fullWidth
                      />
                      <Input
                        label={t3(TC.label)}
                        value={assignTarget()?.indicator_common_label ?? row.label}
                        onChange={(v) => p.setState("elements", index(), "label", v)}
                        disabled={assignTarget() !== undefined}
                        fullWidth
                      />
                    </div>
                    <Show when={assignTarget()}>
                      {(target) => (
                        <div class="text-sm">
                          {t3({
                            en: "Assigns this DHIS2 id to the existing indicator",
                            fr: "Attribue cet identifiant DHIS2 à l'indicateur existant",
                            pt: "Atribui este ID DHIS2 ao indicador existente",
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
              en: "Each id is what the file says, so it is the indicator's own id and cannot change. Give each a label.",
              fr: "Chaque identifiant est celui du fichier : c'est l'identifiant de l'indicateur et il ne peut pas changer. Donnez une étiquette à chacun.",
              pt: "Cada ID é o que o ficheiro diz, pelo que é o ID do próprio indicador e não pode mudar. Dê uma etiqueta a cada um.",
            })}
          </div>
          <For each={p.state.uploaded}>
            {(row, index) => (
              <div class="ui-pad-sm ui-gap-sm grid grid-cols-2 items-end rounded border">
                <div class="font-mono text-sm">{row.indicator_id}</div>
                <Input
                  label={t3(TC.label)}
                  value={row.label}
                  onChange={(v) => p.setState("uploaded", index(), "label", v)}
                  fullWidth
                />
              </div>
            )}
          </For>
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
