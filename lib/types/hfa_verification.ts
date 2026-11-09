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

// "running" and "stopping" are live; a stopping run claims nothing more and
// ends once the calls in flight have answered.
export type HfaVerificationRunStatus =
  | "running"
  | "stopping"
  | "completed"
  | "stopped"
  | "error";

// An indicator the model gave no usable answer for: `stopReason` is the
// response's, `refusal` or `max_tokens`, or another when the answer failed
// the schema.
export type HfaVerificationNotChecked = {
  indicatorId: string;
  stopReason: string | null;
};

// The instance's latest verification run as clients receive it. `pending` is
// every indicator still on the queue, its call in flight or not, oldest first.
export type HfaVerificationRunState = {
  status: HfaVerificationRunStatus;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
  done: number;
  pending: string[];
  notChecked: HfaVerificationNotChecked[];
  error: string | null;
};
