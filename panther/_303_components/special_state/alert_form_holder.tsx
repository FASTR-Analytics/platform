// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type JSX, Show } from "solid-js";
import {
  type StateHolderFormAction,
  StateHolderFormError,
} from "./state_holder_wrapper.tsx";
import { Button } from "../form_inputs/button.tsx";

type AlertFormHolderProps = {
  children: JSX.Element;
  formId: string;
  header: string;
  savingState?: StateHolderFormAction;
  saveFunc?: (e: MouseEvent) => Promise<void>;
  cancelFunc: () => void;
  hideSaveButton?: boolean;
  saveButtonText?: string;
  cancelButtonText?: string;
  wider?: boolean;
  disableSaveButton?: boolean;
  french?: boolean;
};

export function AlertFormHolder(p: AlertFormHolderProps) {
  return (
    <form
      id={p.formId}
      class="ui-spy ui-pad-lg max-h-[80vh] w-[min(500px,80vw)] overflow-auto data-[wider=true]:w-[min(800px,80vw)]"
      data-wider={p.wider}
    >
      <div class="space-y-3">
        <div class="font-700 text-lg">{p.header}</div>
        <div class="space-y-4">{p.children}</div>
      </div>
      <Show when={p.savingState}>
        <StateHolderFormError state={p.savingState!} />
      </Show>
      <div class="ui-gap-sm flex">
        <Show when={p.hideSaveButton !== true && p.saveFunc && p.savingState}>
          <Button
            onClick={p.saveFunc!}
            intent="success"
            form={p.formId}
            state={p.savingState!}
            disabled={p.disableSaveButton}
          >
            {p.saveButtonText ?? (p.french ? "Sauvegarder" : "Save")}
          </Button>
        </Show>
        <Button onClick={p.cancelFunc} intent="neutral">
          {p.cancelButtonText ?? (p.french ? "Annuler" : "Cancel")}
        </Button>
      </div>
    </form>
  );
}
