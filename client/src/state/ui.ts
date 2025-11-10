import { createSignal } from "solid-js";

export const [fitWithin, setFitWithin] = createSignal<
  "fit-within" | "fit-width"
>("fit-within");

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
