// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { t3 } from "../deps.ts";
import type { Intent } from "../types.ts";
import { INTENT_TEXT } from "../_internal/intent_classes.ts";
import { Icon } from "../icons/mod.ts";

type Props = {
  msg?: string;
  noPad?: boolean;
};

type SpinnerProps = {
  intent?: Intent;
};

export function LoadingIndicator(p: Props) {
  return (
    <div
      class="data-[no-pad=false]:ui-pad h-full w-full"
      data-no-pad={!!p.noPad}
    >
      {p.msg ??
        t3({ en: "Loading...", fr: "Chargement...", pt: "A carregar..." })}
    </div>
  );
}

export function Spinner(p: SpinnerProps = {}) {
  return (
    <div class="flex h-full w-full items-center justify-center">
      <Icon
        iconName="loader"
        class={`h-6 max-h-full w-6 animate-spin ${
          INTENT_TEXT[p.intent ?? "base-100"]
        }`}
      />
    </div>
  );
}
