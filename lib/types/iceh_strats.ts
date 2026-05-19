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
};

export const ICEH_STRAT_INFO: Record<IcehStrat, IcehStratInfo> = {
  national: {
    label: "National",
    rawValue: "national",
    sortOrder: 0,
    isEquityDimension: false,
  },
  area: {
    label: "Urban/Rural",
    rawValue: "area",
    sortOrder: 1,
    isEquityDimension: true,
  },
  wealth_quintiles: {
    label: "Wealth Quintiles",
    rawValue: "wealth quintiles",
    sortOrder: 2,
    isEquityDimension: true,
  },
  wealth_deciles: {
    label: "Wealth Deciles",
    rawValue: "wealth deciles",
    sortOrder: 3,
    isEquityDimension: true,
  },
  womans_education: {
    label: "Woman's Education",
    rawValue: "woman's education",
    sortOrder: 4,
    isEquityDimension: true,
  },
  womans_education_4_groups: {
    label: "Woman's Education (4 groups)",
    rawValue: "woman's education (4 groups)",
    sortOrder: 5,
    isEquityDimension: true,
  },
  womans_age_current: {
    label: "Woman's Age (Current)",
    rawValue: "woman's age (current)",
    sortOrder: 6,
    isEquityDimension: false,
  },
  womans_age_at_birth: {
    label: "Woman's Age (At Birth)",
    rawValue: "woman's age (at birth)",
    sortOrder: 7,
    isEquityDimension: false,
  },
  sex: {
    label: "Sex",
    rawValue: "sex",
    sortOrder: 8,
    isEquityDimension: true,
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
