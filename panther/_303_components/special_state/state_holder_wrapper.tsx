// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Match, Show, Switch } from "solid-js";
import { Button } from "../form_inputs/button.tsx";
import { Loading, Spinner } from "../form_inputs/mod.ts";
import type {
  ButtonActionState,
  FormActionState,
  QueryState,
} from "../../_302_query/mod.ts";

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
  noPad?: boolean;
  spinner?: boolean;
};

export function StateHolderWrapper<T>(p: StateHolderWrapperProps<T>) {
  return (
    // <div class="h-full w-full bg-[red]">
    <Switch>
      <Match when={p.state.status === "loading"}>
        <Switch>
          <Match when={p.spinner}>
            <Spinner />
          </Match>
          <Match when={!p.spinner}>
            <Loading msg={(p.state as { msg?: string }).msg} noPad={p.noPad} />
          </Match>
        </Switch>
      </Match>
      <Match when={p.state.status === "error"}>
        <div class="data-[no-pad=false]:ui-pad ui-spy" data-no-pad={!!p.noPad}>
          <div class="text-danger">
            Error: {(p.state as { err: string }).err}
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
        {(keyedData) => p.children(keyedData)}
      </Match>
    </Switch>
    // </div>
  );
}
