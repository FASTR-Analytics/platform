// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createSignal,
  For,
  type JSX,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { t3 } from "../deps.ts";
import { Input } from "../form_inputs/input.tsx";
import type { Intent } from "../types.ts";
import { ModalContainer } from "./modal_container.tsx";

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

type DialogEntry =
  | { kind: "alert"; input: OpenAlertInput; resolve: () => void }
  | { kind: "confirm"; input: OpenConfirmInput; resolve: (v: boolean) => void }
  | {
    kind: "prompt";
    input: OpenPromptInput;
    resolve: (v: string | undefined) => void;
  }
  | {
    kind: "component";
    // deno-lint-ignore no-explicit-any -- heterogeneous component props/return; per-instance generics can't be expressed in a shared union without `any`
    input: OpenComponentInput<any, any>;
    resolve: (v: unknown) => void;
  };

// Dialogs stack: opening one over another layers it on top, and each promise
// settles when its own layer closes.
const [stack, setStack] = createSignal<DialogEntry[]>([]);

function push(entry: DialogEntry): void {
  setStack((s) => [...s, entry]);
}

function close(entry: DialogEntry): void {
  setStack((s) => s.filter((e) => e !== entry));
}

function cancel(entry: DialogEntry): void {
  switch (entry.kind) {
    case "alert":
      entry.resolve();
      break;
    case "confirm":
      entry.resolve(false);
      break;
    case "prompt":
    case "component":
      entry.resolve(undefined);
      break;
  }
  close(entry);
}

export function openAlert(v: OpenAlertInput): Promise<void> {
  return new Promise((resolve) => push({ kind: "alert", input: v, resolve }));
}

export function openConfirm(v: OpenConfirmInput): Promise<boolean> {
  return new Promise((resolve) => push({ kind: "confirm", input: v, resolve }));
}

export function openPrompt(v: OpenPromptInput): Promise<string | undefined> {
  return new Promise((resolve) => push({ kind: "prompt", input: v, resolve }));
}

export function openComponent<TProps, TReturn>(
  v: OpenComponentInput<TProps, TReturn>,
): Promise<TReturn | undefined> {
  return new Promise<TReturn | undefined>((resolve) =>
    push({
      kind: "component",
      input: v,
      resolve: resolve as (v: unknown) => void,
    })
  );
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function AlertProvider() {
  return (
    <For each={stack()}>
      {(entry) => <DialogLayer entry={entry} />}
    </For>
  );
}

function DialogLayer(p: { entry: DialogEntry }) {
  let dialogEl: HTMLDivElement | undefined;
  const isTop = () => stack()[stack().length - 1] === p.entry;

  function getFocusables(): HTMLElement[] {
    if (!dialogEl) {
      return [];
    }
    return Array.from(
      dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    );
  }

  function handleKeyDown(evt: KeyboardEvent) {
    if (!isTop()) {
      return;
    }
    if (evt.key === "Escape") {
      evt.preventDefault();
      cancel(p.entry);
      return;
    }
    if (evt.key === "Tab") {
      const focusables = getFocusables();
      if (focusables.length === 0) {
        evt.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (!dialogEl?.contains(active)) {
        evt.preventDefault();
        first.focus();
        return;
      }
      if (evt.shiftKey && active === first) {
        evt.preventDefault();
        last.focus();
      } else if (!evt.shiftKey && active === last) {
        evt.preventDefault();
        first.focus();
      }
    }
  }

  onMount(() => {
    const previouslyFocused = document.activeElement;
    document.addEventListener("keydown", handleKeyDown);
    // autofocus props may already have claimed focus; only place initial
    // focus if it is still outside the layer.
    if (dialogEl && !dialogEl.contains(document.activeElement)) {
      (getFocusables()[0] ?? dialogEl).focus();
    }
    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus();
      }
    });
  });

  const label = () =>
    p.entry.kind === "component" ? undefined : p.entry.input.title;

  return (
    <>
      <div class="bg-scrim fixed inset-0 z-50" />
      <div
        ref={dialogEl}
        class="fixed inset-0 z-50 overflow-y-auto outline-none [container-type:size]"
        role="dialog"
        aria-modal="true"
        aria-label={label()}
        tabindex="-1"
      >
        <div class="flex min-h-full items-center justify-center">
          <div class="ui-never-focusable bg-base-100 z-50 m-(--ui-modal-gutter) rounded border shadow-floating outline-none">
            <Switch>
              <Match when={p.entry.kind === "component" && p.entry} keyed>
                {(entry) => (
                  <Dynamic
                    component={entry.input.element}
                    close={(v: unknown) => {
                      entry.resolve(v);
                      close(entry);
                    }}
                    {...entry.input.props}
                  />
                )}
              </Match>
              <Match when={p.entry.kind === "alert" && p.entry} keyed>
                {(entry) => (
                  <BuiltInDialog
                    title={entry.input.title}
                    text={entry.input.text}
                    intent={entry.input.intent}
                    actions={[{
                      label: entry.input.closeButtonLabel ??
                        t3({ en: "Close", fr: "Fermer", pt: "Fechar" }),
                      intent: entry.input.intent,
                      onClick: () => {
                        entry.resolve();
                        close(entry);
                      },
                    }]}
                  />
                )}
              </Match>
              <Match when={p.entry.kind === "confirm" && p.entry} keyed>
                {(entry) => (
                  <BuiltInDialog
                    title={entry.input.title}
                    text={entry.input.text}
                    intent={entry.input.intent}
                    onCancel={() => cancel(entry)}
                    actions={[{
                      label: entry.input.confirmButtonLabel ??
                        t3({ en: "Confirm", fr: "Confirmer", pt: "Confirmar" }),
                      intent: entry.input.intent,
                      onClick: () => {
                        entry.resolve(true);
                        close(entry);
                      },
                    }]}
                  />
                )}
              </Match>
              <Match when={p.entry.kind === "prompt" && p.entry} keyed>
                {(entry) => <PromptDialog entry={entry} />}
              </Match>
            </Switch>
          </div>
        </div>
      </div>
    </>
  );
}

type BuiltInDialogProps = {
  title?: string;
  text?: string | JSX.Element;
  intent?: Intent;
  actions: { label: string; intent?: Intent; onClick: () => void }[];
  onCancel?: () => void;
  form?: boolean;
  children?: JSX.Element;
};

function BuiltInDialog(p: BuiltInDialogProps) {
  return (
    <ModalContainer
      width="sm"
      topPanel={p.title
        ? (
          <h2
            class="ui-text-heading data-primary:text-primary data-neutral:text-neutral data-success:text-success data-danger:text-danger leading-none"
            data-intent={p.intent}
          >
            {p.title}
          </h2>
        )
        : undefined}
      actions={p.actions}
      onCancel={p.onCancel}
      form={p.form}
    >
      <Show when={p.text} keyed>
        {(text) => (
          <Switch>
            <Match when={typeof text === "string"}>
              <p>{text}</p>
            </Match>
            <Match when={typeof text !== "string"}>{text}</Match>
          </Switch>
        )}
      </Show>
      {p.children}
    </ModalContainer>
  );
}

function PromptDialog(
  p: { entry: Extract<DialogEntry, { kind: "prompt" }> },
) {
  const [promptInput, setPromptInput] = createSignal<string>(
    p.entry.input.initialInputText,
  );
  return (
    <BuiltInDialog
      title={p.entry.input.title}
      text={p.entry.input.text}
      intent={p.entry.input.intent}
      form
      onCancel={() => cancel(p.entry)}
      actions={[{
        label: p.entry.input.saveButtonLabel ??
          t3({ en: "Confirm", fr: "Confirmer", pt: "Confirmar" }),
        intent: p.entry.input.intent,
        onClick: () => {
          p.entry.resolve(promptInput());
          close(p.entry);
        },
      }]}
    >
      <Input
        label={p.entry.input.inputLabel}
        type={p.entry.input.inputType}
        value={promptInput()}
        onChange={setPromptInput}
        autoFocus
        fullWidth
      />
    </BuiltInDialog>
  );
}
