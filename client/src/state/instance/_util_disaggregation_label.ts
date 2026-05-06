import type { DisaggregationOption, TranslatableString } from "lib";
import { getDisaggregationLabel } from "lib";
import { instanceState } from "./t1_store";

export function getDisplayDisaggregationLabel(
  disOpt: DisaggregationOption,
): TranslatableString {
  return getDisaggregationLabel(disOpt, {
    adminAreaLabels: instanceState.adminAreaLabels,
    facilityColumns: instanceState.facilityColumns,
  });
}

export function getAdminAreaLabel(level: 1 | 2 | 3 | 4): TranslatableString {
  if (level === 1) {
    const custom = instanceState.adminAreaLabels.label1;
    if (custom) return { en: custom, fr: custom };
    return { en: "Admin area 1", fr: "Unité administrative 1" };
  }
  return getDisaggregationLabel(`admin_area_${level}` as const, {
    adminAreaLabels: instanceState.adminAreaLabels,
  });
}
