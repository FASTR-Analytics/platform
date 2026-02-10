// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import { timActionForm } from "../../_302_query/mod.ts";
import type {
  APIResponseNoData,
  APIResponseWithData,
} from "../../_302_query/mod.ts";
import { Button } from "../form_inputs/button.tsx";
import type { AlertComponentProps } from "./alert.tsx";
import { ModalContainer } from "./modal_container.tsx";
import { StateHolderFormError } from "./state_holder_wrapper.tsx";

export function ConfirmDeleteForm<T>(
  p: AlertComponentProps<
    {
      text: string | JSX.Element;
      itemList?: string[];
      actionFunc: () => Promise<APIResponseWithData<T> | APIResponseNoData>;
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
    <ModalContainer
      width="md"
      topPanel={
        <div class="font-700 text-danger text-lg leading-none">Warning</div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={confirm.click}
            intent="danger"
            state={confirm.state()}
          >
            Confirm
          </Button>,
          <Button onClick={() => p.close(undefined)} intent="neutral" autofocus>
            Cancel
          </Button>,
        ]
      }
    >
      <div>{p.text}</div>
      <Show when={p.itemList}>
        <ul class="list-inside list-disc">
          <For each={p.itemList}>
            {(item) => <li class="font-700 text-sm">{item}</li>}
          </For>
        </ul>
      </Show>
      <StateHolderFormError state={confirm.state()} />
    </ModalContainer>
  );
}
