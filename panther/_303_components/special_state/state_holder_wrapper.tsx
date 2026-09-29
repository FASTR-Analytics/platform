// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { ErrorBoundary, type JSX, Match, Show, Switch } from "solid-js";
import { t3 } from "../deps.ts";
import { Button } from "../form_inputs/button.tsx";
import { LoadingIndicator, Spinner } from "../form_inputs/mod.ts";
import type { PadSize } from "../types.ts";
import { padClass } from "../_internal/pad_classes.ts";
import type {
  ButtonActionState,
  FormActionState,
  QueryState,
} from "../deps.ts";

export type StateHolderButtonAction = ButtonActionState;
export type StateHolderFormAction = FormActionState;
export type StateHolder<T> = QueryState<T>;

type StateHolderErrorProps = {
  state: StateHolderFormAction;
};

export function StateHolderFormError(p: StateHolderErrorProps) {
  return (
    <Show when={p.state.status === "error" ? p.state.err : false} keyed>
      {(keyedErr) => {
        return <div class="text-danger">{keyedErr}</div>;
      }}
    </Show>
  );
}

type StateHolderWrapperProps<T> = {
  state: StateHolder<T>;
  children: (v: T) => JSX.Element;
  loadingRenderer?: (msg: string | undefined) => JSX.Element;
  errorRenderer?: (err: string) => JSX.Element;
  onErrorButton?:
    | {
      label: string;
      onClick: () => void;
    }
    | {
      label: string;
      link: string;
    };
  onErrorSecondaryButton?:
    | {
      label: string;
      onClick: () => void;
    }
    | {
      label: string;
      link: string;
    };
  loadingAndErrorPad?: PadSize;
  spinner?: boolean;
};

export function StateHolderWrapper<T>(p: StateHolderWrapperProps<T>) {
  const messagePad = () => padClass(p.loadingAndErrorPad);
  return (
    <Switch>
      <Match when={p.state.status === "loading"}>
        <Switch>
          <Match when={p.loadingRenderer}>
            {p.loadingRenderer!((p.state as { msg?: string }).msg)}
          </Match>
          <Match when={p.spinner}>
            <Spinner />
          </Match>
          <Match when={!p.spinner}>
            <LoadingIndicator
              msg={(p.state as { msg?: string }).msg}
              pad={p.loadingAndErrorPad}
            />
          </Match>
        </Switch>
      </Match>
      <Match when={p.state.status === "error" && p.errorRenderer}>
        {p.errorRenderer!((p.state as { err: string }).err)}
      </Match>
      <Match when={p.state.status === "error"}>
        <div class={[messagePad(), "ui-spy"].filter(Boolean).join(" ")}>
          <div class="text-danger">
            {t3({ en: "Error: ", fr: "Erreur : ", pt: "Erro: " })}
            {(p.state as { err: string }).err}
          </div>
          <div class="ui-gap-sm flex">
            <Switch>
              <Match
                when={(p.onErrorButton as {
                    label: string;
                    onClick: () => void;
                  })
                    ?.onClick
                  ? (p.onErrorButton as { label: string; onClick: () => void })
                  : false}
                keyed
              >
                {(keyedOnErr) => {
                  return (
                    <Button onClick={keyedOnErr.onClick}>
                      {keyedOnErr.label}
                    </Button>
                  );
                }}
              </Match>
              <Match
                when={(p.onErrorButton as { label: string; link: string })?.link
                  ? (p.onErrorButton as { label: string; link: string })
                  : false}
                keyed
              >
                {(keyedOnErr) => {
                  return (
                    <Button
                      href={(keyedOnErr as { label: string; link: string })
                        .link}
                    >
                      {(keyedOnErr as { label: string; link: string }).label}
                    </Button>
                  );
                }}
              </Match>
            </Switch>
            <Switch>
              <Match
                when={(p.onErrorSecondaryButton as {
                    label: string;
                    onClick: () => void;
                  })
                    ?.onClick
                  ? (p.onErrorSecondaryButton as {
                    label: string;
                    onClick: () => void;
                  })
                  : false}
                keyed
              >
                {(keyedOnErr) => {
                  return (
                    <Button onClick={keyedOnErr.onClick} intent="danger">
                      {keyedOnErr.label}
                    </Button>
                  );
                }}
              </Match>
              <Match
                when={(p.onErrorSecondaryButton as {
                    label: string;
                    link: string;
                  })?.link
                  ? (p.onErrorSecondaryButton as {
                    label: string;
                    link: string;
                  })
                  : false}
                keyed
              >
                {(keyedOnErr) => {
                  return (
                    <Button
                      href={(keyedOnErr as { label: string; link: string })
                        .link}
                      intent="danger"
                    >
                      {(keyedOnErr as { label: string; link: string }).label}
                    </Button>
                  );
                }}
              </Match>
            </Switch>
          </div>
        </div>
      </Match>
      <Match
        when={p.state.status === "ready" && (p.state as { data: T }).data}
        keyed
      >
        {(keyedData) => (
          <ErrorBoundary
            fallback={(err) => (
              <div class={messagePad()}>
                <div class="text-danger">
                  {t3({ en: "Error: ", fr: "Erreur : ", pt: "Erro: " })}
                  {err instanceof Error ? err.message : String(err)}
                </div>
              </div>
            )}
          >
            {p.children(keyedData)}
          </ErrorBoundary>
        )}
      </Match>
    </Switch>
  );
}
