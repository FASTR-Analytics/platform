// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { JSX } from "solid-js";

type Props = {
  label?: string;
  children: JSX.Element;
};

export function LabelHolder(p: Props) {
  return (
    <div class="">
      <div class="ui-label">{p.label}</div>
      <div class="">{p.children}</div>
    </div>
  );
}
