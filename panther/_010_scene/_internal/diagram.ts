// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedSceneStyle, RenderContext } from "../deps.ts";
import type {
  DiagramCustomNode,
  DiagramData,
  DiagramGeometry,
} from "../types.ts";
import { boxGeometry, boxTextStyles, measureBoxContent } from "./box_layout.ts";
import { buildDiagramBundle } from "./bundle.ts";
import { diagramScene } from "./adapter.ts";
import type { SceneFit } from "./measure.ts";
import { resolveConnectors, resolveNodes, resolveTexts } from "./resolve.ts";
import type { ResolvedNode } from "./resolve.ts";
import { bracketSideFor, placeDiagram } from "../placer.ts";
import type { PlacerMeasure, PlacerSpacing } from "../placer.ts";

export type DiagramFit = SceneFit & { geometry: DiagramGeometry };
export type DiagramSource = (fitW: number) => DiagramFit;

// The scene source for a diagram: the placer lays out once, at its natural
// extent; the engine lays out at every fit width it is asked for, its floor
// (the layout at fit width 0) the frame's narrowest width.
export function diagramSource(
  data: DiagramData,
  customNode: DiagramCustomNode | undefined,
): (rc: RenderContext, s: MergedSceneStyle) => DiagramSource {
  return (rc, s) => {
    const layout = data.layout;
    const texts = resolveTexts(data, s);
    if (layout.kind === "placed") {
      const nodes = resolveNodes(rc, data, s, customNode);
      const connectors = resolveConnectors(data, s);
      const measure: PlacerMeasure = {
        nodeHeight: (node, w) => {
          const resolved = nodes.get(node.id)!;
          if (resolved.claimed) {
            return customNode!.measure(rc, resolved.info, w, 1)!.h;
          }
          return boxHeight(rc, s, resolved, w);
        },
        bandLabel: (text, maxW) => textDims(rc, s, text, maxW),
        groupLabel: (text, maxW) => textDims(rc, s, text, maxW),
        text: (text, w) => rc.mText(text, s.text.text, w).dims.h(),
      };
      const spacing: PlacerSpacing = {
        connectorGap: s.connectors.gap,
        connectorPad: s.connectors.headSize / 2 + s.connectors.strokeWidth / 2,
        cornerRadius: s.connectors.cornerRadius,
        groupPad: s.diagram.groupPad,
        bracketDepth: s.regions.bracket.depth,
        labelInset: s.regions.labelInset,
        textGap: s.boxes.textGap,
      };
      const geometry = placeDiagram(data, layout, measure, spacing);
      const scene = diagramScene({
        data,
        geometry,
        nodes,
        connectors,
        texts,
        style: s,
        customNode,
        bandSide: layout.orientation === "top-bottom" ? "left" : "top",
        bracketSide: bracketSideFor(layout),
      });
      const fit: DiagramFit = { scene, minW: scene.frame.w, geometry };
      return () => fit;
    }
    const bundle = buildDiagramBundle(rc, data, layout, s, customNode);
    let floorW: number | undefined;
    const fits = new Map<number, DiagramFit>();
    return (fitW) => {
      let fit = fits.get(fitW);
      if (fit === undefined) {
        const geometry = bundle.layoutAt(fitW);
        floorW ??= bundle.layoutAt(0).frame.w;
        fit = {
          scene: diagramScene({
            data,
            geometry,
            nodes: bundle.nodes,
            connectors: bundle.connectors,
            texts,
            style: s,
            customNode,
            bandSide: "left",
            bracketSide: "right",
          }),
          minW: floorW,
          geometry,
        };
        fits.set(fitW, fit);
      }
      return fit;
    };
  };
}

function textDims(
  rc: RenderContext,
  s: MergedSceneStyle,
  text: string,
  maxW: number,
): { w: number; h: number } {
  const mt = rc.mText(text, s.text.regionLabel, Math.max(0, maxW));
  return { w: mt.dims.w(), h: mt.dims.h() };
}

function boxHeight(
  rc: RenderContext,
  s: MergedSceneStyle,
  node: ResolvedNode,
  w: number,
): number {
  const { style } = node;
  const innerW = w - style.padding.totalPx() - style.strokeWidth;
  const content = measureBoxContent(
    rc,
    node.content,
    innerW,
    boxTextStyles(s, { variant: "box", style }),
    boxGeometry(s),
    style.badges,
  );
  return content.h + style.padding.totalPy() + style.strokeWidth;
}
