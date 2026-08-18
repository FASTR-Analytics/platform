// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { splitProps } from "solid-js";

// Opt-in extension point: a component whose props type includes this
// forwards any `data-*` attribute to its root DOM element via
// splitDataAttrs() below. Deliberately narrower than a generic `...rest`:
// must never let a caller override a prop the component computes itself
// (class, style, onClick, id, ...) — enforced by only ever matching
// `data-${string}` keys, nothing else. `data-selected={bool}` etc. is the
// idiom already used by button_group.tsx / the data-[selected=true]:
// variants. See PROTOCOL_UI_COMPONENTS.md for the list of components that
// forward this and the spread-order rule (component's own attributes are
// always written after {...dataAttrs}, so they win on any key collision).
export type DataAttrs = {
  [key: `data-${string}`]: string | number | boolean | undefined;
};

// Prefix-selected, NOT a hand-enumerated key list: the alternative (listing
// every non-data- prop so splitProps' rest catches the remainder) rots the
// day a new prop is added to a component and not to that list — TypeScript
// does not excess-check spread attributes, so a forgotten prop would leak
// onto the DOM silently, the same failure mode this exists to close.
// Selecting the data-* keys directly means the boundary holds no matter what
// other props a component gains later.
//
// Object.keys works on both plain JSX-built prop objects and solid-js
// mergeProps() proxies (verified). The key SET is read once, at the
// component's setup — not reactive to a data-* key appearing after mount,
// which is fine for anchors/hooks/markers; the VALUES stay reactive
// (splitProps returns proxies).
export function splitDataAttrs<T extends DataAttrs>(
  p: T,
): [DataAttrs, { [P in keyof T as Exclude<P, `data-${string}`>]: T[P] }] {
  const keys = Object.keys(p).filter((k) =>
    k.startsWith("data-")
  ) as `data-${string}`[];
  return splitProps(p, keys);
}
