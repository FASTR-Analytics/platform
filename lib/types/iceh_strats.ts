export const ICEH_STRATS = [
  "national",
  "area",
  "wealth_quintiles",
  "wealth_deciles",
  "womans_education",
  "womans_education_4_groups",
  "womans_age_current",
  "womans_age_at_birth",
  "sex",
  "subnational_unit",
] as const;

export type IcehStrat = (typeof ICEH_STRATS)[number];

export type IcehStratInfo = {
  label: string;
  rawValue: string;
  sortOrder: number;
  isEquityDimension: boolean;
  levels?: Record<string, string>;
};

export const ICEH_STRAT_INFO: Record<IcehStrat, IcehStratInfo> = {
  national: {
    label: "National",
    rawValue: "national",
    sortOrder: 0,
    isEquityDimension: false,
    levels: {
      all: "All",
    },
  },
  area: {
    label: "Urban/Rural",
    rawValue: "area",
    sortOrder: 1,
    isEquityDimension: true,
    levels: {
      rural: "Rural",
      urban: "Urban",
    },
  },
  wealth_quintiles: {
    label: "Wealth Quintiles",
    rawValue: "wealth quintiles",
    sortOrder: 2,
    isEquityDimension: true,
    levels: {
      Q1: "Quintile 1 (Poorest)",
      Q2: "Quintile 2",
      Q3: "Quintile 3",
      Q4: "Quintile 4",
      Q5: "Quintile 5 (Richest)",
    },
  },
  wealth_deciles: {
    label: "Wealth Deciles",
    rawValue: "wealth deciles",
    sortOrder: 3,
    isEquityDimension: true,
    levels: {
      D01: "Decile 1 (Poorest)",
      D02: "Decile 2",
      D03: "Decile 3",
      D04: "Decile 4",
      D05: "Decile 5",
      D06: "Decile 6",
      D07: "Decile 7",
      D08: "Decile 8",
      D09: "Decile 9",
      D10: "Decile 10 (Richest)",
    },
  },
  womans_education: {
    label: "Woman's Education",
    rawValue: "woman's education",
    sortOrder: 4,
    isEquityDimension: true,
    levels: {
      none: "No Education",
      primary: "Primary",
      "secondary+": "Secondary+",
    },
  },
  womans_education_4_groups: {
    label: "Woman's Education (4 groups)",
    rawValue: "woman's education (4 groups)",
    sortOrder: 5,
    isEquityDimension: true,
    levels: {
      none: "No Education",
      primary: "Primary",
      secondary: "Secondary",
      higher: "Higher",
    },
  },
  womans_age_current: {
    label: "Woman's Age (Current)",
    rawValue: "woman's age (current)",
    sortOrder: 6,
    isEquityDimension: false,
    levels: {
      "15-17 yrs": "15-17 years",
      "15-19 yrs": "15-19 years",
      "18-19 yrs": "18-19 years",
      "20-34 yrs": "20-34 years",
      "20-49 yrs": "20-49 years",
      "35-49 yrs": "35-49 years",
    },
  },
  womans_age_at_birth: {
    label: "Woman's Age (At Birth)",
    rawValue: "woman's age (at birth)",
    sortOrder: 7,
    isEquityDimension: false,
    levels: {
      "15-17 yrs": "15-17 years",
      "15-19 yrs": "15-19 years",
      "18-19 yrs": "18-19 years",
      "20-34 yrs": "20-34 years",
      "20-49 yrs": "20-49 years",
      "35-49 yrs": "35-49 years",
    },
  },
  sex: {
    label: "Sex",
    rawValue: "sex",
    sortOrder: 8,
    isEquityDimension: true,
    levels: {
      female: "Female",
      male: "Male",
    },
  },
  subnational_unit: {
    label: "Subnational Unit",
    rawValue: "subnational unit",
    sortOrder: 9,
    isEquityDimension: false,
  },
};

const RAW_TO_NORMALIZED = Object.fromEntries(
  Object.entries(ICEH_STRAT_INFO).map(([k, v]) => [v.rawValue, k])
) as Record<string, IcehStrat>;

export function normalizeIcehStrat(raw: string): IcehStrat | undefined {
  return RAW_TO_NORMALIZED[raw];
}
