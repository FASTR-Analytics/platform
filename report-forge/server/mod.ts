// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// The server half of Report Forge, for Deno: the headless-Chrome printer
// behind the PDF download. Mount `render` behind a route of your own; the
// editor's `renderPdf` input posts the paged document to it.
//
//   const printer = createReportPdfRenderer({ chromePath });
//   app.post("/render-pdf", async (c) => {
//     const { pdf } = await printer.render(await c.req.text());
//     return new Response(pdf, { headers: { "content-type": "application/pdf" } });
//   });

export {
  createReportPdfRenderer,
  type RenderedReportPdf,
  type ReportPdfRenderer,
} from "./renderer.ts";
export {
  launchChrome,
  type PagedRender,
  type PagedRenderOptions,
  printPagedDocument,
} from "./paged_chrome.ts";
