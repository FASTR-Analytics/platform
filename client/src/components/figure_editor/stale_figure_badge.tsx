import {
  type FigureBundle,
  type FigurePackageIssue,
  type PackageScope,
  type RunAuthoringContext,
  figurePackageIssueForMetrics,
  t3,
} from "lib";
import { Button } from "panther";
import { createSignal, Show } from "solid-js";
import { packageLabel, scopeLabel } from "~/components/products/package_label";
import {
  resolveFigureBundleInteractively,
  type ResolveFigureResult,
} from "~/generate_visualization/mod";

// The stale-figure affordance (PLAN_PRODUCTS_RESTRUCTURE D4). A figure whose
// captured pair differs from its container's is shown, not hidden and not
// blocked. The badge offers one action, re-resolving this figure's
// `{ metricId, config }` under the container's current pair, and when that
// fails it says why on the figure and leaves the old bundle in place. There
// is no pre-flight anywhere: the per-figure badge is the report.

// Re-resolve one figure under the container's pair: the whole of the update
// action. The metric comes from the target package's authoring context, and
// that lookup is the "metric not in this package" check. The resolution is
// the interactive one (a replicant missing under the new package is
// auto-defaulted), never the strict AI one.
export async function updateFigureToScope(
  scope: PackageScope,
  authoringContext: RunAuthoringContext,
  bundle: FigureBundle,
): Promise<ResolveFigureResult> {
  const metric = authoringContext.metrics.find((m) => m.id === bundle.metricId);
  if (metric === undefined) {
    return {
      ok: false,
      reason: describePackageIssue(
        { kind: "metric_not_in_package", metricId: bundle.metricId },
        scope.runId,
      ),
    };
  }
  const issue = figurePackageIssueForMetrics(
    bundle.metricId,
    bundle.config,
    authoringContext.metrics,
  );
  if (issue !== null) {
    return { ok: false, reason: describePackageIssue(issue, scope.runId) };
  }
  return resolveFigureBundleInteractively(scope, metric, bundle.config);
}

function describePackageIssue(issue: FigurePackageIssue, runId: string): string {
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
      fr: `L'indicateur "${issue.metricId}" n'est pas disponible dans ${pkg}${because}`,
      pt: `A métrica "${issue.metricId}" não está disponível em ${pkg}${because}`,
    });
  }
  const dims = issue.disaggregationOptions.join(", ");
  return t3({
    en: `${pkg} has no ${dims} for this figure`,
    fr: `${pkg} n'a pas de ${dims} pour cette figure`,
    pt: `${pkg} não tem ${dims} para esta figura`,
  });
}

// What a bundle says it came from, for the badge and the header caption.
function bundleOriginLabel(bundle: FigureBundle): string {
  const pkg = bundle.provenance.runId === null
    ? t3({ en: "an unknown package", fr: "un package inconnu", pt: "um pacote desconhecido" })
    : packageLabel(bundle.provenance.runId);
  const scope = bundle.scope === undefined
    ? t3({ en: "unknown scope", fr: "portée inconnue", pt: "âmbito desconhecido" })
    : scopeLabel(bundle.scope.adminArea2);
  return `${pkg} · ${scope}`;
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
      { runId: p.scope.runId, adminArea2: p.scope.adminArea2 },
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
      <Button outline iconName="refresh" onClick={p.onClick} loading={p.busy}>
        {t3({
          en: `Update all figures (${p.count})`,
          fr: `Mettre à jour toutes les figures (${p.count})`,
          pt: `Atualizar todas as figuras (${p.count})`,
        })}
      </Button>
    </Show>
  );
}
