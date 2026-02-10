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
import type { IconName } from "../icons/icons.tsx";
import {
  ModalContainer,
  type ModalContainerWidth,
} from "./modal_container.tsx";

type AlertFormHolderProps = {
  children: JSX.Element;
  formId: string;
  header: string;
  savingState?: StateHolderFormAction;
  saveFunc?: (e: MouseEvent) => Promise<void>;
  cancelFunc: () => void;
  hideSaveButton?: boolean;
  saveButtonText?: string;
  saveButtonIconName?: IconName;
  cancelButtonText?: string;
  width?: ModalContainerWidth;
  wider?: boolean;
  disableSaveButton?: boolean;
  french?: boolean;
};

export function AlertFormHolder(p: AlertFormHolderProps) {
  const leftButtons = () => {
    const buttons: JSX.Element[] = [];
    if (p.hideSaveButton !== true && p.saveFunc && p.savingState) {
      buttons.push(
        <Button
          onClick={p.saveFunc}
          intent="success"
          iconName={p.saveButtonIconName ?? "save"}
          form={p.formId}
          state={p.savingState}
          disabled={p.disableSaveButton}
        >
          {p.saveButtonText ?? (p.french ? "Sauvegarder" : "Save")}
        </Button>,
      );
    }
    buttons.push(
      <Button onClick={p.cancelFunc} intent="neutral" iconName="x" outline>
        {p.cancelButtonText ?? (p.french ? "Annuler" : "Cancel")}
      </Button>,
    );
    return buttons;
  };

  return (
    <form id={p.formId}>
      <ModalContainer
        title={p.header}
        width={p.width ?? (p.wider ? "lg" : "md")}
        leftButtons={leftButtons()}
      >
        {p.children}
        <Show when={p.savingState}>
          <StateHolderFormError state={p.savingState!} />
        </Show>
      </ModalContainer>
    </form>
  );
}
