// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, Match, Show, Switch, untrack } from "solid-js";
import { Dynamic } from "solid-js/web";
import { t3 } from "../deps.ts";
import { Button } from "../form_inputs/button.tsx";
import { Input } from "../form_inputs/input.tsx";
import type { Intent } from "../types.ts";
import { ModalContainer } from "./modal_container.tsx";

///////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////// Inputs ////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

type OpenAlertInput = {
  title?: string;
  text: string | JSX.Element;
  intent?: Intent;
  closeButtonLabel?: string;
};

type OpenConfirmInput = {
  title?: string;
  text: string | JSX.Element;
  intent?: Intent;
  confirmButtonLabel?: string;
};

type OpenPromptInput = {
  initialInputText: string;
  title?: string;
  text?: string;
  inputLabel?: string;
  inputType?: JSX.InputHTMLAttributes<HTMLInputElement>["type"];
  intent?: Intent;
  saveButtonLabel?: string;
};

export type AlertComponentProps<TProps, TReturn> = TProps & {
  close: (p: TReturn | undefined) => void;
};

type OpenComponentInput<TProps, TReturn> = {
  element: (p: AlertComponentProps<TProps, TReturn>) => JSX.Element;
  props: TProps;
};

///////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////// States ////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

type AlertStateType = OpenAlertInput & {
  stateType: "alert";
  alertResolver(): void;
};

type ConfirmStateType = OpenConfirmInput & {
  stateType: "confirm";
  confirmResolver(v: boolean): void;
};

type PromptStateType = OpenPromptInput & {
  stateType: "prompt";
  promptResolver(v: string | undefined): void;
};

type ACPStateType = AlertStateType | ConfirmStateType | PromptStateType;

function isACPState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | AnyComponentStateType
    | undefined,
): alertState is ACPStateType {
  return alertState?.stateType !== "component";
}

function isAlertState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | AnyComponentStateType
    | undefined,
): alertState is AlertStateType {
  return alertState?.stateType === "alert";
}

function isConfirmState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | AnyComponentStateType
    | undefined,
): alertState is ConfirmStateType {
  return alertState?.stateType === "confirm";
}

function isPromptState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | AnyComponentStateType
    | undefined,
): alertState is PromptStateType {
  return alertState?.stateType === "prompt";
}

function isComponentState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | AnyComponentStateType
    | undefined,
): alertState is AnyComponentStateType {
  return alertState?.stateType === "component";
}

type ComponentStateType<TProps, TReturn> =
  & OpenComponentInput<
    TProps,
    TReturn
  >
  & {
    stateType: "component";
    componentResolver(v: TReturn | undefined): void;
  };

// deno-lint-ignore no-explicit-any -- heterogeneous component props/return; per-instance generics can't be expressed in a shared union without `any`
type AnyComponentStateType = ComponentStateType<any, any>;

const [alertState, setAlertState] = createSignal<
  | AlertStateType
  | ConfirmStateType
  | PromptStateType
  | AnyComponentStateType
  | undefined
>(undefined);

// A dialog's promise must always settle. There is one global slot, so
// opening a dialog while another is live displaces it — resolve the
// displaced one as cancelled instead of dropping its resolver (which would
// leave the displaced caller awaiting forever).
function resolveAsCancelled(
  state:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | AnyComponentStateType
    | undefined,
): void {
  if (isAlertState(state)) {
    state.alertResolver();
  }
  if (isConfirmState(state)) {
    state.confirmResolver(false);
  }
  if (isPromptState(state)) {
    state.promptResolver(undefined);
  }
  if (isComponentState(state)) {
    state.componentResolver(undefined);
  }
}

function replaceAlertState(
  next:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | AnyComponentStateType,
): void {
  // untrack: open* is often called from inside an effect (sync prefix of an
  // async fn). A tracked read here would subscribe that effect to the slot,
  // and the setAlertState below would re-run it in an infinite loop.
  resolveAsCancelled(untrack(alertState));
  setAlertState(next);
}

export function openAlert(v: OpenAlertInput): Promise<void> {
  return new Promise((resolve: () => void) => {
    replaceAlertState({
      ...v,
      stateType: "alert",
      alertResolver: resolve,
    });
  });
}

export function openConfirm(v: OpenConfirmInput): Promise<boolean> {
  return new Promise<boolean>((resolve: (p: boolean) => void) => {
    replaceAlertState({
      ...v,
      stateType: "confirm",
      confirmResolver: resolve,
    });
  });
}

export function openPrompt(
  v: OpenPromptInput,
): Promise<string | undefined> {
  return new Promise<string | undefined>(
    (resolve: (p: string | undefined) => void) => {
      replaceAlertState({
        ...v,
        stateType: "prompt",
        promptResolver: resolve,
      });
    },
  );
}

export function openComponent<TProps, TReturn>(
  v: OpenComponentInput<TProps, TReturn>,
): Promise<TReturn | undefined> {
  return new Promise<TReturn | undefined>(
    (resolve: (p: TReturn | undefined) => void) => {
      replaceAlertState({
        ...v,
        stateType: "component",
        componentResolver: resolve,
      });
    },
  );
}

export default function AlertProvider() {
  // deno-lint-ignore no-unused-vars -- staged for F1 modal a11y (Escape-to-dismiss); see PLAN_303_HTML_A11Y.md
  function cancelAny() {
    resolveAsCancelled(alertState());
    setAlertState(undefined);
  }

  return (
    <Show when={alertState()} keyed>
      {(keyedAlertState) => {
        return (
          <>
            <div class="bg-scrim fixed inset-0 z-50" />
            <div class="fixed inset-0 z-50 overflow-y-auto py-12">
              <div class="flex min-h-full items-center justify-center">
                <Switch>
                  <Match
                    when={isComponentState(keyedAlertState) && keyedAlertState}
                    keyed
                  >
                    {(keyedComponentState) => {
                      return (
                        <div class="ui-never-focusable bg-base-100 z-50 mx-12 rounded border shadow-floating outline-none">
                          <Dynamic
                            component={keyedComponentState.element}
                            close={(p: unknown) => {
                              keyedComponentState.componentResolver(p);
                              setAlertState(undefined);
                            }}
                            {...keyedComponentState.props}
                          />
                        </div>
                      );
                    }}
                  </Match>
                  <Match
                    when={isACPState(keyedAlertState) && keyedAlertState}
                    keyed
                  >
                    {(keyedACPState) => {
                      return (
                        <div class="ui-never-focusable bg-base-100 z-50 mx-12 rounded border shadow-floating outline-none">
                          <ModalContainer
                            width="sm"
                            topPanel={keyedACPState.title
                              ? (
                                <h2
                                  class="ui-text-heading data-primary:text-primary data-neutral:text-neutral data-success:text-success data-danger:text-danger leading-none"
                                  data-intent={keyedACPState.intent}
                                >
                                  {keyedACPState.title}
                                </h2>
                              )
                              : undefined}
                            leftButtons={(() => {
                              const ass = keyedACPState;
                              if (isAlertState(ass)) {
                                // eslint-disable-next-line jsx-key
                                return [
                                  <Button
                                    onClick={() => {
                                      ass.alertResolver();
                                      setAlertState(undefined);
                                    }}
                                    intent={ass.intent}
                                  >
                                    {ass.closeButtonLabel ??
                                      t3({
                                        en: "Close",
                                        fr: "Fermer",
                                        pt: "Fechar",
                                      })}
                                  </Button>,
                                ];
                              }
                              if (isConfirmState(ass)) {
                                // eslint-disable-next-line jsx-key
                                return [
                                  <Button
                                    onClick={() => {
                                      ass.confirmResolver(true);
                                      setAlertState(undefined);
                                    }}
                                    intent={ass.intent}
                                  >
                                    {ass.confirmButtonLabel ??
                                      t3({
                                        en: "Confirm",
                                        fr: "Confirmer",
                                        pt: "Confirmar",
                                      })}
                                  </Button>,
                                  <Button
                                    onClick={() => {
                                      ass.confirmResolver(false);
                                      setAlertState(undefined);
                                    }}
                                    intent="neutral"
                                    autofocus
                                  >
                                    {t3({
                                      en: "Cancel",
                                      fr: "Annuler",
                                      pt: "Cancelar",
                                    })}
                                  </Button>,
                                ];
                              }
                              if (isPromptState(ass)) {
                                // eslint-disable-next-line jsx-key
                                return [
                                  <Button
                                    type="submit"
                                    form="promptForm"
                                    intent={ass.intent}
                                  >
                                    {ass.saveButtonLabel ??
                                      t3({
                                        en: "Confirm",
                                        fr: "Confirmer",
                                        pt: "Confirmar",
                                      })}
                                  </Button>,
                                  <Button
                                    type="button"
                                    onClick={() => {
                                      ass.promptResolver(undefined);
                                      setAlertState(undefined);
                                    }}
                                    intent="neutral"
                                  >
                                    {t3({
                                      en: "Cancel",
                                      fr: "Annuler",
                                      pt: "Cancelar",
                                    })}
                                  </Button>,
                                ];
                              }
                              return [];
                            })()}
                          >
                            <Show when={keyedACPState.text} keyed>
                              {(keyedText) => (
                                <Switch>
                                  <Match when={typeof keyedText === "string"}>
                                    <p>{keyedText}</p>
                                  </Match>
                                  <Match when>{keyedText}</Match>
                                </Switch>
                              )}
                            </Show>
                            <Show
                              when={isPromptState(keyedACPState) &&
                                keyedACPState}
                              keyed
                            >
                              {(keyedPromptState) => (
                                <InnerForPrompt
                                  pst={keyedPromptState}
                                  close={(v: string | undefined) => {
                                    keyedPromptState.promptResolver(v);
                                    setAlertState(undefined);
                                  }}
                                />
                              )}
                            </Show>
                          </ModalContainer>
                        </div>
                      );
                    }}
                  </Match>
                </Switch>
              </div>
            </div>
          </>
        );
      }}
    </Show>
  );
}

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

type InnerForPromptProps = {
  pst: PromptStateType;
  close: (p: string | undefined) => void;
};

function InnerForPrompt(p: InnerForPromptProps) {
  const [promptInput, setPromptInput] = createSignal<string>(
    p.pst.initialInputText,
  );
  return (
    <form
      id="promptForm"
      onSubmit={(evt) => {
        evt.preventDefault();
        p.close(promptInput());
      }}
    >
      <Input
        label={p.pst.inputLabel}
        value={promptInput()}
        onChange={(v) => setPromptInput(v)}
        autoFocus
        fullWidth
      />
    </form>
  );
}
