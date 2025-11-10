// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Match, Show, Switch } from "solid-js";
import { Button } from "../form_inputs/button.tsx";
import { Loading, Spinner } from "../form_inputs/mod.ts";

export type StateHolderButtonAction =
  | { status: "loading" }
  | { status: "ready" };

export type StateHolderFormAction =
  | { status: "loading" }
  | { status: "error"; err: string }
  | { status: "ready" };

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

export type StateHolder<T> =
  | { status: "loading"; msg?: string }
  | { status: "error"; err: string }
  | { status: "ready"; data: T };

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
          <Switch>
            <Match
              when={(p.onErrorButton as { label: string; onClick: () => void })
                  ?.onClick
                ? (p.onErrorButton as { label: string; onClick: () => void })
                : false}
              keyed
            >
              {(keyedOnErr) => {
                return (
                  <div class="">
                    <Button onClick={keyedOnErr.onClick}>
                      {keyedOnErr.label}
                    </Button>
                  </div>
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
                  <div class="">
                    <Button
                      href={(keyedOnErr as { label: string; link: string })
                        .link}
                    >
                      {(keyedOnErr as { label: string; link: string }).label}
                    </Button>
                  </div>
                );
              }}
            </Match>
          </Switch>
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
