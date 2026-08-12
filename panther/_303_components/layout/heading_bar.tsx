// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Show } from "solid-js";
import { Input } from "../form_inputs/input.tsx";
import { Button } from "../form_inputs/button.tsx";

type Props = {
  heading: string | JSX.Element;
  subheading?: string | JSX.Element;
  onBack?: () => void;
  tonal?: boolean;
  leftChildren?: JSX.Element;
  centerChildren?: JSX.Element;
  children?: JSX.Element;
  searchText?: string;
  setSearchText?: (v: string) => void;
};

export function HeadingBar(p: Props) {
  // A tonal bar has a surface of its own, and that surface change IS the
  // divider. A flush bar sits on the same surface as its content, so it draws
  // one. The tonal surface is a kit-owned token, not a per-call-site choice —
  // there is exactly one tonal header in an app.
  const surfaceClass = () => p.tonal ? "ui-heading-bar-tonal" : "border-b";
  // Slots collapse on prop PRESENCE, not on rendered content: several consumers
  // pass children that are a <Show> and render nothing under some app state,
  // and keying on output would slide the centred search field sideways as that
  // state changes.
  const hasCenter = () =>
    p.setSearchText !== undefined || p.centerChildren !== undefined;
  // Called through, not passed through: a consumer whose onBack identity
  // changes (a conditional back button) would otherwise leave a stale handler
  // bound on the button element.
  const handleBack = () => p.onBack?.();

  // The inner row's height floor is a form control's height, so a bar holding
  // only a title is as tall as one holding buttons. It cannot sit on the root,
  // which carries ui-pad over box-sizing: border-box.
  return (
    <div class={`ui-pad w-full flex-none overflow-hidden ${surfaceClass()}`}>
      <div class="ui-gap flex min-h-[var(--ui-form-height)] w-full items-center">
        <div class="ui-gap flex flex-1 basis-1 items-center">
          <Show when={p.onBack !== undefined}>
            <Button iconName="chevronLeft" onClick={handleBack} />
          </Show>
          <Show when={p.leftChildren} keyed>
            {(keyedLeftChildren) => {
              return <div class="flex-none">{keyedLeftChildren}</div>;
            }}
          </Show>
          <div class="ui-text-title truncate">
            {p.heading}
            <Show when={p.subheading}>
              <span class="font-400 ml-4">{p.subheading}</span>
            </Show>
          </div>
        </div>
        <Show when={hasCenter()}>
          <div class="ui-gap-sm flex flex-1 items-center justify-center">
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
              <div class="flex flex-1 basis-1 items-center justify-end">
                <div class="flex-none">{keyedRightChildren}</div>
              </div>
            );
          }}
        </Show>
      </div>
    </div>
  );
}
