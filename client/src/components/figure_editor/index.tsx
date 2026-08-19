import {
  type FigureBundle,
  PackageScope,
  PresentationObjectConfig,
  ResultsValue,
  ResultsValueInfoForPresentationObject,
  RunAuthoringContext,
  t3,
  TC,
} from "lib";
import { AlertComponentProps, StateHolderWrapper, createQuery } from "panther";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/products/t2_figure_data";
import { VisualizationEditorInner } from "./visualization_editor_inner";

// =============================================================================
// The EMBEDDED figure editor
// =============================================================================
//
// A figure is `{ metricId, config }` inside a product (D3) — there is no
// standalone visualization to open, create, save-as-new or duplicate, so this
// wrapper has exactly ONE mode: a host (slide editor, report editor, Explore)
// hands it a metric, a config and the product's PackageScope, and gets back the
// edited config. Everything the deleted standalone shell did — its own PO room,
// its own save, settings, duplicate, delete — went with the visualization
// product.
//
// The wrapper's whole job is to resolve the metric's queryable shape
// (`resultsValueInfo` — which filter and disaggregation options exist, and
// their possible values) under the host's pair before mounting the editor. That
// read is scope-dependent, which is why it lives here and not in the host.
// =============================================================================

export type EphemeralModeReturn =
  | undefined
  | { updated: { config: PresentationObjectConfig } };

/**
 * Live-collab binding for the embedded figure editor. The host passes this so
 * the editor co-edits the figure's config IN the host's shared doc (the
 * figConfig Y.Map), rather than committing once on Apply. Absent (or not live)
 * → the editor keeps the classic Apply/Cancel flow.
 */
export type VizFigureCollabBinding = {
  /** Host-side id of the figure being edited (slide layout blockId / report
   *  figure registry id) — scopes live-cursor broadcasts to viewers of the
   *  same figure. */
  figureId: string;
  /** Identity of the host doc whose room checkpoints these edits — the editor
   *  reads docSaveFailing for THIS doc, since the host editor's own indicator
   *  is covered while the editor is open. */
  hostDoc: { docType: "slide" | "report"; docId: string };
  /** The figConfig Y.Map in the host doc (slide node / report figure entry),
   *  or undefined if the figure isn't decomposed (no live co-editing then). */
  getConfigMap: () => Y.Map<unknown> | undefined;
  /** The host session's Yjs awareness (carries caption carets). */
  awareness: Awareness;
  isLive: () => boolean;
  /** Accessor (not a baked value) so a permission / fatal-room change while
   *  the editor is open propagates into the caption editors. */
  canEdit: () => boolean;
  /** Transaction origin for this client's edits (for the scoped undo manager). */
  localOrigin: object;
  /** Called when a coherent bundle (edited config + refreshed items) is ready,
   *  so the host can path-set it into its doc — keeps canvas peers' data in step
   *  with the config being co-edited. */
  onCoherentBundle: (bundle: FigureBundle) => void;
};

export type VisualizationEditorProps = {
  /** Header label — the figure's metric label. */
  label: string;
  /** The product's pair, read LIVE from T1 by the host and passed down here.
   *  Every read this editor makes resolves under it. */
  scope: PackageScope;
  metric: ResultsValue;
  configSnapshot: PresentationObjectConfig;
  /** The product run's authoring context (immutable T2, keyed by the LIVE
   *  runId) — the metric catalog behind the results-object viewer. */
  authoringContext: RunAuthoringContext;
  /** When present + live, the figure is co-edited in the host doc (see type). */
  collabBinding?: VizFigureCollabBinding;
};

export function VisualizationEditor(
  p: AlertComponentProps<VisualizationEditorProps, EphemeralModeReturn>,
) {
  const resultsValueInfo = createQuery(
    () =>
      getResultsValueInfoForPresentationObjectFromCacheOrFetch(
        { runId: p.scope.runId, adminArea2: p.scope.adminArea2 },
        p.metric.id,
      ),
    t3(TC.loading),
  );

  return (
    <StateHolderWrapper state={resultsValueInfo.state()}>
      {(keyedResultsValueInfo: ResultsValueInfoForPresentationObject) => (
        <VisualizationEditorInner
          scope={p.scope}
          label={p.label}
          metric={p.metric}
          configSnapshot={p.configSnapshot}
          authoringContext={p.authoringContext}
          resultsValueInfo={keyedResultsValueInfo}
          collabBinding={p.collabBinding}
          onClose={p.close}
        />
      )}
    </StateHolderWrapper>
  );
}
