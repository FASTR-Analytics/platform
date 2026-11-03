import type { HfaVerificationModelRuleId } from "../hfa_verification_rules.ts";

// An indicator's latest check by the model. `inputHash` is what the check
// was asked about; an indicator whose current hash differs has changed since.
export type HfaIndicatorVerification = {
  indicatorId: string;
  inputHash: string;
  model: string;
  verifiedAt: string;
  verifiedBy: string;
};

// One rule an indicator breaks, in one round or, with `timePoint` null, in
// the indicator as a whole.
export type HfaVerificationFinding = {
  id: string;
  indicatorId: string;
  rule: HfaVerificationModelRuleId;
  timePoint: string | null;
  message: string;
  suggestion: string | null;
  dismissedAt: string | null;
  dismissedBy: string | null;
  createdAt: string;
};

// A finding as the model returns it.
export type HfaVerificationNewFinding = {
  rule: HfaVerificationModelRuleId;
  timePoint: string | null;
  message: string;
  suggestion: string | null;
};

// One indicator's check as the save takes it.
export type HfaVerificationResult = {
  indicatorId: string;
  inputHash: string;
  model: string;
  findings: HfaVerificationNewFinding[];
};

export type HfaVerificationRows = {
  verifications: HfaIndicatorVerification[];
  findings: HfaVerificationFinding[];
  rulesOff: HfaVerificationModelRuleId[];
};
