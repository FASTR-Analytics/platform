import { type ModuleParameter, t3 } from "lib";
import { Input, Select } from "panther";
import { For, Match, Show, Switch } from "solid-js";
import { DefinitionDefaultMarker } from "./definition_default_marker.tsx";

type Props = {
  parameters: ModuleParameter[];
  values: Record<string, string>;
  onChange: (replacementString: string, value: string) => void;
  // When present, a param whose value differs from its definition default
  // is marked, with this per-param reset to it.
  onResetToDefault?: (replacementString: string) => void;
};

// A module definition's parameter selections as inputs (all values are
// strings keyed by replacementString; booleans round-trip "TRUE"/"FALSE").
// Rendered only by the module-defaults editor, the one writer of parameter
// values; it gates its save on getModuleParameterInvalidMsg, the same check
// that drives each input's inline invalid message and that the wizard runs
// over the stored defaults before launch.
export function getModuleParameterInvalidMsg(
  parameter: ModuleParameter,
  value: string | undefined,
): string | undefined {
  if (parameter.input.inputType === "number") {
    return isNaN(Number(value))
      ? t3({ en: "Not a number", fr: "Pas un nombre", pt: "Não é um número" })
      : undefined;
  }
  if (parameter.input.inputType === "text") {
    return !value
      ? t3({ en: "No text", fr: "Aucun texte", pt: "Sem texto" })
      : undefined;
  }
  if (parameter.input.inputType === "select") {
    return !value
      ? t3({ en: "Unselected", fr: "Non sélectionné", pt: "Não selecionado" })
      : undefined;
  }
  return undefined;
}

function displayParameterValue(
  parameter: ModuleParameter,
  value: string,
): string {
  if (parameter.input.inputType === "boolean") {
    return value === "TRUE"
      ? t3({ en: "Yes", fr: "Oui", pt: "Sim" })
      : t3({ en: "No", fr: "Non", pt: "Não" });
  }
  if (parameter.input.inputType === "select") {
    return parameter.input.options?.find((o) => o.value === value)?.label ??
      value;
  }
  return value === ""
    ? t3({ en: "(empty)", fr: "(vide)", pt: "(vazio)" })
    : value;
}

export function ModuleParameterInputs(p: Props) {
  return (
    <div class="ui-gap grid grid-cols-12">
      <For each={p.parameters}>
        {(inputParameter) => {
          const value = () => p.values[inputParameter.replacementString];
          const invalidMsg = () =>
            getModuleParameterInvalidMsg(inputParameter, value());
          const onChange = (v: string) =>
            p.onChange(inputParameter.replacementString, v);
          return (
            <div class="col-span-12 md:col-span-6 xl:col-span-3">
              <Switch
                fallback={t3({
                  en: "Bad input type",
                  fr: "Type de saisie incorrect",
                  pt: "Tipo de entrada inválido",
                })}
              >
                <Match
                  when={inputParameter.input.inputType === "number" ||
                    inputParameter.input.inputType === "text"}
                >
                  <Input
                    label={inputParameter.description}
                    value={value() ?? ""}
                    onChange={onChange}
                    invalidMsg={invalidMsg()}
                    fullWidth
                  />
                </Match>
                <Match
                  when={inputParameter.input.inputType === "select" &&
                    inputParameter.input.options}
                  keyed
                >
                  {(keyedOptions) => (
                    <Select
                      label={inputParameter.description}
                      options={keyedOptions}
                      value={value()}
                      onChange={onChange}
                      invalidMsg={invalidMsg()}
                      fullWidth
                    />
                  )}
                </Match>
                <Match when={inputParameter.input.inputType === "boolean"}>
                  <Select
                    label={inputParameter.description}
                    options={[
                      {
                        value: "TRUE",
                        label: t3({ en: "Yes", fr: "Oui", pt: "Sim" }),
                      },
                      {
                        value: "FALSE",
                        label: t3({ en: "No", fr: "Non", pt: "Não" }),
                      },
                    ]}
                    value={value()}
                    onChange={onChange}
                    fullWidth
                  />
                </Match>
              </Switch>
              <Show
                when={p.onResetToDefault &&
                  value() !== inputParameter.input.defaultValue}
              >
                <div class="pt-1">
                  <DefinitionDefaultMarker
                    defaultText={displayParameterValue(
                      inputParameter,
                      inputParameter.input.defaultValue,
                    )}
                    onReset={() =>
                      p.onResetToDefault?.(inputParameter.replacementString)}
                  />
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}
