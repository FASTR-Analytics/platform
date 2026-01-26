// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, JSX, Show } from "solid-js";
import { timActionForm } from "../../_302_query/mod.ts";
import type {
  APIResponseNoData,
  APIResponseWithData,
} from "../../_302_query/mod.ts";
import { Button } from "../form_inputs/button.tsx";
import { AlertComponentProps } from "./alert.tsx";
import { StateHolderFormError } from "./state_holder_wrapper.tsx";

export function ConfirmDeleteForm<T>(
  p: AlertComponentProps<
    {
      text: string | JSX.Element;
      itemList?: string[];
      actionFunc: () => Promise<
        APIResponseWithData<T> | APIResponseNoData
      >;
      onSuccessCallbacks?: Array<
        ((data: T) => void | Promise<void>) | (() => void | Promise<void>)
      >;
    },
    "SUCCESS"
  >,
) {
  const confirm = timActionForm(
    p.actionFunc as () => Promise<APIResponseWithData<T>>,
    ...((p.onSuccessCallbacks ?? []) as Array<
      (data: T) => void | Promise<void>
    >),
    (() => p.close("SUCCESS")) as (data: T) => void,
  );

  return (
    <div class="ui-pad-lg ui-spy max-h-[80vh] w-[min(500px,80vw)] overflow-auto">
      <div class="ui-spy-sm">
        <div class="font-700 text-danger text-lg">Warning</div>
        <div class="">{p.text}</div>
        <Show when={p.itemList}>
          <ul class="list-inside list-disc">
            <For each={p.itemList}>
              {(item) => {
                return <li class="font-700 text-sm">{item}</li>;
              }}
            </For>
          </ul>
        </Show>
      </div>
      <StateHolderFormError state={confirm.state()} />
      <div class="ui-gap-sm flex">
        <Button onClick={confirm.click} intent="danger" state={confirm.state()}>
          Confirm
        </Button>
        <Button onClick={() => p.close(undefined)} intent="neutral" autofocus>
          Cancel
        </Button>
      </div>
    </div>
  );
}
