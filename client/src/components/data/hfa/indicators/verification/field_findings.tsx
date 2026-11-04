import {
  HFA_VERIFICATION_SEVERITIES,
  type HfaVerificationField,
  type HfaVerificationFinding,
  hfaVerificationRule,
  t3,
} from "lib";
import { Button, createButtonAction, plural } from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

function createDismissAction(finding: () => HfaVerificationFinding) {
  return createButtonAction((dismissed: boolean) =>
    serverActions.setHfaVerificationFindingsDismissed({
      findingIds: [finding().id],
      dismissed,
    })
  );
}

function RoundSuffix(p: { finding: HfaVerificationFinding }) {
  return (
    <Show when={p.finding.timePoint}>
      {(timePoint) => (
        <span class="text-base-content-muted">{` (${timePoint()})`}</span>
      )}
    </Show>
  );
}

function OpenFinding(p: { finding: HfaVerificationFinding }) {
  const dismiss = createDismissAction(() => p.finding);
  const rule = () => hfaVerificationRule(p.finding.rule);
  return (
    <div class="ui-gap-sm flex items-start text-xs">
      <div class="min-w-0 flex-1">
        <div>
          <span
            class={rule().severity === "problem"
              ? "text-danger font-700"
              : "text-warning font-700"}
          >
            {t3(HFA_VERIFICATION_SEVERITIES[rule().severity])}
          </span>
          {": "}
          <span class="font-700">{t3(rule().text)}</span>
          <RoundSuffix finding={p.finding} />
        </div>
        <div>{p.finding.message}</div>
        <Show when={p.finding.suggestion}>
          {(suggestion) => (
            <div class="text-base-content-muted">
              {t3({
                en: "Suggestion: ",
                fr: "Suggestion : ",
                pt: "Sugestão: ",
              })}
              {suggestion()}
            </div>
          )}
        </Show>
      </div>
      <Button
        size="sm"
        intent="neutral"
        outline
        onClick={() => dismiss.click(true)}
        state={dismiss.state()}
      >
        {t3({ en: "Dismiss", fr: "Écarter", pt: "Descartar" })}
      </Button>
    </div>
  );
}

function DismissedFinding(p: { finding: HfaVerificationFinding }) {
  const undo = createDismissAction(() => p.finding);
  return (
    <div class="ui-gap-sm text-base-content-muted flex items-start text-xs">
      <div class="min-w-0 flex-1">
        {t3(hfaVerificationRule(p.finding.rule).text)}
        <RoundSuffix finding={p.finding} />
        {`: ${p.finding.message}`}
      </div>
      <Button
        size="sm"
        ghost
        onClick={() => undo.click(false)}
        state={undo.state()}
      >
        {t3({ en: "Undo", fr: "Rétablir", pt: "Repor" })}
      </Button>
    </div>
  );
}

// One editor field's findings, those of its rules about the selected round or
// the whole indicator: the open ones in full, each with Dismiss, and the
// dismissed ones collapsed to a count, each with Undo.
export function HfaFieldFindings(p: {
  findings: {
    open: HfaVerificationFinding[];
    dismissed: HfaVerificationFinding[];
  };
  field: HfaVerificationField;
  timePoint: string;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const shown = (f: HfaVerificationFinding) =>
    hfaVerificationRule(f.rule).field === p.field &&
    (f.timePoint === null || f.timePoint === p.timePoint);
  const open = () => p.findings.open.filter(shown);
  const dismissed = () => p.findings.dismissed.filter(shown);
  const dismissedLabel = () => {
    const n = dismissed().length;
    return plural(n, {
      one: t3({
        en: `${n} dismissed`,
        fr: `${n} écarté`,
        pt: `${n} descartada`,
      }),
      other: t3({
        en: `${n} dismissed`,
        fr: `${n} écartés`,
        pt: `${n} descartadas`,
      }),
    });
  };
  return (
    <Show when={open().length > 0 || dismissed().length > 0}>
      <div class="ui-spy-sm mt-1">
        <For each={open()}>
          {(finding) => <OpenFinding finding={finding} />}
        </For>
        <Show when={dismissed().length > 0}>
          <div class="ui-spy-sm">
            <Button
              size="sm"
              ghost
              iconName={expanded() ? "chevronUp" : "chevronDown"}
              onClick={() => setExpanded(!expanded())}
            >
              {dismissedLabel()}
            </Button>
            <Show when={expanded()}>
              <For each={dismissed()}>
                {(finding) => <DismissedFinding finding={finding} />}
              </For>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
