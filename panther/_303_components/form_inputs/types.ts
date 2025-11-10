// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { JSX } from "solid-js";

export type SelectOption<T extends string> = {
  value: T;
  label: JSX.Element | string;
};
