import { RUN_LABEL_MAX_LENGTH, t3 } from "lib";

// The client half of the runs_label_unique index (lower(trim(label))): the
// same normalisation, so the wizard refuses a taken label before the round
// trip and its default never collides with the catalogue.
const normalize = (label: string): string => label.trim().toLowerCase();

export function isRunLabelTaken(
  label: string,
  catalogue: { label: string }[],
): boolean {
  const wanted = normalize(label);
  return catalogue.some((r) => normalize(r.label) === wanted);
}

export function getRunLabelTooLongMsg(label: string): string | undefined {
  return label.trim().length > RUN_LABEL_MAX_LENGTH
    ? t3({
      en: `Use ${RUN_LABEL_MAX_LENGTH} characters or fewer`,
      fr: `Utilisez ${RUN_LABEL_MAX_LENGTH} caractères au maximum`,
      pt: `Use no máximo ${RUN_LABEL_MAX_LENGTH} caracteres`,
    })
    : undefined;
}

export function freeRunLabel(
  base: string,
  catalogue: { label: string }[],
): string {
  if (!isRunLabelTaken(base, catalogue)) {
    return base;
  }
  for (let n = 2;; n++) {
    const candidate = `${base} (${n})`;
    if (!isRunLabelTaken(candidate, catalogue)) {
      return candidate;
    }
  }
}
