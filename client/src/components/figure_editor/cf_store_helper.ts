import {
  type CfStorage,
  type ConditionalFormatting,
  flattenCf,
  type PresentationObjectConfig,
} from "lib";
import { batch } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";

// Applies a ConditionalFormatting union to tempConfig.s by fanning it out
// into individual cf* field writes. Each write is its own setStore call so
// Solid's fine-grained reactivity fires per-field — matches the pattern
// used for every other flat field on s.
//
// Wrapped in batch() so all field writes apply atomically: reactive effects
// downstream (e.g. legend compile) only run once, after all fields are in
// sync. Without batching, a mid-update effect can see mismatched lengths
// between cfThresholdCutoffs and cfThresholdBuckets and throw.
//
// The `as any` escape hatch is localised here: SetStoreFunction's overloads
// don't compose with a generic `keyof CfStorage` payload. Rather than
// polluting every call site with casts, we do it once.
export function applyCfToTempConfig(
  setTempConfig: SetStoreFunction<PresentationObjectConfig>,
  cf: ConditionalFormatting,
): void {
  const flat = flattenCf(cf);
  batch(() => {
    (Object.keys(flat) as (keyof CfStorage)[]).forEach((k) => {
      (setTempConfig as unknown as (
        path: "s",
        key: keyof CfStorage,
        value: CfStorage[keyof CfStorage],
      ) => void)("s", k, flat[k]);
    });
  });
}
