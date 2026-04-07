import { t3 } from "../translate/mod.ts";

export const _COMMON_INDICATORS: { value: string; label: string }[] = [
  {
    value: "new_fp",
    label: t3({ en: "New family planning acceptors", fr: "Nouveaux utilisateurs de la planification familiale" }),
  },
  { value: "anc1", label: t3({ en: "Antenatal care 1", fr: "Consultation prénatale 1" }) },
  { value: "anc4", label: t3({ en: "Antenatal care 4", fr: "Consultation prénatale 4" }) },
  { value: "delivery", label: t3({ en: "Institutional delivery", fr: "Accouchement institutionnel" }) },
  { value: "sba", label: t3({ en: "Delivery by skilled birth attendant", fr: "Accouchement par personnel qualifié" }) },
  {
    value: "pnc1_newborn",
    label: t3({ en: "Postnatal care 1 (newborns)", fr: "Consultation postnatale 1 (nouveaux-nés)" }),
  },
  { value: "pnc1_mother", label: t3({ en: "Postnatal care 1 (mothers)", fr: "Consultation postnatale 1 (mères)" }) },
  { value: "bcg", label: t3({ en: "BCG vaccine", fr: "Vaccination BCG" }) },
  { value: "penta1", label: t3({ en: "Penta vaccine 1", fr: "Vaccination Penta 1" }) },
  { value: "penta3", label: t3({ en: "Penta vaccine 3", fr: "Vaccination Penta 3" }) },
  { value: "measles1", label: t3({ en: "Measles vaccine 1", fr: "Vaccination Rougeole 1" }) },
  { value: "measles2", label: t3({ en: "Measles vaccine 2", fr: "Vaccination Rougeole 2" }) },
  { value: "opd", label: t3({ en: "Outpatient visit", fr: "Visite ambulatoire" }) },
  { value: "ipd", label: t3({ en: "Inpatient visit", fr: "Hospitalisation" }) },
];

export function get_INDICATOR_COMMON_IDS_IN_SORT_ORDER(): string[] {
  return _COMMON_INDICATORS.map((d) => d.value);
}
