/**
 * GOAL 2: Indicators and Data Elements
 * Fetching and searching indicators and data elements from DHIS2, the
 * data-set links each element carries, the element eligibility check, the
 * indicator decomposition parser, the search-result shaping that attaches
 * both, and the reading of element ids that confirms a typed id.
 */

export * from "./get_indicators_from_dhis2.ts";
export * from "./get_data_set_links_from_dhis2.ts";
export * from "./element_eligibility.ts";
export * from "./decompose_indicator.ts";
export * from "./attach_verdicts.ts";
export * from "./read_element_ids.ts";
