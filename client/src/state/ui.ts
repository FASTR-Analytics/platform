import { createSignal } from "solid-js";
import type { VisualizationGroupingMode } from "lib";

export const [fitWithin, setFitWithin] = createSignal<
  "fit-within" | "fit-width"
>("fit-within");

const storedGroupingMode = localStorage.getItem("vizGroupingMode") as VisualizationGroupingMode | null;

export const [vizGroupingMode, setVizGroupingModeInternal] = createSignal<VisualizationGroupingMode>(
  storedGroupingMode ?? "folders"
);

export function setVizGroupingMode(mode: VisualizationGroupingMode) {
  localStorage.setItem("vizGroupingMode", mode);
  setVizGroupingModeInternal(mode);
}

const storedSelectedGroup = localStorage.getItem("vizSelectedGroup");

export const [vizSelectedGroup, setVizSelectedGroupInternal] = createSignal<string | null>(
  storedSelectedGroup
);

export function setVizSelectedGroup(group: string | null) {
  if (group === null) {
    localStorage.removeItem("vizSelectedGroup");
  } else {
    localStorage.setItem("vizSelectedGroup", group);
  }
  setVizSelectedGroupInternal(group);
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
