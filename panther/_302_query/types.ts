// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type FormActionState =
  | { status: "loading" }
  | { status: "error"; err: string }
  | { status: "ready" };

export type ButtonActionState =
  | { status: "loading" }
  | { status: "ready" };
