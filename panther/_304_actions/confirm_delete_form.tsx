// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import {
  type AlertComponentProps,
  type APIResponseNoData,
  type APIResponseWithData,
  createFormAction,
  ModalContainer,
  t3,
} from "./deps.ts";

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
  const confirm = createFormAction(
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
        <div class="ui-text-heading text-danger leading-none">
          {t3({ en: "Warning", fr: "Avertissement", pt: "Aviso" })}
        </div>
      }
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({ en: "Confirm", fr: "Confirmer", pt: "Confirmar" }),
        intent: "danger",
        onClick: confirm.click,
        state: confirm.state(),
      }]}
    >
      <div>{p.text}</div>
      <Show when={p.itemList}>
        <ul class="list-inside list-disc">
          <For each={p.itemList}>
            {(item) => <li class="font-700 text-sm">{item}</li>}
          </For>
        </ul>
      </Show>
    </ModalContainer>
  );
}
