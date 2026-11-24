// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// defineOps: the contract-half factory. Curried so the app names its policy
// vocabularies once (defineOps<AppAuth, AppResource>()) while each op's
// schema and literals infer. Returns the registry verbatim, each op that the
// optional second argument names carrying its describeForModel — duplicate
// names are impossible in an object literal, and everything else is checked
// where the impls are present (createOpKernel), so a bad registry can never
// boot a server. TResource defaults to never: an app with no resource
// policies cannot declare one by accident.

import type {
  DescribedOpContract,
  OpDescribeForModel,
  OpRegistry,
} from "./types.ts";

export function defineOps<
  TAuth extends string,
  TResource extends string = never,
>(): <TReg extends OpRegistry<TAuth, TResource>>(
  ops: TReg,
  describeForModel?: OpDescribeForModel<NoInfer<TReg>>,
) => TReg {
  return <TReg extends OpRegistry<TAuth, TResource>>(
    ops: TReg,
    describeForModel?: OpDescribeForModel<TReg>,
  ): TReg => {
    if (describeForModel === undefined) {
      return ops;
    }
    const described: Record<string, DescribedOpContract> = { ...ops };
    // Each entry is typed by its op's output, which this loop reads as the
    // projections do, erased.
    const entries = Object.entries(
      describeForModel as Record<
        string,
        DescribedOpContract["describeForModel"]
      >,
    );
    for (const [name, describe] of entries) {
      const op = described[name];
      if (op === undefined || op.output === undefined) {
        throw new Error(
          `defineOps: describeForModel names "${name}", which is not a read or write op with an output: there is no result for the model to read.`,
        );
      }
      described[name] = { ...op, describeForModel: describe };
    }
    return described as TReg;
  };
}
