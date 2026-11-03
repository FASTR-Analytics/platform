import {
  HFA_VERIFICATION_MODEL_RULE_IDS,
  HFA_VERIFICATION_RULE_GROUPS,
  HFA_VERIFICATION_RULES,
  HFA_VERIFICATION_SEVERITIES,
  type HfaVerificationModelRuleId,
  type HfaVerificationRows,
  type HfaVerificationRule,
  type HfaVerificationRuleGroup,
  t3,
} from "lib";
import {
  type AlertComponentProps,
  Checkbox,
  ModalContainer,
  openAlert,
  plural,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  rows: () => HfaVerificationRows | undefined;
};

const GROUPS = Object.keys(
  HFA_VERIFICATION_RULE_GROUPS,
) as HfaVerificationRuleGroup[];

function rulesByGroup<C extends HfaVerificationRule["checker"]>(checker: C) {
  return GROUPS.flatMap((group) => {
    const rules = HFA_VERIFICATION_RULES.filter((
      r,
    ): r is Extract<HfaVerificationRule, { checker: C }> =>
      r.checker === checker && r.group === group
    );
    return rules.length === 0 ? [] : [{ group, rules }];
  });
}

const APP_RULES = rulesByGroup("app");
const MODEL_RULES = rulesByGroup("model");

function hiddenLabel(n: number): string {
  return plural(n, {
    one: t3({ en: `${n} hidden`, fr: `${n} masqué`, pt: `${n} oculta` }),
    other: t3({ en: `${n} hidden`, fr: `${n} masqués`, pt: `${n} ocultas` }),
  });
}

function RuleLine(p: { rule: HfaVerificationRule; hidden?: string }) {
  return (
    <span class="ui-gap-sm flex items-baseline">
      <span
        class={p.rule.severity === "problem"
          ? "text-danger font-700 flex-none"
          : "text-warning font-700 flex-none"}
      >
        {t3(HFA_VERIFICATION_SEVERITIES[p.rule.severity])}
      </span>
      <span>{t3(p.rule.text)}</span>
      <Show when={p.hidden}>
        {(hidden) => (
          <span class="text-base-content-muted flex-none">{hidden()}</span>
        )}
      </Show>
    </span>
  );
}

export function HfaVerificationRulesModal(
  p: AlertComponentProps<Props, undefined>,
) {
  // A switch writes the whole list, computed from the rows it saw. Until
  // newer rows land, the switches show what was written and stay disabled,
  // so a second switch cannot be computed from rows that lack the first.
  const [pending, setPending] = createSignal<{
    from: HfaVerificationRows;
    rulesOff: HfaVerificationModelRuleId[];
  }>();
  const pendingRulesOff = () => {
    const pd = pending();
    return pd !== undefined && pd.from === p.rows() ? pd.rulesOff : undefined;
  };
  const rulesOff = () => pendingRulesOff() ?? p.rows()?.rulesOff ?? [];

  const hiddenCount = (id: string): number =>
    p.rows()?.findings.filter((f) => f.rule === id && f.dismissedAt === null)
      .length ?? 0;

  async function setRuleOn(id: HfaVerificationModelRuleId, on: boolean) {
    const rows = p.rows();
    if (rows === undefined) return;
    const off = new Set(rulesOff());
    if (on) off.delete(id);
    else off.add(id);
    const next = HFA_VERIFICATION_MODEL_RULE_IDS.filter((r) => off.has(r));
    setPending({ from: rows, rulesOff: next });
    const res = await serverActions.setHfaVerificationRulesOff({
      ruleIds: next,
    });
    if (!res.success) {
      setPending(undefined);
      await openAlert({ text: res.err, intent: "danger" });
    }
  }

  return (
    <ModalContainer
      title={t3({
        en: "Verification rules",
        fr: "Règles de vérification",
        pt: "Regras de verificação",
      })}
      width="lg"
      onClose={{ kind: "close", onClick: () => p.close(undefined) }}
    >
      <div class="ui-spy">
        <div class="text-base-content-muted text-sm">
          {t3({
            en:
              "The model is asked about every rule. A rule switched off has its findings hidden wherever findings show; switched back on, they show again without a new run.",
            fr:
              "Le modèle est interrogé sur chaque règle. Les constats d'une règle désactivée sont masqués partout où les constats s'affichent ; réactivée, ils réapparaissent sans nouvelle vérification.",
            pt:
              "O modelo é consultado sobre cada regra. As constatações de uma regra desativada ficam ocultas onde quer que as constatações apareçam; reativada, voltam a aparecer sem nova verificação.",
          })}
        </div>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({
              en: "Checked by the app",
              fr: "Vérifiées par l'application",
              pt: "Verificadas pela aplicação",
            })}
          </div>
          <For each={APP_RULES}>
            {(g) => (
              <div class="ui-spy-sm">
                <div class="text-base-content-muted text-sm">
                  {t3(HFA_VERIFICATION_RULE_GROUPS[g.group])}
                </div>
                <For each={g.rules}>
                  {(rule) => (
                    <div class="pl-7">
                      <RuleLine rule={rule} />
                    </div>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
        <div class="ui-spy-sm">
          <div class="font-700">
            {t3({
              en: "Checked by the model",
              fr: "Vérifiées par le modèle",
              pt: "Verificadas pelo modelo",
            })}
          </div>
          <For each={MODEL_RULES}>
            {(g) => (
              <div class="ui-spy-sm">
                <div class="text-base-content-muted text-sm">
                  {t3(HFA_VERIFICATION_RULE_GROUPS[g.group])}
                </div>
                <For each={g.rules}>
                  {(rule) => (
                    <Checkbox
                      checked={!rulesOff().includes(rule.id)}
                      disabled={pendingRulesOff() !== undefined}
                      onChange={(on) => setRuleOn(rule.id, on)}
                      label={
                        <RuleLine
                          rule={rule}
                          hidden={rulesOff().includes(rule.id)
                            ? hiddenLabel(hiddenCount(rule.id))
                            : undefined}
                        />
                      }
                    />
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </ModalContainer>
  );
}
