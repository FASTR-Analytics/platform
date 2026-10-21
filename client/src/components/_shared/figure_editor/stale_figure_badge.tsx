import {
  type FigureBundle,
  type FigureMetricResolution,
  type FigurePackageIssue,
  figurePackageIssueForMetrics,
  moduleRegistryLabel,
  type PackageScope,
  resolveFigureMetric,
  type RunAuthoringContext,
  t3,
} from "lib";
import { Button } from "panther";
import { createSignal, Show } from "solid-js";
import { figureScopeLabel, packageLabel } from "../mod.ts";
import { getAdminAreaLabelForLevel } from "~/state/instance/_util_disaggregation_label";
import {
  resolveFigureBundleInteractively,
  type ResolveFigureResult,
} from "~/generate_visualization/mod";

// The stale-figure affordance. A figure whose
// captured pair differs from its container's is shown, not hidden and not
// blocked. The badge offers one action, re-resolving this figure's
// `{ metricId, config }` under the container's current pair, and when that
// fails it says why on the figure and leaves the old bundle in place. There
// is no pre-flight anywhere: the per-figure badge is the report.

// Re-resolve one figure under the container's pair: the whole of the update
// action. The metric comes from the target package's authoring context: the
// figure's own, or the successor of a retired one with the config carried
// across (lib/retired_metrics.ts), and that lookup is the "metric not in
// this package" check. The resolution is the interactive one (a replicant
// missing under the new package is auto-defaulted), never the strict AI one.
export async function updateFigureToScope(
  scope: PackageScope,
  authoringContext: RunAuthoringContext,
  bundle: FigureBundle,
): Promise<ResolveFigureResult> {
  const resolution = resolveFigureMetric(authoringContext.metrics, bundle);
  if (resolution.kind === "absent") {
    return {
      ok: false,
      reason: describeFigureMetricAbsence(resolution, scope.runId),
    };
  }
  const issue = figurePackageIssueForMetrics(
    resolution.metric.id,
    resolution.config,
    authoringContext.metrics,
    authoringContext.population,
  );
  if (issue !== null) {
    return { ok: false, reason: describePackageIssue(issue, scope.runId) };
  }
  return resolveFigureBundleInteractively(
    scope,
    resolution.metric,
    resolution.config,
  );
}

// Why a stored figure has no metric in the package: the metric is absent, or
// it was retired with its module and its successor is absent too, or it was
// retired and nothing succeeded it.
export function describeFigureMetricAbsence(
  absence: Extract<FigureMetricResolution, { kind: "absent" }>,
  runId: string,
): string {
  const pkg = packageLabel(runId);
  if (absence.retired === undefined) {
    return t3({
      en: `Metric "${absence.metricId}" is not in ${pkg}`,
      fr: `L'indicateur "${absence.metricId}" n'est pas dans ${pkg}`,
      pt: `A métrica "${absence.metricId}" não está em ${pkg}`,
    });
  }
  const metric = t3(absence.retired.metric.label);
  const module = t3(absence.retired.metric.moduleLabel);
  const successor = absence.retired.successor;
  if (successor === undefined) {
    return t3({
      en:
        `"${metric}" belongs to the retired module "${module}" and has no replacement. Replace this visualization.`,
      fr:
        `"${metric}" appartient au module retiré "${module}" et n'a pas de remplaçant. Remplacez cette visualisation.`,
      pt:
        `"${metric}" pertence ao módulo retirado "${module}" e não tem substituto. Substitua esta visualização.`,
    });
  }
  const successorModule = moduleRegistryLabel(successor.moduleId);
  return t3({
    en:
      `"${metric}" belongs to the retired module "${module}". Its replacement, ${successor.metricId} in "${successorModule}", is not in ${pkg}.`,
    fr:
      `"${metric}" appartient au module retiré "${module}". Son remplaçant, ${successor.metricId} dans "${successorModule}", n'est pas dans ${pkg}.`,
    pt:
      `"${metric}" pertence ao módulo retirado "${module}". O seu substituto, ${successor.metricId} em "${successorModule}", não está em ${pkg}.`,
  });
}

function describePackageIssue(
  issue: FigurePackageIssue,
  runId: string,
): string {
  const pkg = packageLabel(runId);
  if (issue.kind === "metric_not_in_package") {
    return t3({
      en: `Metric "${issue.metricId}" is not in ${pkg}`,
      fr: `L'indicateur "${issue.metricId}" n'est pas dans ${pkg}`,
      pt: `A métrica "${issue.metricId}" não está em ${pkg}`,
    });
  }
  if (issue.kind === "metric_unavailable") {
    const because = issue.reason === null ? "" : `: ${issue.reason}`;
    return t3({
      en: `Metric "${issue.metricId}" is not available in ${pkg}${because}`,
      fr:
        `L'indicateur "${issue.metricId}" n'est pas disponible dans ${pkg}${because}`,
      pt:
        `A métrica "${issue.metricId}" não está disponível em ${pkg}${because}`,
    });
  }
  const dims = issue.disaggregationOptions.join(", ");
  if (issue.populationLevel === undefined) {
    return t3({
      en: `${pkg} has no ${dims} for this visualization`,
      fr: `${pkg} n'a pas de ${dims} pour cette visualisation`,
      pt: `${pkg} não tem ${dims} para esta visualização`,
    });
  }
  const level = t3(getAdminAreaLabelForLevel(issue.populationLevel));
  return t3({
    en:
      `${pkg} has no ${dims} for this visualization because its population data is at ${level}`,
    fr:
      `${pkg} n'a pas de ${dims} pour cette visualisation car ses données de population sont au niveau ${level}`,
    pt:
      `${pkg} não tem ${dims} para esta visualização porque os seus dados de população estão ao nível ${level}`,
  });
}

// What a bundle says it came from, for the badge and the header caption.
function bundleOriginLabel(bundle: FigureBundle): string {
  return `${packageLabel(bundle.provenance.runId)} · ${
    figureScopeLabel(bundle.scope)
  }`;
}

type BadgeProps = {
  bundle: FigureBundle;
  scope: PackageScope;
  authoringContext: RunAuthoringContext;
  // Commit the re-resolved bundle back into the host document.
  onUpdated: (bundle: FigureBundle) => void;
  canEdit: boolean;
};

// The per-figure badge: what this figure came from, one update button, and
// the failure reason in place when the update cannot be done.
export function StaleFigureBadge(p: BadgeProps) {
  const [busy, setBusy] = createSignal(false);
  const [reason, setReason] = createSignal<string | undefined>();

  async function update() {
    setBusy(true);
    setReason(undefined);
    const res = await updateFigureToScope(
      { runId: p.scope.runId, scopeId: p.scope.scopeId },
      p.authoringContext,
      p.bundle,
    );
    setBusy(false);
    if (res.ok) {
      p.onUpdated(res.bundle);
      return;
    }
    setReason(res.reason);
  }

  return (
    <div class="ui-pad-sm ui-spy-sm border-warning bg-base-100 rounded border text-xs">
      <div class="text-base-content-muted">
        {t3({
          en: `From ${bundleOriginLabel(p.bundle)}`,
          fr: `De ${bundleOriginLabel(p.bundle)}`,
          pt: `De ${bundleOriginLabel(p.bundle)}`,
        })}
      </div>
      <Show when={p.canEdit}>
        <Button
          size="sm"
          outline
          iconName="refresh"
          onClick={update}
          loading={busy()}
        >
          {t3({
            en: `Update to ${packageLabel(p.scope.runId)}`,
            fr: `Mettre à jour vers ${packageLabel(p.scope.runId)}`,
            pt: `Atualizar para ${packageLabel(p.scope.runId)}`,
          })}
        </Button>
      </Show>
      <Show when={reason()} keyed>
        {(keyedReason) => <div class="text-danger">{keyedReason}</div>}
      </Show>
    </div>
  );
}

type UpdateAllProps = {
  count: number;
  busy: boolean;
  onClick: () => void;
};

// The editor-header counterpart: how many figures in this document were
// resolved under a different pair, and one button to re-resolve them all.
export function UpdateAllFiguresButton(p: UpdateAllProps) {
  return (
    <Show when={p.count > 0}>
      <Button
        outline
        onBackground="base-300"
        iconName="refresh"
        onClick={p.onClick}
        loading={p.busy}
      >
        {t3({
          en: `Update all visualizations (${p.count})`,
          fr: `Mettre à jour toutes les visualisations (${p.count})`,
          pt: `Atualizar todas as visualizações (${p.count})`,
        })}
      </Button>
    </Show>
  );
}
