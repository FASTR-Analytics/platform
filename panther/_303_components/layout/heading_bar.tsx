// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { JSX, Show } from "solid-js";
import { Input } from "../form_inputs/input.tsx";
import { Button } from "../form_inputs/button.tsx";

type Props = {
  heading: string;
  children?: JSX.Element;
  leftChildren?: JSX.Element;
  setSearchText?: (v: string) => void;
  searchText?: string;
  french?: boolean;
};

export function HeadingBar(p: Props) {
  return (
    <div class="ui-pad ui-gap flex w-full flex-none items-center overflow-hidden border-b">
      <div class="flex flex-1 basis-1 items-center">
        <Show when={p.leftChildren} keyed>
          {(keyedLeftChildren) => {
            return <div class="flex-none">{keyedLeftChildren}</div>;
          }}
        </Show>
        <div class="font-700 truncate py-1.5 text-xl">{p.heading}</div>
      </div>
      <div class="ui-gap-sm flex flex-1 items-center justify-center">
        <Show when={p.setSearchText}>
          <div class="ui-gap-sm flex min-w-48 max-w-72 flex-1 items-center">
            <Input
              onChange={p.setSearchText}
              value={p.searchText ?? ""}
              fullWidth
              label={p.french ? "Recherche" : "Search"}
              searchIcon
            />
            <Show when={p.searchText}>
              <Button
                onClick={() => p.setSearchText!("")}
                iconName="x"
                intent="neutral"
                outline
              />
            </Show>
          </div>
        </Show>
      </div>
      <div class="flex flex-1 basis-1 items-center justify-end">
        <Show when={p.children} keyed>
          {(keyedRightChildren) => {
            return <div class="flex-none">{keyedRightChildren}</div>;
          }}
        </Show>
      </div>
    </div>
  );
}

export function HeadingBarMainRibbon(p: Props) {
  return (
    <div class="ui-pad ui-gap bg-base-content text-base-100 flex w-full flex-none items-center overflow-hidden">
      <Show when={p.leftChildren} keyed>
        {(keyedLeftChildren) => {
          return <div class="flex-none">{keyedLeftChildren}</div>;
        }}
      </Show>
      <div class="font-700 flex-1 py-1.5 text-lg">{p.heading}</div>
      <Show when={p.children} keyed>
        {(keyedRightChildren) => {
          return <div class="flex-none">{keyedRightChildren}</div>;
        }}
      </Show>
    </div>
  );
}

type HeaderBarCanGoBackProps = {
  heading: string | JSX.Element;
  children?: JSX.Element;
  back?: () => void;
};

export function HeaderBarCanGoBack(p: HeaderBarCanGoBackProps) {
  return (
    <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
      <Show when={p.back !== undefined}>
        <Button iconName="chevronLeft" onClick={p.back} />
      </Show>
      <div class="font-700 flex-1 truncate text-xl">{p.heading}</div>
      <div class="flex flex-none items-center">{p.children}</div>
    </div>
  );
}
