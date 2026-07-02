import { t3 } from "../translate/mod.ts";

export const _COMMON_INDICATORS: { value: string; label: string }[] = [
  {
    value: "new_fp",
    label: t3({ en: "New family planning acceptors", fr: "Nouveaux utilisateurs de la planification familiale", pt: "Novos utentes de planeamento familiar" }),
  },
  { value: "anc1", label: t3({ en: "Antenatal care 1", fr: "Consultation prénatale 1", pt: "Consulta pré-natal 1" }) },
  { value: "anc4", label: t3({ en: "Antenatal care 4", fr: "Consultation prénatale 4", pt: "Consulta pré-natal 4" }) },
  { value: "delivery", label: t3({ en: "Institutional delivery", fr: "Accouchement institutionnel", pt: "Parto institucional" }) },
  { value: "sba", label: t3({ en: "Delivery by skilled birth attendant", fr: "Accouchement par personnel qualifié", pt: "Parto assistido por pessoal qualificado" }) },
  {
    value: "pnc1_newborn",
    label: t3({ en: "Postnatal care 1 (newborns)", fr: "Consultation postnatale 1 (nouveaux-nés)", pt: "Consulta pós-natal 1 (recém-nascidos)" }),
  },
  { value: "pnc1_mother", label: t3({ en: "Postnatal care 1 (mothers)", fr: "Consultation postnatale 1 (mères)", pt: "Consulta pós-natal 1 (mães)" }) },
  { value: "bcg", label: t3({ en: "BCG vaccine", fr: "Vaccination BCG", pt: "Vacina BCG" }) },
  { value: "penta1", label: t3({ en: "Penta vaccine 1", fr: "Vaccination Penta 1", pt: "Vacina Penta 1" }) },
  { value: "penta3", label: t3({ en: "Penta vaccine 3", fr: "Vaccination Penta 3", pt: "Vacina Penta 3" }) },
  { value: "measles1", label: t3({ en: "Measles vaccine 1", fr: "Vaccination Rougeole 1", pt: "Vacina contra o sarampo 1" }) },
  { value: "measles2", label: t3({ en: "Measles vaccine 2", fr: "Vaccination Rougeole 2", pt: "Vacina contra o sarampo 2" }) },
  { value: "opd", label: t3({ en: "Outpatient visit", fr: "Visite ambulatoire", pt: "Consulta externa" }) },
  { value: "ipd", label: t3({ en: "Inpatient visit", fr: "Hospitalisation", pt: "Internamento" }) },
];

export function get_INDICATOR_COMMON_IDS_IN_SORT_ORDER(): string[] {
  return _COMMON_INDICATORS.map((d) => d.value);
}
