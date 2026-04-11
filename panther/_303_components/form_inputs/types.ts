// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { JSX } from "solid-js";

export type SelectOption<T extends string> = {
  value: T;
  label: JSX.Element | string;
};

export type SelectListItem<T extends string> =
  | SelectOption<T>
  | { type: "divider" }
  | { type: "header"; label: string };

export type NestedSelectBranchNode<T extends string> = {
  key: string;
  label: string | JSX.Element;
  children: NestedSelectNode<T>[];
};

export type NestedSelectLeafNode<T extends string> = {
  key: string;
  label: string | JSX.Element;
  value: T;
};

export type NestedSelectNode<T extends string> =
  | NestedSelectLeafNode<T>
  | NestedSelectBranchNode<T>;
