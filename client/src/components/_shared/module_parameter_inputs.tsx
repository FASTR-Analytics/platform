import { t3, type ModuleParameter } from "lib";
import { Checkbox, Input, Select } from "panther";
import { For, Match, Switch } from "solid-js";

type Props = {
  parameters: ModuleParameter[];
  values: Record<string, string>;
  onChange: (replacementString: string, value: string) => void;
};

// A module definition's parameter selections as inputs (all values are
// strings keyed by replacementString; booleans round-trip "TRUE"/"FALSE").
// Used by the module-defaults editor and the results-package wizard; both
// gate their saves on getModuleParameterInvalidMsg, the same check that
// drives each input's inline invalid message.
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

export function ModuleParameterInputs(p: Props) {
  return (
    <div class="ui-gap grid grid-cols-12">
      <For
        each={p.parameters}
        fallback={
          <div class="text-base-content-muted col-span-12">
            {t3({
              en: "No parameters for this module",
              fr: "Aucun paramètre pour ce module",
              pt: "Nenhum parâmetro para este módulo",
            })}
          </div>
        }
      >
        {(inputParameter) => {
          const value = () => p.values[inputParameter.replacementString];
          const invalidMsg = () =>
            getModuleParameterInvalidMsg(inputParameter, value());
          const onChange = (v: string) =>
            p.onChange(inputParameter.replacementString, v);
          return (
            <div class="col-span-12 xl:col-span-3">
              <Switch
                fallback={t3({
                  en: "Bad input type",
                  fr: "Type de saisie incorrect",
                  pt: "Tipo de entrada inválido",
                })}
              >
                <Match
                  when={
                    inputParameter.input.inputType === "number" ||
                    inputParameter.input.inputType === "text"
                  }
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
                  when={
                    inputParameter.input.inputType === "select" &&
                    inputParameter.input.options
                  }
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
                  <div class="ui-spy-sm">
                    <div class="ui-label">{inputParameter.description}</div>
                    <Checkbox
                      label={t3({ en: "Yes / No", fr: "Oui / Non", pt: "Sim / Não" })}
                      checked={value() === "TRUE"}
                      onChange={(v) => onChange(v ? "TRUE" : "FALSE")}
                    />
                  </div>
                </Match>
              </Switch>
            </div>
          );
        }}
      </For>
    </div>
  );
}
