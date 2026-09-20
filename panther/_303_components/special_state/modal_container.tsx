// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { children, For, type JSX, Show } from "solid-js";
import { t3 } from "../deps.ts";
import type { Intent } from "../types.ts";
import type { IconName } from "../icons/mod.ts";
import { Button } from "../form_inputs/button.tsx";
import type {
  StateHolderButtonAction,
  StateHolderFormAction,
} from "./state_holder_wrapper.tsx";

export type ModalContainerWidth =
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl";
export type ModalContainerHeight = "sm" | "md" | "lg" | "xl";

export type ModalAction = {
  label: string;
  onClick: (e: MouseEvent) => void;
  state?: StateHolderFormAction | StateHolderButtonAction;
  intent?: Intent;
  outline?: boolean;
  disabled?: boolean;
  iconName?: IconName;
  // For an icon-only action (empty label).
  ariaLabel?: string;
};

type ModalContainerProps =
  & {
    children: JSX.Element;
    width?: ModalContainerWidth;
    title?: string;
    subtitle?: string;
    topPanel?: JSX.Element;
    // The footer's action row, right-aligned: Cancel first, then actions in
    // order, the last one being the primary action. An action's error state
    // renders below the body.
    actions?: ModalAction[];
    onCancel?: () => void;
    cancelLabel?: string;
    cancelDisabled?: boolean;
    // Wraps the body and footer in a <form> so Enter in a text input clicks
    // the primary action (implicit submission); the other buttons are
    // type="button". The form itself never submits.
    form?: boolean;
    // Left side of the footer, for content that is not an action (a pager, a
    // link).
    footer?: JSX.Element;
    noContentPadding?: boolean;
  }
  & (
    | { scroll?: "content"; height?: ModalContainerHeight }
    // A fixed height needs the content region to scroll; under page scroll
    // tall content would overflow the container.
    | { scroll: "page"; height?: never }
  );

const WIDTH_CLASSES: Record<ModalContainerWidth, string> = {
  sm: "w-[min(400px,var(--ui-modal-max-w))]",
  md: "w-[min(560px,var(--ui-modal-max-w))]",
  lg: "w-[min(800px,var(--ui-modal-max-w))]",
  xl: "w-[min(1000px,var(--ui-modal-max-w))]",
  "2xl": "w-[min(1200px,var(--ui-modal-max-w))]",
  "3xl": "w-[min(1400px,var(--ui-modal-max-w))]",
  "4xl": "w-[min(1600px,var(--ui-modal-max-w))]",
};

const HEIGHT_CLASSES: Record<ModalContainerHeight, string> = {
  sm: "h-[min(480px,var(--ui-modal-max-h))]",
  md: "h-[min(640px,var(--ui-modal-max-h))]",
  lg: "h-[min(800px,var(--ui-modal-max-h))]",
  xl: "h-(--ui-modal-max-h)",
};

function actionError(state: ModalAction["state"]): string | undefined {
  return state?.status === "error" ? state.err : undefined;
}

export function ModalContainer(p: ModalContainerProps) {
  const widthClass = () => WIDTH_CLASSES[p.width ?? "md"];
  const heightClass = () => p.height ? HEIGHT_CLASSES[p.height] : "";
  const scroll = () => p.scroll ?? "content";
  // Resolved once: a JSX prop is a getter that builds fresh elements on
  // every read.
  const topPanel = children(() => p.topPanel);
  const hasTopPanel = () => topPanel.toArray().length > 0;
  const actions = () => p.actions ?? [];
  const hasFooter = () =>
    actions().length > 0 || p.onCancel !== undefined || p.footer !== undefined;
  const isPrimary = (i: number) => i === actions().length - 1;

  const body = () => (
    <>
      <div
        class="ui-spy"
        classList={{
          "px-6 py-5": !p.noContentPadding,
          "min-h-0 flex-1 overflow-y-auto": scroll() === "content",
        }}
      >
        {p.children}
        <For each={actions()}>
          {(action) => (
            <Show when={actionError(action.state)} keyed>
              {(err) => <div class="text-danger">{err}</div>}
            </Show>
          )}
        </For>
      </div>
      <Show when={hasFooter()}>
        <div class="ui-gap-sm flex items-center border-t px-6 py-5">
          <div class="ui-gap-sm flex flex-1 items-center">{p.footer}</div>
          <div class="ui-gap-sm flex flex-none items-center">
            <Show when={p.onCancel} keyed>
              {(onCancel) => (
                <Button
                  type="button"
                  intent="neutral"
                  outline
                  disabled={p.cancelDisabled}
                  onClick={onCancel}
                >
                  {p.cancelLabel ??
                    t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
                </Button>
              )}
            </Show>
            <For each={actions()}>
              {(action, i) => (
                <Button
                  type={p.form && isPrimary(i()) ? "submit" : "button"}
                  intent={action.intent}
                  outline={action.outline}
                  iconName={action.iconName}
                  state={action.state}
                  disabled={action.disabled}
                  ariaLabel={action.ariaLabel}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  );

  return (
    <div
      class={`flex flex-col ${widthClass()} ${heightClass()}`}
      classList={{ "max-h-(--ui-modal-max-h)": scroll() === "content" }}
    >
      <Show when={p.title || hasTopPanel()}>
        {
          /* A topPanel header is floored at a form control's height, as in
            HeadingBar, so a header whose controls come and go (a stepper
            that appears once loaded) does not jump. A title-only header
            keeps its natural height. */
        }
        <div class="border-b px-6 py-5 leading-none">
          <div
            class="grid items-center"
            classList={{ "min-h-(--ui-form-height)": hasTopPanel() }}
          >
            <Show
              when={hasTopPanel()}
              fallback={
                <div>
                  <h2 class="ui-text-heading leading-none">{p.title}</h2>
                  <Show when={p.subtitle}>
                    <div class="text-base-content-muted mt-2 text-sm leading-tight">
                      {p.subtitle}
                    </div>
                  </Show>
                </div>
              }
            >
              {topPanel()}
            </Show>
          </div>
        </div>
      </Show>
      <Show when={p.form} fallback={body()}>
        <form
          class="contents"
          onSubmit={(e) => e.preventDefault()}
        >
          {body()}
        </form>
      </Show>
    </div>
  );
}
