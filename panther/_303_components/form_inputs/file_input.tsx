// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createUniqueId, Show } from "solid-js";
import { t3 } from "../deps.ts";
import type { Intent } from "../types.ts";
import { Button } from "./button.tsx";

type FileInputProps = {
  value?: File;
  onChange: (file: File | undefined) => void;
  accept?: string;
  label?: string;
  size?: "sm";
  disabled?: boolean;
  onBackground?: Intent;
};

export function FileInput(p: FileInputProps) {
  let inputEl: HTMLInputElement | undefined;
  const buttonId = createUniqueId();

  return (
    <div>
      <Show when={p.label}>
        <label class="ui-label" for={buttonId}>
          {p.label}
        </label>
      </Show>
      <div class="ui-gap-sm flex items-center">
        <input
          ref={inputEl}
          type="file"
          class="hidden"
          accept={p.accept}
          disabled={p.disabled}
          onChange={(evt) => {
            p.onChange(evt.currentTarget.files?.[0]);
            // Reset so re-picking the same file still fires change; the
            // displayed name comes from p.value, not the native input.
            evt.currentTarget.value = "";
          }}
        />
        <Button
          id={buttonId}
          outline
          size={p.size}
          disabled={p.disabled}
          onBackground={p.onBackground}
          onClick={() => inputEl?.click()}
        >
          {t3({
            en: "Choose file",
            fr: "Choisir un fichier",
            pt: "Escolher ficheiro",
          })}
        </Button>
        <div
          class={`${
            p.size === "sm" ? "ui-form-text-size-sm" : "ui-form-text-size"
          } min-w-0 truncate`}
          classList={{ "text-base-content-muted": !p.value }}
          aria-live="polite"
        >
          {p.value?.name ?? t3({
            en: "No file selected",
            fr: "Aucun fichier sélectionné",
            pt: "Nenhum ficheiro selecionado",
          })}
        </div>
      </div>
    </div>
  );
}
