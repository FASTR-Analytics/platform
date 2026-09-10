import type { TranslatableString } from "./translate/types.ts";

// The HMIS count ids the registry module scripts read by name (m001 reads
// the malaria trio, m004/m005 the immunization and postnatal ids, all three
// the core set), with the labels a new database is seeded with. Hand-kept:
// the scripts carry no declaration. A special id may exist only as a base,
// because the scripts read it as a count and a derived under it would be
// silently ignored (`getSpecialIndicatorTypeIssue`). A new database seeds
// each as an empty base; an existing instance gets nothing on boot, and a
// team adds or deletes specials like any base.
export const SPECIAL_INDICATORS: readonly {
  id: string;
  label: TranslatableString;
}[] = [
  {
    id: "anc1",
    label: {
      en: "Antenatal care 1",
      fr: "Consultation prénatale 1",
      pt: "Consulta pré-natal 1",
    },
  },
  {
    id: "anc4",
    label: {
      en: "Antenatal care 4",
      fr: "Consultation prénatale 4",
      pt: "Consulta pré-natal 4",
    },
  },
  {
    id: "delivery",
    label: {
      en: "Institutional delivery",
      fr: "Accouchement institutionnel",
      pt: "Parto institucional",
    },
  },
  {
    id: "sba",
    label: {
      en: "Delivery by skilled birth attendant",
      fr: "Accouchement par personnel qualifié",
      pt: "Parto assistido por pessoal qualificado",
    },
  },
  {
    id: "bcg",
    label: { en: "BCG vaccine", fr: "Vaccination BCG", pt: "Vacina BCG" },
  },
  {
    id: "penta1",
    label: {
      en: "Penta vaccine 1",
      fr: "Vaccination Penta 1",
      pt: "Vacina Penta 1",
    },
  },
  {
    id: "penta3",
    label: {
      en: "Penta vaccine 3",
      fr: "Vaccination Penta 3",
      pt: "Vacina Penta 3",
    },
  },
  {
    id: "measles1",
    label: {
      en: "Measles vaccine 1",
      fr: "Vaccination Rougeole 1",
      pt: "Vacina contra o sarampo 1",
    },
  },
  {
    id: "measles2",
    label: {
      en: "Measles vaccine 2",
      fr: "Vaccination Rougeole 2",
      pt: "Vacina contra o sarampo 2",
    },
  },
  {
    id: "opd",
    label: {
      en: "Outpatient visit",
      fr: "Visite ambulatoire",
      pt: "Consulta externa",
    },
  },
  {
    id: "pnc1",
    label: {
      en: "Postnatal care 1",
      fr: "Consultation postnatale 1",
      pt: "Consulta pós-natal 1",
    },
  },
  {
    id: "pnc1_mother",
    label: {
      en: "Postnatal care 1 (mothers)",
      fr: "Consultation postnatale 1 (mères)",
      pt: "Consulta pós-natal 1 (mães)",
    },
  },
  {
    id: "rdt_positive",
    label: {
      en: "Malaria RDT positive",
      fr: "TDR paludisme positif",
      pt: "TDR de malária positivo",
    },
  },
  {
    id: "micro_positive",
    label: {
      en: "Malaria microscopy positive",
      fr: "Microscopie paludisme positive",
      pt: "Microscopia de malária positiva",
    },
  },
  {
    id: "confirmed_malaria_treated_with_act",
    label: {
      en: "Confirmed malaria treated with ACT",
      fr: "Paludisme confirmé traité par CTA",
      pt: "Malária confirmada tratada com ACT",
    },
  },
  {
    id: "rota1",
    label: {
      en: "Rotavirus vaccine 1",
      fr: "Vaccination Rotavirus 1",
      pt: "Vacina contra o rotavírus 1",
    },
  },
  {
    id: "rota2",
    label: {
      en: "Rotavirus vaccine 2",
      fr: "Vaccination Rotavirus 2",
      pt: "Vacina contra o rotavírus 2",
    },
  },
  {
    id: "opv1",
    label: {
      en: "Oral polio vaccine 1",
      fr: "Vaccination VPO 1",
      pt: "Vacina VPO 1",
    },
  },
  {
    id: "opv2",
    label: {
      en: "Oral polio vaccine 2",
      fr: "Vaccination VPO 2",
      pt: "Vacina VPO 2",
    },
  },
  {
    id: "opv3",
    label: {
      en: "Oral polio vaccine 3",
      fr: "Vaccination VPO 3",
      pt: "Vacina VPO 3",
    },
  },
  {
    id: "vitaminA",
    label: {
      en: "Vitamin A supplementation",
      fr: "Supplémentation en vitamine A",
      pt: "Suplementação com vitamina A",
    },
  },
  {
    id: "fully_immunized",
    label: {
      en: "Fully immunized",
      fr: "Complètement vacciné",
      pt: "Totalmente imunizado",
    },
  },
];

export const SPECIAL_INDICATOR_IDS: readonly string[] = SPECIAL_INDICATORS.map(
  (s) => s.id,
);

export function isSpecialIndicatorId(id: string): boolean {
  return SPECIAL_INDICATOR_IDS.includes(id);
}
