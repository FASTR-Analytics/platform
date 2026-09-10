import { RESERVED_WORDS } from "./types/indicators.ts";

// Generated ids only; a typed id keeps the validator's 128 maximum.
export const GENERATED_INDICATOR_ID_MAX_LENGTH = 64;

// The one id-generation rule, in lib so the client previews exactly what the
// server writes (PLAN_A3 ruling 10). Instance migration 086 applies the same
// rule in PL/pgSQL to the bases it creates from unmapped raws; the two
// spellings must agree, and `server/tests/indicator_id_test.ts` pins this
// one. The digit prefix and the cap are applied once, to the stem, so a
// label that folds to nothing takes `i_` + the slugged source id without a
// second `i_`.
export function slugIndicatorId(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function generateIndicatorId(args: {
  label: string;
  sourceId: string;
  existingIds: Iterable<string>;
}): string {
  const fromLabel = slugIndicatorId(args.label);
  const stem = fromLabel.length > 0
    ? fromLabel
    : `i_${slugIndicatorId(args.sourceId)}`;
  const capped = (/^[0-9]/.test(stem) ? `i_${stem}` : stem).slice(
    0,
    GENERATED_INDICATOR_ID_MAX_LENGTH,
  );
  const existing = new Set(args.existingIds);
  const taken = (id: string) => existing.has(id) || RESERVED_WORDS.includes(id);
  if (!taken(capped)) return capped;
  for (let n = 2;; n++) {
    const candidate = `${capped}_${n}`;
    if (!taken(candidate)) return candidate;
  }
}
