import { createSignal } from "solid-js";
import type { VisualizationGroupingMode } from "lib";

export const [fitWithin, setFitWithin] = createSignal<
  "fit-within" | "fit-width"
>("fit-within");

const storedGroupingMode = localStorage.getItem("vizGroupingMode") as VisualizationGroupingMode | null;

export const [vizGroupingMode, setVizGroupingModeInternal] = createSignal<VisualizationGroupingMode>(
  storedGroupingMode ?? "module"
);

export function setVizGroupingMode(mode: VisualizationGroupingMode) {
  localStorage.setItem("vizGroupingMode", mode);
  setVizGroupingModeInternal(mode);
}

export const [headerOrContent, setHeaderOrContent] = createSignal<
  "slideHeader" | "content"
>("content");

export const [policyHeaderOrContent, setPolicyHeaderOrContent] = createSignal<
  "policyHeaderFooter" | "content"
>("content");

export const [showModules, setShowModules] = createSignal<string | undefined>(
  "m001",
);

export const [showAi, setShowAi] = createSignal<boolean>(false);
