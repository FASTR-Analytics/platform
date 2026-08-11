import type {
  AiVizConfigUpdate,
  PeriodBounds,
  PresentationObjectConfig,
  ResultsValue,
} from "lib";
import { applyFigureConfigPatch } from "./apply_figure_config_patch";

// Key-order-insensitive deep equality. Hand-rolled on purpose: there is no
// deep-equal in lib/ or panther's shared utils, and JSON.stringify is
// key-order sensitive — an AI-sent {disDisplayOpt, disOpt} would compare
// unequal to a stored {disOpt, disDisplayOpt}, over-reporting changes.
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (
    typeof a === "object" && typeof b === "object" &&
    a !== null && b !== null && !Array.isArray(a) && !Array.isArray(b)
  ) {
    const aKeys = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const bKeys = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) =>
      deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      )
    );
  }
  return false;
}

// The change REPORT — "you asked for X, here is what landed" — replacing a
// bare "Updated figure X". Leave-one-out over the pure apply: for each field
// in the patch, compare the full patch's result against the result with that
// field removed; identical means the field contributed nothing. Per-field on
// purpose (a whole-config diff hides an inert field behind any other change),
// and leave-one-out on purpose (it credits field interactions correctly —
// e.g. rollupPosition legitimately lands when the same patch introduces the
// flagged dimension). Cost is N+1 calls to a pure function, visible here at
// the call site.
//
// NEVER errors, and is deliberately NOT part of validateFigureConfigEdit —
// the validator's whole value is "it threw ⇒ nothing changed", and the report
// needs apply's full argument list (dataBounds), which the validator has no
// reason to take. Called by the three edit tools AFTER validation passes; at
// that point the two CONDITIONALLY_APPLIED_FIELDS have passed their
// structural checks, so a no-diff on ANY field means the value already
// equalled the stored one — which is not an error, just the truth.
export function describeFigureConfigPatchEffect(
  config: PresentationObjectConfig,
  patch: AiVizConfigUpdate,
  source: ResultsValue,
  dataBounds: PeriodBounds | undefined,
): string[] {
  const suppliedKeys = (Object.keys(patch) as (keyof AiVizConfigUpdate)[])
    .filter((k) => patch[k] !== undefined);
  if (suppliedKeys.length === 0) return [];
  const full = applyFigureConfigPatch(config, patch, source, dataBounds);
  return suppliedKeys.map((key) => {
    const minusOne = { ...patch };
    delete minusOne[key];
    const without = applyFigureConfigPatch(config, minusOne, source, dataBounds);
    return deepEqual(full, without)
      ? `${key}: no change (the stored config already matched)`
      : `${key}: applied`;
  });
}
