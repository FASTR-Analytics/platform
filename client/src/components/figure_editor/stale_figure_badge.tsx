import {
  FigureBundle,
  FigurePackageIssue,
  PackageScope,
  RunAuthoringContext,
  figurePackageIssueForMetrics,
  t3,
} from "lib";
import { Button } from "panther";
import { Show, createSignal } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";
import { resolveFigureBundleInteractively } from "~/generate_visualization/mod";
import type { ResolveFigureResult } from "~/generate_visualization/mod";

// =============================================================================
// The stale-figure affordance (D4)
// =============================================================================
//
// A figure whose captured pair differs from its product's is shown, not hidden
// and not blocked: mixed-package products are a deliberate, visible state (a Q2
// figure kept next to a Q3 one). The badge offers ONE action — re-resolve this
// figure's `{ metricId, config }` under the product's CURRENT pair — and when
// that fails it says why ON THE FIGURE and leaves the old bundle in place.
//
// There is no pre-flight anywhere: reattach and scope change never consult a
// compatibility report, because the per-figure badge IS the report.
// =============================================================================

// Human label for a package, from the T1 ready-package list. Falls back to a
// short id when the package is not in the list (it can be an older, unpinned
// one — every product keeps pointing at exactly the package it was attached
// to, and that package is never re-labelled).
export function packageLabel(runId: string): string {
  return (
    instanceState.readyPackages.find((r) => r.id === runId)?.label ??
    runId.slice(0, 8)
  );
}

export function scopeLabel(adminArea2: string | null): string {
  return adminArea2 ?? t3({ en: "National", fr: "National", pt: "Nacional" });
}

// Re-resolve one figure under a target pair — the whole of the update action.
//
// The metric comes from the TARGET package's authoring context, and that lookup
// IS the "metric not in this package" check — which is why reattaching a
// product needs no compatibility pre-flight anywhere.
//
// The resolution itself is the INTERACTIVE one (auto-defaults a replicant that
// no longer exists), never the strict AI one — see
// resolveFigureBundleInteractively for why the two policies differ.
export async function updateFigureToScope(
  scope: PackageScope,
  authoringContext: RunAuthoringContext,
  bundle: FigureBundle,
): Promise<ResolveFigureResult> {
  // ONE rule for "why won't this figure resolve here", shared with the server
  // (lib/figure_package_issue.ts): a missing metric makes its availability
  // stamp and its dimensions unanswerable, so the first thing that fails is
  // what gets reported.
  const issue = figurePackageIssueForMetrics(
    bundle.metricId,
    bundle.config,
    authoringContext.metrics,
  );
  if (issue !== null) {
    return { ok: false, reason: describePackageIssue(issue, scope.runId) };
  }
  const metric = authoringContext.metrics.find((m) => m.id === bundle.metricId)!;
  return resolveFigureBundleInteractively(scope, metric, bundle.config);
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

type BadgeProps = {
  bundle: FigureBundle;
  scope: PackageScope;
  authoringContext: RunAuthoringContext;
  /** Commit the re-resolved bundle back into the host document. */
  onUpdated: (bundle: FigureBundle) => void;
  canEdit: boolean;
};

// The per-figure badge: what this figure came from, one update button, and the
// failure reason in place when the update cannot be done.
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
          en: `From ${packageLabel(p.bundle.provenance.runId)} · ${scopeLabel(p.bundle.scope.adminArea2)}`,
          fr: `De ${packageLabel(p.bundle.provenance.runId)} · ${scopeLabel(p.bundle.scope.adminArea2)}`,
          pt: `De ${packageLabel(p.bundle.provenance.runId)} · ${scopeLabel(p.bundle.scope.adminArea2)}`,
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

// The editor-header counterpart: how many figures in this product were resolved
// under a different pair, and one button to re-resolve them all.
export function UpdateAllFiguresButton(p: UpdateAllProps) {
  return (
    <Show when={p.count > 0}>
      <Button
        outline
        iconName="refresh"
        onClick={p.onClick}
        loading={p.busy}
      >
        {t3({
          en: `Update all figures (${p.count})`,
          fr: `Mettre à jour toutes les figures (${p.count})`,
          pt: `Atualizar todas as figuras (${p.count})`,
        })}
      </Button>
    </Show>
  );
}

// The scope badge both editor headers show — which package and scope the OPEN
// product serves from. Read from the live T1 row by the caller.
export function ProductScopeBadge(p: { scope: PackageScope }) {
  return (
    <span class="border-base-300 text-base-content-muted rounded border px-2 py-1 text-xs">
      {`${packageLabel(p.scope.runId)} · ${scopeLabel(p.scope.adminArea2)}`}
    </span>
  );
}
