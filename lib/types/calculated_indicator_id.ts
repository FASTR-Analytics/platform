import { POPULATION_TYPES, type PopulationType } from "./indicators.ts";

export const CALCULATED_INDICATOR_ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

export function isValidCalculatedIndicatorIdentifier(value: string): boolean {
  return CALCULATED_INDICATOR_ID_PATTERN.test(value);
}

export function assertValidCalculatedIndicatorIdentifier(
  value: string,
  fieldName: string,
): void {
  if (!isValidCalculatedIndicatorIdentifier(value)) {
    throw new Error(
      `Invalid identifier for ${fieldName}: ${JSON.stringify(value)}. ` +
        `Must match ${CALCULATED_INDICATOR_ID_PATTERN.source}.`,
    );
  }
}

export function isValidPopulationType(value: string): value is PopulationType {
  return POPULATION_TYPES.some((pt) => pt.id === value);
}

export function assertValidPopulationType(
  value: string,
  fieldName: string,
): asserts value is PopulationType {
  if (!isValidPopulationType(value)) {
    const validTypes = POPULATION_TYPES.map((pt) => pt.id).join(", ");
    throw new Error(
      `Invalid ${fieldName}: ${JSON.stringify(value)}. ` +
        `Must be one of: ${validTypes}.`,
    );
  }
}
