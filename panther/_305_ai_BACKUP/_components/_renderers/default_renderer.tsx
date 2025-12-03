// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Component } from "solid-js";
import type { DisplayItem } from "../../_core/types.ts";

export const DefaultRenderer: Component<{ item: DisplayItem }> = (props) => {
  return (
    <div class="ui-pad bg-base-200 w-fit max-w-full rounded">
      <div class="text-sm">
        <div class="text-neutral mb-1 text-xs font-bold">
          Unknown display item: {props.item.type}
        </div>
        <pre class="whitespace-pre-wrap text-xs">
          {JSON.stringify(props.item, null, 2)}
        </pre>
      </div>
    </div>
  );
};
