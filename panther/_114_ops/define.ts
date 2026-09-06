// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// defineOps: the contract-half factory. Curried so the app names its policy
// vocabularies once (defineOps<AppAuth, AppResource>()) while each op's
// schema and literals infer. Returns the registry verbatim — duplicate names
// are impossible in an object literal, and everything else is checked where
// the impls are present (createOpKernel), so a bad registry can never boot a
// server. TResource defaults to never: an app with no resource policies
// cannot declare one by accident.

import type { OpRegistry } from "./types.ts";

export function defineOps<
  TAuth extends string,
  TResource extends string = never,
>(): <TReg extends OpRegistry<TAuth, TResource>>(ops: TReg) => TReg {
  return (ops) => ops;
}
