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
// Used by the module settings editor and the results-package wizard.
export function ModuleParameterInputs(p: Props) {
  return (
    <div class="ui-gap grid grid-cols-12">
      <For
        each={p.parameters}
        fallback={
          <div class="text-neutral col-span-12">
            {t3({
              en: "No parameters for this module",
              fr: "Aucun paramètre pour ce module",
              pt: "Nenhum parâmetro para este módulo",
            })}
          </div>
        }
      >
        {(inputParameter) => {
          return (
            <div class="ui-spy-sm col-span-12 lg:col-span-6 xl:col-span-3">
              <div class="text-md font-700">{inputParameter.description}</div>
              <div class="">
                <Switch
                  fallback={t3({
                    en: "Bad input type",
                    fr: "Type de saisie incorrect",
                    pt: "Tipo de entrada inválido",
                  })}
                >
                  <Match when={inputParameter.input.inputType === "number"}>
                    <Input
                      value={p.values[inputParameter.replacementString] ?? ""}
                      onChange={(v) =>
                        p.onChange(inputParameter.replacementString, v)
                      }
                      invalidMsg={
                        isNaN(
                          Number(p.values[inputParameter.replacementString]),
                        )
                          ? t3({
                              en: "Not a number",
                              fr: "Pas un nombre",
                              pt: "Não é um número",
                            })
                          : undefined
                      }
                      fullWidth
                    />
                  </Match>

                  <Match when={inputParameter.input.inputType === "text"}>
                    <Input
                      value={p.values[inputParameter.replacementString] ?? ""}
                      onChange={(v) =>
                        p.onChange(inputParameter.replacementString, v)
                      }
                      invalidMsg={
                        !p.values[inputParameter.replacementString]
                          ? t3({ en: "No text", fr: "Aucun texte", pt: "Sem texto" })
                          : undefined
                      }
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
                    {(keyedOptions) => {
                      return (
                        <Select
                          options={keyedOptions}
                          value={p.values[inputParameter.replacementString]}
                          onChange={(v) =>
                            p.onChange(inputParameter.replacementString, v)
                          }
                          invalidMsg={
                            !p.values[inputParameter.replacementString]
                              ? t3({
                                  en: "Unselected",
                                  fr: "Non sélectionné",
                                  pt: "Não selecionado",
                                })
                              : undefined
                          }
                          fullWidth
                        />
                      );
                    }}
                  </Match>
                  <Match when={inputParameter.input.inputType === "boolean"}>
                    <Checkbox
                      label={t3({ en: "Yes / No", fr: "Oui / Non", pt: "Sim / Não" })}
                      checked={
                        p.values[inputParameter.replacementString] === "TRUE"
                      }
                      onChange={(v) =>
                        p.onChange(
                          inputParameter.replacementString,
                          v ? "TRUE" : "FALSE",
                        )
                      }
                    />
                  </Match>
                </Switch>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}
