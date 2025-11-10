import { t, t2, T } from "../translate/mod.ts";

export const _COMMON_INDICATORS: { value: string; label: string }[] = [
  {
    value: "new_fp",
    label: t2(T.FRENCH_UI_STRINGS.new_family_planning_acceptors),
  },
  { value: "anc1", label: t2(T.FRENCH_UI_STRINGS.antenatal_care_1) },
  { value: "anc4", label: t2(T.FRENCH_UI_STRINGS.antenatal_care_4) },
  { value: "delivery", label: t2(T.FRENCH_UI_STRINGS.institutional_delivery) },
  { value: "sba", label: t("Delivery by skilled birth attendant") },
  {
    value: "pnc1_newborn",
    label: t2(T.FRENCH_UI_STRINGS.postnatal_care_1_newborns),
  },
  { value: "pnc1_mother", label: t("Postnatal care 1 (mothers)") },
  { value: "bcg", label: t2(T.FRENCH_UI_STRINGS.bcg_vaccine) },
  { value: "penta1", label: t("Penta vaccine 1") },
  { value: "penta3", label: t("Penta vaccine 3") },
  { value: "measles1", label: t2(T.FRENCH_UI_STRINGS.measles_vaccine_1) },
  { value: "measles2", label: t2(T.FRENCH_UI_STRINGS.measles_vaccine_2) },
  { value: "opd", label: t2(T.FRENCH_UI_STRINGS.outpatient_visit) },
  { value: "ipd", label: t2(T.FRENCH_UI_STRINGS.inpatient_visit) },
];

export function get_INDICATOR_COMMON_IDS_IN_SORT_ORDER(): string[] {
  return _COMMON_INDICATORS.map((d) => d.value);
}
