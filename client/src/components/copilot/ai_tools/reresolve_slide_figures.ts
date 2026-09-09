import type { ContentBlock, FigureBundle, PackageScope, Slide } from "lib";
import type { LayoutNode } from "panther";
import { AIToolFailure } from "panther";
import {
  findStaleFiguresInLayout,
  resolveBundleFromMetricAndConfig,
} from "~/generate_visualization/mod";
import { getRunAuthoringContextFromCacheOrFetch } from "~/state/instance/t2_run_authoring_context";

// Re-point a DRAFT slide's figures at another product's (package, scope) pair
// before it is written there (PLAN_PRODUCTS_RESTRUCTURE D15).
//
// A draft the copilot built with no deck open resolved under the instance pin
// at national scope. Writing it verbatim into a deck attached to a different
// package would create a figure that is stale the moment it lands: the D4
// badge would fire on a figure the user never chose to leave behind. So the
// add-to-deck path re-resolves first: same `{ metricId, config }`, queried
// under the TARGET deck's pair.
//
// Failure is loud, not silent. If the target package has no such metric there
// is nothing to re-resolve against, and quietly keeping the old bundle would
// write the wrong package's data into the deck. This is deliberately different
// from copying slides between two decks, which copies stored bundles verbatim
// between two products the user already owns: there the mixed-package state is
// the user's own visible choice.
export async function reresolveSlideFiguresUnderScope(
  slide: Slide,
  targetScope: PackageScope,
): Promise<Slide> {
  if (slide.type !== "content") return slide;

  // Same predicate as the stale badge (D4), so a draft is re-resolved exactly
  // when the badge would have fired on it once written.
  const stale = findStaleFiguresInLayout(slide.layout, targetScope);
  if (stale.length === 0) return slide;

  const ctxRes = await getRunAuthoringContextFromCacheOrFetch(
    targetScope.runId,
  );
  if (!ctxRes.success) {
    throw new AIToolFailure(
      `Could not read the target deck's results package: ${ctxRes.err}`,
    );
  }
  const metrics = ctxRes.data.metrics;

  const replacements = new Map<string, FigureBundle>();
  for (const { blockId, bundle } of stale) {
    const metric = metrics.find((m) => m.id === bundle.metricId);
    if (!metric) {
      throw new AIToolFailure(
        `This slide's figure uses metric "${bundle.metricId}", which the target deck's results package does not contain. Pick a deck on a package that has it, or rebuild the figure from a metric that does.`,
      );
    }
    replacements.set(
      blockId,
      await resolveBundleFromMetricAndConfig(targetScope, metric, bundle.config),
    );
  }

  return { ...slide, layout: applyBundles(slide.layout, replacements) };
}

function applyBundles(
  node: LayoutNode<ContentBlock>,
  replacements: Map<string, FigureBundle>,
): LayoutNode<ContentBlock> {
  if (node.type === "item") {
    const bundle = replacements.get(node.id);
    // Spread-and-override: node-level fields (style, alignV, minH, maxH) are
    // preserved; only the block data is swapped.
    return bundle ? { ...node, data: { type: "figure", bundle } } : node;
  }
  return {
    ...node,
    children: node.children.map((child) => applyBundles(child, replacements)),
  };
}
