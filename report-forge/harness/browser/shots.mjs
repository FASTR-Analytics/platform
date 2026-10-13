// Browser parity, step 1: drive the playground through a fixed set of
// scenarios and record, for each, a screenshot and the numbers that matter
// (where the pages break, where every block sits, the toolbar's geometry).
//
//   cd playground && npm run dev          (leave it running)
//   node ../harness/browser/shots.mjs <outDir> [baseUrl] [scenario]
//
// then compare.mjs against the committed baseline or an earlier run. Needs a
// Chrome: CHROME_PATH, or a browser Playwright has already downloaded.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  path.resolve(here, "..", "..", "playground", "package.json"),
);
const { chromium } = require("playwright-core");

const [outDir, base = "http://localhost:3210/", only] = process.argv.slice(2);
if (!outDir) {
  console.error("usage: shots.mjs <outDir> [baseUrl] [scenario]");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(process.env.HOME ?? "", ".cache", "ms-playwright");
  if (!fs.existsSync(cache)) return undefined;
  for (const dir of fs.readdirSync(cache).sort().reverse()) {
    for (
      const rel of [
        "chrome-headless-shell-linux64/chrome-headless-shell",
        "chrome-linux64/chrome",
        "chrome-linux/chrome",
      ]
    ) {
      const p = path.join(cache, dir, rel);
      if (fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

// Runs in the page: everything layout-shaped, rounded to 1/100 px.
const metrics = () => {
  const sc = document.querySelector(".cm-scroller");
  const round = (n) => Math.round(n * 100) / 100;
  const top = (el) =>
    round(
      el.getBoundingClientRect().top - sc.getBoundingClientRect().top +
        sc.scrollTop,
    );
  const box = (el) => {
    const r = el?.getBoundingClientRect();
    return r ? [r.left, r.top, r.width, r.height].map(round) : null;
  };
  const layout = window.__forge?.getPageLayout?.();
  return {
    pageStarts: layout?.pageStarts ?? null,
    paraSplits: layout?.paraSplits ?? null,
    scrollHeight: sc?.scrollHeight ?? null,
    seams: [
      ...document.querySelectorAll(
        ".cm-fm-page-end, .fm-page-gutter, .cm-fm-page-head",
      ),
    ].map((e) => `${e.className.split(" ")[0]}@${top(e)}`).slice(0, 80),
    regions: [...document.querySelectorAll(".fm-live-region")].slice(0, 60)
      .map((e) => `${top(e)}:${round(e.getBoundingClientRect().height)}`),
    menuRow: box(document.querySelector('[data-tour="report-menu-row"]')),
    toolbar: box(document.querySelector('[data-tour="report-format-toolbar"]')),
    toolButtons: [
      ...document.querySelectorAll(
        '[data-tour="report-format-toolbar"] button',
      ),
    ].map((b) => {
      const r = b.getBoundingClientRect();
      const name = (b.getAttribute("title") ?? b.textContent ?? "").slice(
        0,
        18,
      );
      return `${name}@${round(r.left)},${round(r.top)},${round(r.width)}x${
        round(r.height)
      }`;
    }),
    dialog: box(document.querySelector(".rf-modal")),
    menu: box(document.querySelector(".rf-menu")),
  };
};

const menu = (name) => async (page) => {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(500);
};
const scrollTo = (y) => async (page) => {
  await page.evaluate((v) => {
    document.querySelector(".cm-scroller").scrollTop = v;
  }, y);
  await page.waitForTimeout(1500);
};

const scenarios = [
  { name: "sink_top", q: "?doc=sink" },
  { name: "sink_scrolled", q: "?doc=sink", steps: scrollTo(1500) },
  { name: "sink_ministry", q: "?doc=sink&theme=ministry" },
  { name: "sink_bauhaus", q: "?doc=sink&theme=bauhaus" },
  {
    name: "sections_caret",
    q: "?doc=sections",
    steps: async (page) => {
      await page.locator(".cm-content .cm-line").nth(4).click({
        position: { x: 60, y: 8 },
      });
      await page.waitForTimeout(600);
    },
  },
  { name: "sections_scrolled", q: "?doc=sections", steps: scrollTo(2400) },
  { name: "menu_file", q: "?doc=sections", steps: menu("File") },
  { name: "menu_widgets", q: "?doc=sections", steps: menu("Widgets") },
  { name: "menu_figures", q: "?doc=sections", steps: menu("Figures") },
  { name: "menu_page", q: "?doc=sections", steps: menu("Page") },
  {
    name: "dialog_download",
    q: "?doc=sections",
    steps: async (page) => {
      await menu("File")(page);
      await page.getByText("Download…", { exact: true }).click();
      await page.waitForTimeout(800);
    },
  },
  {
    name: "dialog_theme",
    q: "?doc=sections",
    steps: async (page) => {
      await menu("Page")(page);
      await page.getByText("Theme", { exact: true }).hover();
      await page.waitForTimeout(300);
      await page.getByText(/All themes/).first().click();
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "context_menu",
    q: "?doc=sink",
    steps: async (page) => {
      await scrollTo(1250)(page);
      await page.locator(".fm-stat").first().click({ button: "right" });
      await page.waitForTimeout(600);
    },
  },
  { name: "reader", q: "?doc=sections&reader=1" },
];

const executablePath = chromePath();
if (!executablePath) {
  console.error("No Chrome found: set CHROME_PATH.");
  process.exit(2);
}
const browser = await chromium.launch({
  executablePath,
  args: ["--no-sandbox", "--disable-gpu"],
});
const out = {};
for (const sc of scenarios) {
  if (only && sc.name !== only) continue;
  const page = await browser.newPage({
    viewport: { width: 1400, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + sc.q, { waitUntil: "load" });
  await page.waitForSelector(".cm-content", { timeout: 20000 });
  // The page layout settles after the fonts load and the layout frame runs.
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(7000);
  try {
    await sc.steps?.(page);
  } catch (e) {
    errors.push("step: " + String(e.message).split("\n")[0]);
  }
  await page.screenshot({ path: path.join(outDir, `${sc.name}.png`) });
  out[sc.name] = { metrics: await page.evaluate(metrics), errors };
  await page.close();
}
await browser.close();
fs.writeFileSync(
  path.join(outDir, "metrics.json"),
  JSON.stringify(out, null, 1) + "\n",
);
let failed = 0;
for (const [name, v] of Object.entries(out)) {
  if (v.errors.length > 0) failed++;
  console.log(
    `${v.errors.length === 0 ? "ok  " : "FAIL"} ${name}${
      v.errors.length ? ": " + v.errors[0] : ""
    }`,
  );
}
process.exit(failed ? 1 : 0);
