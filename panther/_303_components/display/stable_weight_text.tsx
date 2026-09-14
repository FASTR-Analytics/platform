// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

type StableWeightTextProps = {
  text: string;
  /** Size, colour and weight classes. They go on the wrapper so the hidden
   * bold copy that reserves the space inherits them. */
  class?: string;
};

export function StableWeightText(p: StableWeightTextProps) {
  return (
    <span class={`ui-stable-weight ${p.class ?? ""}`} data-text={p.text}>
      <span>{p.text}</span>
    </span>
  );
}
