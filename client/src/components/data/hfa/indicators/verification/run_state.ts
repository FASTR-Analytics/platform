import { type HfaVerificationRunState, t3 } from "lib";
import { instanceState } from "~/state/instance/t1_store";

// The instance's verification run while it is running or stopping; undefined
// before the first run and once the latest has ended.
export function liveHfaVerificationRun(): HfaVerificationRunState | undefined {
  const run = instanceState.hfaVerificationRun;
  return run?.status === "running" || run?.status === "stopping"
    ? run
    : undefined;
}

// Why a structured answer was null, for a verification or a fix.
export function noAnswerReason(stopReason: string | null): string {
  switch (stopReason) {
    case "refusal":
      return t3({
        en: "the model declined",
        fr: "le modèle a refusé",
        pt: "o modelo recusou",
      });
    case "max_tokens":
      return t3({
        en: "the answer was cut off",
        fr: "la réponse a été tronquée",
        pt: "a resposta foi cortada",
      });
    default:
      return t3({
        en: "the answer was not in the expected form",
        fr: "la réponse n'avait pas la forme attendue",
        pt: "a resposta não tinha a forma esperada",
      });
  }
}
