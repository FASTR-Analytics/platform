import type { DatasetType, DisaggregationOption, TranslatableString } from "lib";
import {
  BLANK_SENTINEL,
  BLANK_SENTINEL_LABEL,
  getDisaggregationLabel,
  t3,
} from "lib";
import { instanceState } from "./t1_store";

// Display text for one VALUE of a disaggregation (a filter chip, a replicant
// option) — as opposed to the dimension's own label below. Only the blank
// sentinel needs resolving; every other id is served with its own label.
export function getDisplayDisaggregationValueLabel(
  id: string,
  label: string,
): string {
  return id === BLANK_SENTINEL ? t3(BLANK_SENTINEL_LABEL) : label;
}

// Facility-column labels are per family: pass the results value's
// datasetFamily. iceh/missing family → generic default labels.
export function getDisplayDisaggregationLabel(
  disOpt: DisaggregationOption,
  family: DatasetType | undefined,
): TranslatableString {
  return getDisaggregationLabel(disOpt, {
    adminAreaLabels: instanceState.adminAreaLabels,
    facilityColumns: family === "hmis"
      ? instanceState.structureSchemaHmis ?? undefined
      : family === "hfa"
      ? instanceState.structureSchemaHfa ?? undefined
      : undefined,
  });
}

export function getAdminAreaLabel(level: 1 | 2 | 3 | 4): TranslatableString {
  if (level === 1) {
    const custom = instanceState.adminAreaLabels.label1;
    if (custom) return { en: custom, fr: custom, pt: custom };
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
    return { en: "Admin area 1", fr: "Unité administrative 1", pt: "Zona administrativa 1" };
  }
  return getDisaggregationLabel(`admin_area_${level}` as const, {
    adminAreaLabels: instanceState.adminAreaLabels,
  });
}
