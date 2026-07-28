// Shared definitions for table sample sizes ("n"). The server emits one n
// column per displayed value alongside the values themselves; the client maps
// them to panther's nProps and the table renderer decorates column headers.
// Both halves depend on the naming, so it lives in lib/.
//
// The aggregate contract (HFA-only scope, distinct-facility count, and why
// post-aggregation fetches count unfiltered) is documented at
// buildSampleNColumns in server_only_funcs_presentation_objects/query_helpers.ts.

// Prefix of the emitted columns, e.g. value → __n_value. Reserved: no
// module-authored value prop may start with it (enforced at module load).
export const SAMPLE_N_PREFIX = "__n_";

export function sampleNProp(valueProp: string): string {
  return `${SAMPLE_N_PREFIX}${valueProp}`;
}

export function isSampleNProp(prop: string): boolean {
  return prop.startsWith(SAMPLE_N_PREFIX);
}
