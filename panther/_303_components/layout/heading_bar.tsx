// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import { t3 } from "../deps.ts";
import { Input } from "../form_inputs/input.tsx";
import { Button } from "../form_inputs/button.tsx";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";
import type { ListItem } from "../list_selection/list_item_types.ts";
import {
  horizontalTabClasses,
  TabLabel,
  tabLabelString,
} from "./tabs/_internal/tab_label.tsx";

type HeadingBarTabs<T extends string> = {
  items: ListItem<T>[];
  value: T;
  onChange: (value: T) => void;
} & DataAttrs;

type Props<T extends string> = {
  heading?: string | JSX.Element;
  subheading?: string | JSX.Element;
  onBack?: () => void;
  tonal?: boolean;
  // A bar of controls rather than a main header: ui-pad-y around its
  // controls instead of the app's tighter header pad-y.
  comfortable?: boolean;
  leftChildren?: JSX.Element;
  // After the heading. The bar is then the tab strip's rail.
  tabs?: HeadingBarTabs<T>;
  // Sits in the centre group, before the search field.
  centerLeftChildren?: JSX.Element;
  centerChildren?: JSX.Element;
  children?: JSX.Element;
  searchText?: string;
  setSearchText?: (v: string) => void;
} & DataAttrs;

export function HeadingBar<T extends string = string>(p: Props<T>) {
  const [dataAttrs] = splitDataAttrs(p);
  // A tonal bar has a surface of its own, and that surface change IS the
  // divider. A flush bar sits on the same surface as its content, so it draws
  // one. The tonal surface is a kit-owned token, not a per-call-site choice —
  // there is exactly one tonal header in an app.
  // The flush divider is an inset shadow rather than a border: it adds no
  // height to the bar, and tabs run to the bar's bottom edge and paint their
  // underlines over it, which a border (outside the overflow clip) would not
  // allow.
  const surfaceClass = () =>
    p.tonal
      ? "ui-heading-bar-tonal"
      : "shadow-[inset_0_-1px_0_0_var(--color-border)]";
  // Slots collapse on prop PRESENCE, not on rendered content: several consumers
  // pass children that are a <Show> and render nothing under some app state,
  // and keying on output would slide the centred search field sideways as that
  // state changes.
  const hasCenter = () =>
    p.setSearchText !== undefined ||
    p.centerLeftChildren !== undefined ||
    p.centerChildren !== undefined;
  // With no left slot the centre group has nothing to be centred against, so
  // it starts at the left edge instead.
  const hasLeft = () =>
    p.heading !== undefined ||
    p.onBack !== undefined ||
    p.leftChildren !== undefined ||
    p.tabs !== undefined;
  // The title slot is a nested flex container; without min-w-0 its minimum
  // width is the full unwrapped title, so a long subheading pushes the right
  // slot out of the bar instead of truncating. The right slot only takes a
  // half when there is a centre slot to keep centred; otherwise it hugs its
  // buttons and the title gets the rest. ml-auto keeps it right-aligned when
  // it is alone in the bar.
  // Called through, not passed through: a consumer whose onBack identity
  // changes (a conditional back button) would otherwise leave a stale handler
  // bound on the button element.
  const handleBack = () => p.onBack?.();
  // Consumers pass tabs as an object literal, rebuilt whenever its value
  // changes, so the tab strip's data-* keys are read per render rather than
  // split once at setup.
  const tabsDataAttrs = (): DataAttrs =>
    p.tabs ? splitDataAttrs(p.tabs)[0] : {};

  const heightClass = () =>
    p.comfortable
      ? "h-[var(--ui-heading-bar-comfortable-height)]"
      : "h-[var(--ui-heading-bar-height)]";

  // The bar's height is fixed, not padding around its content, so every bar
  // of a form is one height whatever it holds; content taller than a form
  // control is clipped. Every slot centres its own content, so the row
  // stretches and tabs can reach the bottom edge.
  return (
    <div
      {...dataAttrs}
      class={`ui-pad-x ui-gap flex ${heightClass()} w-full flex-none items-stretch overflow-hidden ${surfaceClass()}`}
    >
      <Show when={hasLeft()}>
        <div class="ui-gap flex min-w-0 flex-1 basis-1 items-center">
          <Show when={p.onBack !== undefined}>
            <Button
              iconName="chevronLeft"
              onClick={handleBack}
              ariaLabel={t3({
                en: "Back",
                fr: "Retour",
                pt: "Voltar",
                th: "กลับ",
              })}
            />
          </Show>
          <Show when={p.leftChildren} keyed>
            {(keyedLeftChildren) => {
              return <div class="flex-none">{keyedLeftChildren}</div>;
            }}
          </Show>
          <Show when={p.heading !== undefined}>
            <div
              class={`ui-text-heading truncate ${
                p.tonal
                  ? "text-[color:var(--ui-heading-bar-tonal-content)]"
                  : ""
              }`}
            >
              {p.heading}
              <Show when={p.subheading}>
                <span class="text-base-content-muted font-400 ml-4 text-sm">
                  {p.subheading}
                </span>
              </Show>
            </div>
          </Show>
          <Show when={p.tabs}>
            <div
              {...tabsDataAttrs()}
              class="ui-gap-lg flex flex-none self-stretch"
              role="tablist"
            >
              <For each={p.tabs!.items}>
                {(item) => (
                  <button
                    type="button"
                    role="tab"
                    class={horizontalTabClasses(item.id === p.tabs!.value)}
                    aria-selected={item.id === p.tabs!.value}
                    onClick={() => p.tabs!.onChange(item.id)}
                  >
                    <TabLabel item={item} text={tabLabelString(item)} />
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={hasCenter()}>
        <div
          class={`ui-gap-sm flex flex-1 items-center ${
            hasLeft() ? "justify-center" : "justify-start"
          }`}
        >
          <Show when={p.centerLeftChildren} keyed>
            {(keyedCenterLeftChildren) => (
              <div class="flex-none">{keyedCenterLeftChildren}</div>
            )}
          </Show>
          <Show when={p.setSearchText}>
            <div class="ui-gap-sm flex min-w-48 max-w-72 flex-1 items-center">
              <Input
                onChange={p.setSearchText}
                value={p.searchText ?? ""}
                fullWidth
                searchIcon
                clearable
              />
            </div>
          </Show>
          <Show when={p.centerChildren} keyed>
            {(keyedCenterChildren) => (
              <div class="flex-none">{keyedCenterChildren}</div>
            )}
          </Show>
        </div>
      </Show>
      <Show when={p.children} keyed>
        {(keyedRightChildren) => {
          return (
            <div
              class={`ml-auto flex items-center justify-end ${
                hasCenter() && hasLeft() ? "flex-1 basis-1" : "flex-none"
              }`}
            >
              <div class="flex-none">{keyedRightChildren}</div>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
