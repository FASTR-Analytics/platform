// Measurement for the parity harness: with ?probe in the URL, the computed
// styles of everything under a [data-p] marker are written to <pre id="out">
// as JSON, where a headless browser reads them back (harness/).

const PROPS = [
  "display",
  "position",
  "boxSizing",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderTopColor",
  "borderBottomColor",
  "borderTopLeftRadius",
  "backgroundColor",
  "color",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "gap",
  "alignItems",
  "justifyContent",
  "flexDirection",
  "flexWrap",
  "flexGrow",
  "flexShrink",
  "boxShadow",
  "opacity",
  "cursor",
  "overflow",
  "overflowY",
  "textTransform",
  "whiteSpace",
  "zIndex",
  "gridTemplateColumns",
  "userSelect",
  "pointerEvents",
  "verticalAlign",
  "stroke",
  "strokeWidth",
  "fill",
] as const;

type Described = {
  tag: string;
  cls: string;
  text: string;
  rect: [number, number, number, number];
  style: Record<string, string>;
  children: Described[];
};

function describe(el: Element, origin: DOMRect, depth: number): Described {
  const cs = getComputedStyle(el) as unknown as Record<string, string>;
  const style: Record<string, string> = {};
  for (const k of PROPS) style[k] = cs[k];
  const r = el.getBoundingClientRect();
  const round = (n: number) => Math.round(n * 100) / 100;
  const isSvg = el.tagName.toLowerCase() === "svg";
  return {
    tag: el.tagName.toLowerCase(),
    cls: el.getAttribute("class") ?? "",
    text: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) =>
      n.textContent
    ).join("").trim().slice(0, 60),
    rect: [
      round(r.left - origin.left),
      round(r.top - origin.top),
      round(r.width),
      round(r.height),
    ],
    style,
    children: isSvg || depth > 8
      ? []
      : [...el.children].map((c) => describe(c, origin, depth + 1)),
  };
}

export async function runProbe(): Promise<void> {
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 500));
  const out: Record<string, Described[]> = {};
  for (const el of document.querySelectorAll("[data-p]")) {
    const origin = el.getBoundingClientRect();
    out[el.getAttribute("data-p")!] = [...el.children].map((c) =>
      describe(c, origin, 0)
    );
  }
  const pre = document.createElement("pre");
  pre.id = "out";
  pre.textContent = "PROBE_JSON_START" + JSON.stringify(out) + "PROBE_JSON_END";
  document.body.append(pre);
}
