// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, JSX, Match, Show, Switch } from "solid-js";
import { Dynamic } from "solid-js/web";
import { Button } from "../form_inputs/button.tsx";
import { Input } from "../form_inputs/input.tsx";
import { Intent } from "../types.ts";
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
    | ComponentStateType<any, any>
    | undefined,
): alertState is ACPStateType {
  return alertState?.stateType !== "component";
}

function isAlertState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | ComponentStateType<any, any>
    | undefined,
): alertState is AlertStateType {
  return alertState?.stateType === "alert";
}

function isConfirmState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | ComponentStateType<any, any>
    | undefined,
): alertState is ConfirmStateType {
  return alertState?.stateType === "confirm";
}

function isPromptState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | ComponentStateType<any, any>
    | undefined,
): alertState is PromptStateType {
  return alertState?.stateType === "prompt";
}

function isComponentState(
  alertState:
    | AlertStateType
    | ConfirmStateType
    | PromptStateType
    | ComponentStateType<any, any>
    | undefined,
): alertState is ComponentStateType<any, any> {
  return alertState?.stateType === "component";
}

type ComponentStateType<TProps, TReturn> = OpenComponentInput<
  TProps,
  TReturn
> & {
  stateType: "component";
  componentResolver(v: TReturn | undefined): void;
};

const [alertState, setAlertState] = createSignal<
  | AlertStateType
  | ConfirmStateType
  | PromptStateType
  | ComponentStateType<any, any>
  | undefined
>(undefined);

export async function openAlert(v: OpenAlertInput): Promise<void> {
  return new Promise((resolve: () => void, reject) => {
    setAlertState({
      ...v,
      stateType: "alert",
      alertResolver: resolve,
    });
  });
}

export async function openConfirm(v: OpenConfirmInput): Promise<boolean> {
  return new Promise<boolean>((resolve: (p: boolean) => void, reject) => {
    setAlertState({
      ...v,
      stateType: "confirm",
      confirmResolver: resolve,
    });
  });
}

export async function openPrompt(
  v: OpenPromptInput,
): Promise<string | undefined> {
  return new Promise<string | undefined>(
    (resolve: (p: string | undefined) => void, reject) => {
      setAlertState({
        ...v,
        stateType: "prompt",
        promptResolver: resolve,
      });
    },
  );
}

export async function openComponent<TProps, TReturn>(
  v: OpenComponentInput<TProps, TReturn>,
): Promise<TReturn | undefined> {
  return new Promise<TReturn | undefined>(
    (resolve: (p: TReturn | undefined) => void, reject) => {
      setAlertState({
        ...v,
        stateType: "component",
        componentResolver: resolve,
      });
    },
  );
}

export default function AlertProvider() {
  function cancelAny() {
    const ass = alertState();
    if (isAlertState(ass)) {
      ass.alertResolver();
    }
    if (isConfirmState(ass)) {
      ass.confirmResolver(false);
    }
    if (isPromptState(ass)) {
      ass.promptResolver(undefined);
    }
    if (isComponentState(ass)) {
      ass.componentResolver(undefined);
    }
    setAlertState(undefined);
  }

  return (
    <Show when={alertState()} keyed>
      {(keyedAlertState) => {
        return (
          <>
            <div class="fixed inset-0 z-50 bg-black/30" />
            <div class="fixed inset-0 z-50 overflow-y-auto py-12">
              <div class="flex min-h-full items-center justify-center">
                <Switch>
                  <Match
                    when={isComponentState(keyedAlertState) && keyedAlertState}
                    keyed
                  >
                    {(keyedComponentState) => {
                      return (
                        <div class="ui-never-focusable bg-base-100 z-50 mx-12 rounded shadow-lg outline-none">
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
                        <div class="ui-never-focusable bg-base-100 z-50 mx-12 rounded shadow-lg outline-none">
                          <ModalContainer
                            width="sm"
                            topPanel={
                              <Show when={keyedACPState.title} keyed>
                                {(keyedTitle) => (
                                  <h2
                                    class="ui-text-heading data-primary:text-primary data-neutral:text-neutral data-success:text-success data-danger:text-danger leading-none"
                                    data-intent={keyedACPState.intent}
                                  >
                                    {keyedTitle}
                                  </h2>
                                )}
                              </Show>
                            }
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
                                    {ass.closeButtonLabel ?? "Close"}
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
                                    {ass.confirmButtonLabel ?? "Confirm"}
                                  </Button>,
                                  <Button
                                    onClick={() => {
                                      ass.confirmResolver(false);
                                      setAlertState(undefined);
                                    }}
                                    intent="neutral"
                                    autofocus
                                  >
                                    Cancel
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
                                    {ass.saveButtonLabel ?? "Confirm"}
                                  </Button>,
                                  <Button
                                    type="button"
                                    onClick={() => {
                                      ass.promptResolver(undefined);
                                      setAlertState(undefined);
                                    }}
                                    intent="neutral"
                                  >
                                    Cancel
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
                                  <Match when={true}>{keyedText}</Match>
                                </Switch>
                              )}
                            </Show>
                            <Show
                              when={
                                isPromptState(keyedACPState) && keyedACPState
                              }
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

function InnerForPrompt(props: InnerForPromptProps) {
  const [promptInput, setPromptInput] = createSignal<string>(
    props.pst.initialInputText,
  );
  return (
    <form
      id="promptForm"
      onSubmit={(evt) => {
        evt.preventDefault();
        props.close(promptInput());
      }}
    >
      <Input
        label={props.pst.inputLabel}
        value={promptInput()}
        onChange={(v) => setPromptInput(v)}
        autoFocus
        fullWidth
      />
    </form>
  );
}
