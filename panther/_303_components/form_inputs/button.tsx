// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Match, Show, Switch } from "solid-js";
import type {
  StateHolderButtonAction,
  StateHolderFormAction,
} from "../special_state/mod.ts";
import type { Intent } from "../types.ts";
import { Spinner } from "./loading_el.tsx";
import type { IconName } from "../icons/mod.ts";
import { IconRenderer } from "./icon_renderer.tsx";

// Button classes composed from utility classes and component classes
function getButtonClasses(size?: "sm") {
  return [
    // Component classes (defined in CSS)
    "ui-hoverable",
    "ui-focusable",
    "ui-intent-fill",
    "ui-intent-outline",

    // Form utilities
    size === "sm" ? "ui-form-pad-sm" : "ui-form-pad",
    size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size",
    "font-400",

    // Disabled state
    "disabled:pointer-events-none",
    "disabled:opacity-40",

    // Layout and appearance
    "inline-flex",
    "flex-none",
    "select-none",
    "appearance-none",
    "items-center",
    "justify-center",
    "gap-[0.5em]",
    "whitespace-nowrap",
    "rounded",
    "border",
    "overflow-clip",
    "align-middle",
    "leading-none",

    // Width variant
    "data-[width=true]:w-full",

    // Link-specific
    "no-underline",
  ].join(" ");
}

type ButtonPropsBase = {
  children?: JSX.Element;
  id?: string;
  intent?: Intent;
  fullWidth?: boolean;
  loading?: boolean;
  state?: StateHolderButtonAction | StateHolderFormAction;
  outline?: boolean;
  fillBase100?: boolean;
  iconName?: IconName;
  iconPosition?: "left" | "right";
  ariaLabel?: string;
  size?: "sm";
};

type ButtonPropsButton = ButtonPropsBase & {
  onClick?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  onPointerDown?: JSX.EventHandlerUnion<HTMLButtonElement, MouseEvent>;
  type?: HTMLButtonElement["type"];
  form?: string;
  disabled?: HTMLButtonElement["disabled"];
  autofocus?: boolean;
  href?: never;
  download?: never;
  newTab?: never;
};

type ButtonPropsLink = ButtonPropsBase & {
  href: string;
  download?: boolean | string;
  newTab?: boolean;
  onClick?: never;
  onPointerDown?: never;
  type?: never;
  form?: never;
  disabled?: never;
  autofocus?: never;
};

type ButtonProps = ButtonPropsButton | ButtonPropsLink;

export function Button(p: ButtonProps) {
  const isLoading = () => p.loading || p.state?.status === "loading";
  const iconPos = () => p.iconPosition ?? "left";

  const content = () => (
    <>
      <Show when={isLoading()}>
        <span class="pointer-events-none absolute inset-0 flex items-center justify-center py-1.5">
          <Spinner intent={p.outline ? (p.intent ?? "primary") : "base-100"} />
        </span>
      </Show>
      {/* Icon & Text */}
      <Show when={p.children && p.iconName}>
        <Show
          when={iconPos() === "left"}
          fallback={
            <>
              <span
                class="relative inline-flex min-h-[1.25em] items-center data-[loading=true]:invisible"
                data-loading={isLoading()}
              >
                {p.children}
              </span>
              <IconRenderer
                iconName={p.iconName}
                invisible={isLoading()}
                size={p.size}
              />
            </>
          }
        >
          <IconRenderer
            iconName={p.iconName}
            invisible={isLoading()}
            size={p.size}
          />
          <span
            class="relative inline-flex min-h-[1.25em] items-center data-[loading=true]:invisible"
            data-loading={isLoading()}
          >
            {p.children}
          </span>
        </Show>
      </Show>
      {/* Only Text */}
      <Show when={p.children && !p.iconName}>
        <span
          class="relative inline-flex min-h-[1.25em] items-center data-[loading=true]:invisible"
          data-loading={isLoading()}
        >
          {p.children}
        </span>
      </Show>
      {/* Only Icon */}
      <Show when={!p.children && p.iconName}>
        <IconRenderer
          iconName={p.iconName}
          invisible={isLoading()}
          iconOnly
          size={p.size}
        />
      </Show>
    </>
  );

  return (
    <Switch>
      <Match when={!p.href}>
        <button
          class={getButtonClasses(p.size)}
          onClick={p.onClick}
          onPointerDown={p.onPointerDown}
          id={p.id}
          type={p.type}
          disabled={p.disabled}
          data-intent={p.intent}
          autofocus={p.autofocus}
          form={p.form}
          data-width={p.fullWidth}
          data-outline={!!p.outline}
          data-fill-base-100={!!p.fillBase100}
          aria-label={p.ariaLabel}
        >
          {content()}
        </button>
      </Match>
      <Match when={p.href}>
        <a
          class={getButtonClasses(p.size)}
          href={p.href}
          id={p.id}
          data-intent={p.intent}
          data-width={p.fullWidth}
          data-outline={!!p.outline}
          data-fill-base-100={!!p.fillBase100}
          target={p.download || p.newTab ? "_blank" : undefined}
          rel={p.download || p.newTab ? "noopener noreferrer" : undefined}
          download={p.download === true ? "" : p.download || undefined}
          aria-label={p.ariaLabel}
          onClick={(e) => e.stopPropagation()}
        >
          {content()}
        </a>
      </Match>
    </Switch>
  );
}
