// Sentinel-value classification for HFA survey codes.
//
// A "sentinel" is a code standing in for a non-substantive response — a
// don't-know, a refusal, an "other (specify)" — rather than a real answer.
// Layer 3 of the sentinel ladder turns these classes into missingness policy
// (see PLAN_HFA_FEATURES.md); this module only *derives* the class from
// what the XLSForm says, as a proposal the import wizard lets a human correct.
//
// Pure and dependency-free so the staging worker (server) and the review UI
// (client) share one source of truth.

export type SentinelClass =
  | "dont_know"
  | "refused"
  | "other"
  | "not_applicable"
  | "question_specific";

// Labels are the reliable signal: sentinel *codes* are country-form-specific
// (-99 here, 98 / -88 elsewhere) but the choice label is authored in words.
// Ordered most-important first so a combined "Don't know / Refused" resolves to
// dont_know. Covers EN + common FR/PT wordings; anything unmatched is left to
// the review step.
const LABEL_PATTERNS: [SentinelClass, RegExp][] = [
  ["dont_know", /don'?t know|do not know|unknown|not known|ne sai[ts] pas|não sabe|\bdk\b/i],
  ["refused", /refus|declin|recus/i],
  ["not_applicable", /not applicable|não se aplica|sans objet|\bn\/?a\b/i],
  ["other", /\bother\b|\bautre\b|\boutros?\b/i],
];

// Documented sentinel codes (Sierra Leone form). Fallback only, for when the
// label is opaque (staging fell back to the bare code as the label); labels win
// so other countries' forms still classify correctly.
const KNOWN_SENTINEL_CODES: Record<string, SentinelClass> = {
  "-99": "dont_know",
  "-96": "other",
  "-98": "question_specific",
};

// Classify one choice from a select_one / select_multiple list. Returns
// undefined for a substantive answer (Yes/No, a real option) — those fall
// through to the indicator R code untouched (principle 5). undefined means "not
// a sentinel", not "unknown".
export function classifyChoice(
  code: string,
  label: string,
): SentinelClass | undefined {
  const text = label.trim();
  for (const [cls, re] of LABEL_PATTERNS) {
    if (re.test(text)) return cls;
  }
  return KNOWN_SENTINEL_CODES[code.trim()] ?? undefined;
}

// Pull the explicit equality escapes out of an XLSForm numeric `constraint`,
// e.g. "(. >= 100 and . <= 999999) or . = -999999" → ["-999999"]. Matches
// `. = N` / `. == N` only — never the `<=` / `>=` range bounds. De-duplicated,
// order-preserving.
export function parseNumericSentinels(constraint: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of constraint.matchAll(/\.\s*==?\s*(-?\d+)/g)) {
    const v = m[1];
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// Documented numeric don't-know sentinel; any other escape value is flagged
// question_specific for the reviewer to confirm.
const KNOWN_NUMERIC_SENTINELS: Record<string, SentinelClass> = {
  "-999999": "dont_know",
};

export function classifyNumericSentinel(value: string): SentinelClass {
  return KNOWN_NUMERIC_SENTINELS[value.trim()] ?? "question_specific";
}
