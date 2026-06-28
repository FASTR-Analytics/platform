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
    // AA1 is the country — but only call it that once the instance has named its
    // sub-levels; if all admin labels are still defaults, keep AA1 generic too.
    const anyOtherLabelSet =
      !!instanceState.adminAreaLabels.label2 ||
      !!instanceState.adminAreaLabels.label3 ||
      !!instanceState.adminAreaLabels.label4;
    if (anyOtherLabelSet) {
      // Match the " (AAn)" suffix the other levels carry via withAdminSuffix.
      return { en: "Country (AA1)", fr: "Pays (AA1)", pt: "País (AA1)" };
    }
    return { en: "Admin area 1", fr: "Unité administrative 1" };
  }
  return getDisaggregationLabel(`admin_area_${level}` as const, {
    adminAreaLabels: instanceState.adminAreaLabels,
  });
}
