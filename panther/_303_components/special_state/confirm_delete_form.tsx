// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, type JSX, Show } from "solid-js";
import { createFormAction, t3 } from "../deps.ts";
import type { APIResponseNoData, APIResponseWithData } from "../deps.ts";
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
        <div class="font-700 text-danger text-lg leading-none">
          {t3({ en: "Warning", fr: "Avertissement", pt: "Aviso" })}
        </div>
      }
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            onClick={confirm.click}
            intent="danger"
            state={confirm.state()}
          >
            {t3({ en: "Confirm", fr: "Confirmer", pt: "Confirmar" })}
          </Button>,
          <Button onClick={() => p.close(undefined)} intent="neutral" autofocus>
            {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
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
