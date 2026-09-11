/**
 * GOAL 2: Indicators and Data Elements
 * Fetching and searching indicators and data elements from DHIS2, the source
 * eligibility check (ruling 6), the indicator decomposition parser (ruling 8),
 * and the search-result shaping that attaches both.
 */

export * from "./get_indicators_from_dhis2.ts";
export * from "./source_eligibility.ts";
export * from "./decompose_indicator.ts";
export * from "./attach_verdicts.ts";
