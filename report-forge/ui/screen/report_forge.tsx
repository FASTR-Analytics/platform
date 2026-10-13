import {
  createEffect,
  createMemo,
  createSignal,
  type JSX,
  on,
  onCleanup,
  Show,
} from "solid-js";
import {
  buildFastrEditorSurfaceCss,
  buildFastrReportCss,
  buildReportEmbedToken,
  fastrChartPalette,
  fastrDocumentOutline,
  type FastrFencePatch,
  type FastrFigureWidth,
  fastrFigureWidthOfLine,
  fastrLayoutHints,
  fastrLogoImageIds,
  fastrLogoSrcAttr,
  type FastrOpenFence,
  fastrOpenFenceOnLine,
  fastrPageMarginPx,
  type FastrReportTemplate,
  fastrReportTemplateBody,
  type FastrReportTheme,
  fastrSheetPx,
  fastrThemeIds,
  fastrThemeTokens,
  findReportEmbeds,
  isFastrEmbedLine,
  logosSnippet,
  readFastrDocumentSettings,
  scanContainerLines,
} from "../../engine/mod.ts";
import { setReportForgeLanguage, t3 } from "../../engine/i18n.ts";
import {
  type ReportBlockContext,
  ReportBodyEditor,
  type ReportEditorApi,
} from "../editor/body_editor.tsx";
import type { ReportImage } from "../editor/embed_resolver.ts";
import {
  FM_LIVE_SCOPE_CLASS,
  type PageBoxGeometry,
} from "../editor/live_preview_extension.tsx";
import { fastrPagedFooter } from "../exports/paged_pdf.ts";
import type {
  ReportDocument,
  ReportExportHost,
} from "../exports/standalone_html.ts";
import {
  figureDarkInkForColors,
  type FigureInkTheme,
  figureLightInkForColors,
  GENERIC_LIGHT_INK,
} from "../figure_ink.ts";
import { Button, ModalHost, openMessage, openModal } from "../kit/mod.ts";
import { createReportPaginator } from "../paginator.ts";
import { isDarkGroundBehind } from "../report_html.ts";
import { HeaderRows, MenuRow } from "../toolbar_primitives.tsx";
import {
  REPORT_OUTLINE_WIDTH_PX,
  ReportDocumentOutline,
} from "./document_outline.tsx";
import { DownloadDialog } from "./download_dialog.tsx";
import { EmbedToolbarControls, type SelectedEmbed } from "./embed_controls.tsx";
import { ImagePicker } from "./image_picker.tsx";
import { LogoPicker } from "./logo_picker.tsx";
import { ReportMarkdownDiff } from "./markdown_diff.tsx";
import { ThemeModal } from "./theme_modal.tsx";
import { ReportToolbar } from "./toolbar.tsx";
import type {
  ReportForgeApi,
  ReportForgeProps,
  ReportForgeSettings,
} from "./types.ts";

type EmbedKind = "figure" | "image";
type EmbedSelection = { kind: EmbedKind; id: string };

// The editor's page box for a document's page setup, in CSS px at 96dpi:
// the printed sheet 1:1 (liveSurfaceCss sets the vars; the editor's page
// layout and pageBoxPlugin measure against them).
function pageBoxOf(
  text: string,
): { sheetPx: number; columnPx: number; geometry: PageBoxGeometry } {
  const page = readFastrDocumentSettings(text).page;
  const [w, h] = fastrSheetPx(page);
  const marginPx = fastrPageMarginPx(page.margin);
  return {
    sheetPx: w,
    columnPx: w - 2 * marginPx,
    geometry: { pageH: h, marginPx },
  };
}

// The whole editing screen, from the menu row down: menus and toolbar, the
// page-box editing surface with its outline, and the editor's own dialogs
// (theme, images, logos, download). Controlled: the host hands the document
// in and stores what comes back out (types.ts is the contract).
export function ReportForge(p: ReportForgeProps): JSX.Element {
  createEffect(() => {
    if (p.language !== undefined) setReportForgeLanguage(p.language);
  });

  const canEdit = () => p.canEdit !== false;
  const title = () => p.title ?? "";
  const theme = (): FastrReportTheme => p.settings.theme;
  const colors = () => p.settings.colors;
  const images = (): Record<string, ReportImage> => p.images ?? {};
  const figureIds = () => p.figures?.ids() ?? [];
  const hasFigure = (id: string) => figureIds().includes(id);
  const assetUrl = (imgFile: string) =>
    p.imageHost?.assetUrl(imgFile) ?? imgFile;

  // The ink a figure takes: the palette's own on a light ground, a light ink
  // where the ground behind it is dark.
  const palette = createMemo(() => {
    const tok = fastrThemeTokens(theme());
    return colors() ?? { page: tok.page, ink: tok.ink, accent: tok.accent };
  });
  const lightInk = createMemo(() => figureLightInkForColors(palette()));
  const darkInk = createMemo(() => figureDarkInkForColors(palette()));
  const figureInkFor = (el: Element): FigureInkTheme =>
    isDarkGroundBehind(el) ? (lightInk() ?? GENERIC_LIGHT_INK) : darkInk();
  // The theme's series palette for every figure the document embeds; a
  // custom palette's accent leads it.
  const chartPalette = createMemo(() => fastrChartPalette(theme(), colors()));

  // Where the caret is, structurally: pushed by the editor on cursor moves
  // and edits, and read only by the toolbar.
  const [blockContext, setBlockContext] = createSignal<
    ReportBlockContext | undefined
  >();
  // The embed whose controls the toolbar shows.
  const [selectedEmbed, setSelectedEmbedSignal] = createSignal<
    EmbedSelection | undefined
  >();
  function setSelectedEmbed(next: EmbedSelection | undefined) {
    const cur = selectedEmbed();
    if (cur?.id === next?.id && cur?.kind === next?.kind) return;
    setSelectedEmbedSignal(next);
    p.onSelectedEmbedChange?.(next);
  }

  // The `:::report{width=...}` header widens the sheet. A string memo, so
  // keystrokes anywhere else in the document never rebuild the surface sheet.
  const liveDocWidth = createMemo(() =>
    /fm-doc--(wide|full)/.exec(readFastrDocumentSettings(p.body).className)
      ?.[1] ?? "normal"
  );
  // The `:::report` fence itself, for the toolbar's Page setup control: the
  // line is invisible in the editor, so the toolbar edits it from anywhere.
  const pageSetupFence = createMemo(() => {
    for (
      const { index, text, inCode, fence } of scanContainerLines(
        p.body.split("\n"),
      )
    ) {
      if (inCode || fence?.kind !== "open" || fence.name !== "report") continue;
      return fastrOpenFenceOnLine(text, index + 1);
    }
    return undefined;
  });
  function patchPageSetup(patch: FastrFencePatch) {
    const fence = pageSetupFence();
    if (fence) editorApi?.setBlockAttrs(fence.line, patch);
    else editorApi?.insertPageSetup(patch);
  }
  // The live-preview document surface: the full theme sheet scoped to the
  // editor wrapper plus the token->CodeMirror mapping. One <style> element,
  // re-rendered on theme change. Declared AFTER the signals it reads: a memo
  // runs its computation eagerly at creation, so one placed above a signal it
  // reads is a temporal-dead-zone crash on mount.
  const liveSurfaceCss = createMemo(() => {
    // The :root prefix is LOAD-BEARING: a host may theme CodeMirror page-wide
    // with ":root .cm-editor …" selectors written to outrank CM's own theme
    // classes (activeLine tint, caret and selection colours). Those must not
    // reach into the live-preview document (the tint painted over toned
    // grounds; a dark-app caret is white and vanishes on the light sheet),
    // so every live rule matches that specificity and wins on order.
    const scope = `:root .${FM_LIVE_SCOPE_CLASS}`;
    const themed = buildFastrReportCss(theme(), colors(), scope);
    // The measure, at the IFRAME's scale (16px root) — the app's own root
    // font-size differs, and a rem-resolved measure would shear the whole
    // sheet geometry away from View. width=wide/full mirror the sheet's
    // .fm-doc--wide/full measures (74rem/100rem).
    // The column is the PRINTED page's text column, scaled to the sheet: the
    // editor shows page boxes, and the PDF's column is the sheet minus its
    // margins (report_fastr_paged.ts sets --fm-measure to the whole printable
    // width). A4 portrait at the 896px sheet: 174mm of 210mm = 742px. The
    // theme's own reading measure and the :::report width no longer apply to
    // a paginated document.
    void liveDocWidth;
    // The sheet is the printed page at 96dpi, 1:1 (794px wide for A4): the
    // column, the fonts and so the line wraps are print's own, and a page
    // box holds exactly what the printed page holds. The surface's column is
    // --fm-measure less View's two 24px bleed pads
    // (buildFastrEditorSurfaceCss), hence the 48.
    const box = pageBoxOf(p.body);
    const measurePx = `${box.columnPx + 48}px`;
    const sheetPx = `${box.sheetPx}px`;
    // Every page box in the editor is padded to the page's height
    // (pageBoxPlugin) and a cover fills it; the margins are the printed
    // page's top and bottom margins.
    const pageHPx = `${box.geometry.pageH}px`;
    const pageMarginPx = `${box.geometry.marginPx}px`;
    // Re-target the theme's own heading rules at the editor's line classes —
    // h1 underlines/centring, h2-h6 accents (Swiss's black top rule,
    // Ministry's serif colour). Margins are then neutralised by the trailing
    // rule — a .cm-line may carry borders and padding but never margins.
    const escaped = scope.replaceAll(".", "\\.");
    const retargeted = (themed.match(/[^{}]+\{[^}]*\}/g) ?? [])
      .map((rule) => {
        let out = rule;
        for (let n = 1; n <= 6; n++) {
          out = out.replace(
            new RegExp(`(^|,)(\\s*)${escaped} h${n}(?=\\s*[,{])`, "gm"),
            `$1$2${scope} .cm-fm-h${n}`,
          );
        }
        // Blockquote styling (border, muted ink, padding) applies per line —
        // contiguous quote lines stack into a continuous bar.
        out = out.replace(
          new RegExp(`(^|,)(\\s*)${escaped} blockquote(?=\\s*[,{])`, "gm"),
          `$1$2${scope} .cm-fm-bq`,
        );
        // A table continued on the next page repeats its header rows there
        // as print does (applyRegionPagination): the theme's header cell
        // rules reach the repeated rows too.
        out = out.replace(
          new RegExp(`(^|,)(\\s*)${escaped} thead th(?=\\s*[,{])`, "gm"),
          `$1$2${scope} thead th, ${scope} tr.fm-page-gutter-repeat > th`,
        );
        // Only rules a replacement actually changed belong in the extra
        // sheet; copying the rest would re-fight the cascade.
        return out === rule ? "" : out;
      })
      .filter((rule) => rule.length > 0)
      .join("\n");
    return [
      themed,
      // After `themed`, whose vars block also sets --fm-measure.
      `${scope} { --fm-measure: ${measurePx}; --fm-sheet: ${sheetPx}; --fm-page-h: ${pageHPx}; --fm-page-margin: ${pageMarginPx}; --fm-page-area: calc(${pageHPx} - 2 * ${pageMarginPx}); }`,
      buildFastrEditorSurfaceCss(scope),
      retargeted,
      `${scope} .cm-line.cm-fm-h1, ${scope} .cm-line.cm-fm-h2, ${scope} .cm-line.cm-fm-h3,
${scope} .cm-line.cm-fm-h4, ${scope} .cm-line.cm-fm-h5, ${scope} .cm-line.cm-fm-h6, ${scope} .cm-line.cm-fm-bq {
  margin: 0 !important; width: auto !important; text-decoration: none;
}
${scope} .cm-fm-h1 *, ${scope} .cm-fm-h2 *, ${scope} .cm-fm-h3 * { text-decoration: none !important; }
${scope} .cm-fm-h1 .fm-mark--u, ${scope} .cm-fm-h2 .fm-mark--u, ${scope} .cm-fm-h3 .fm-mark--u { text-decoration: underline !important; }`,
    ].join("\n");
  });

  let editorApi: ReportEditorApi | undefined;

  // ── Pages ──────────────────────────────────────────────────────────────────
  // The live preview draws page SEAMS where the pages start (the paginator
  // lays the SAME paged document the PDF is printed from out in a hidden
  // frame, paginator.ts).
  // The boxes the layout frame gives embeds: a figure's raster box (the
  // host's) and an image's natural size, cached here; a size landing re-runs
  // the layout. Never the editor's own DOM, which only holds what is
  // scrolled into view.
  const [sizeTick, setSizeTick] = createSignal(0);
  const imageSizes = new Map<
    string,
    { width: number; height: number } | null
  >();
  const imageSize = (id: string) => {
    const entry = images()[id];
    if (!entry) return undefined;
    const hit = imageSizes.get(entry.imgFile);
    if (hit) return hit;
    if (hit === undefined) {
      imageSizes.set(entry.imgFile, null);
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          imageSizes.set(entry.imgFile, {
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
          setSizeTick((t) => t + 1);
        }
      };
      img.src = assetUrl(entry.imgFile);
    }
    return undefined;
  };
  const figureSize = (id: string) =>
    hasFigure(id) ? p.figures?.size?.(id) : undefined;

  const currentDocument = (): ReportDocument => ({
    title: title(),
    body: p.body,
    theme: theme(),
    colors: colors(),
    images: images(),
    figureIds: figureIds(),
  });
  const exportHost = (): ReportExportHost => ({
    assetUrl,
    rasterizeFigure: p.figures?.rasterize,
  });

  // The background layout of the whole document at the print column: its
  // block heights, by source text, are the editor's estimates for blocks it
  // has not rendered (the editor lays the pages out itself).
  const paginator = createReportPaginator({
    document: currentDocument,
    footer: () => fastrPagedFooter(title()),
    figureSize,
    imageSize,
    onResult: (result, bodyUsed) => {
      if (result === undefined) return;
      editorApi?.setLayoutHints(fastrLayoutHints(result, bodyUsed));
    },
  });
  const emptyPagination = () => ({
    result: {
      total: 0,
      sheet: {
        width: pageBoxOf(p.body).sheetPx,
        height: pageBoxOf(p.body).geometry.pageH,
      },
      pages: [],
      splits: [],
    },
    title: title(),
    fillers: new Map<number, number>(),
  });
  onCleanup(() => paginator.dispose());
  // Typing, and an embed's size landing: after the debounce. Everything that
  // re-lays the whole document (theme, palette, title): now.
  createEffect(
    on([() => p.body, figureIds, images, sizeTick], () => paginator.request(), {
      defer: true,
    }),
  );
  // A size landing: the rendered embeds waiting for it take their box now,
  // not after the paginator's debounce.
  createEffect(
    on(sizeTick, () => editorApi?.refreshEmbedSizes(), { defer: true }),
  );
  createEffect(on([theme, colors, title], () => {
    editorApi?.setPagination(emptyPagination());
    paginator.requestNow();
  }));

  // ── Outline ────────────────────────────────────────────────────────────────
  // The headings the document's own contents block would list, re-derived per
  // edit but only re-rendered when one changes, and the line being read
  // (probed a little below the viewport top, so a heading just jumped to
  // counts as in view).
  const outlineItems = createMemo(
    () => fastrDocumentOutline(p.body),
    [],
    {
      equals: (a, b) =>
        a.length === b.length &&
        a.every((it, i) =>
          it.line === b[i].line && it.level === b[i].level &&
          it.text === b[i].text
        ),
    },
  );
  const [outlineViewLine, setOutlineViewLine] = createSignal<number>();
  const [ownOutlineClosed, setOwnOutlineClosed] = createSignal(false);
  const outlineClosed = () => p.outlineClosed ?? ownOutlineClosed();
  function setOutlineClosed(closed: boolean) {
    setOwnOutlineClosed(closed);
    p.onOutlineClosedChange?.(closed);
  }
  // The sidebar floats over the ground beside the centred page, Google Docs
  // style, and pushes the page right only by as much as it would otherwise
  // overlap it (a narrow window), never more than its own width. With pad x
  // the page's left edge sits at x + (row - x - sheet) / 2; keeping that
  // clear of the sidebar plus a gap solves to the clamp below.
  const [editorRowWidth, setEditorRowWidth] = createSignal(0);
  const outlineSheetPx = createMemo(() => pageBoxOf(p.body).sheetPx);
  const outlinePagePad = () => {
    if (outlineClosed()) return 0;
    const clearance = REPORT_OUTLINE_WIDTH_PX + 16;
    const need = 2 * clearance + outlineSheetPx() - editorRowWidth();
    return Math.min(REPORT_OUTLINE_WIDTH_PX, Math.max(0, need));
  };
  function readOutlineViewLine() {
    setOutlineViewLine(editorApi?.getLineAt(96));
  }
  createEffect(() => {
    outlineItems();
    if (!outlineClosed()) requestAnimationFrame(readOutlineViewLine);
  });

  // ── The selected embed ─────────────────────────────────────────────────────
  // Caption for an embed = its token's caption/alt (first occurrence).
  function captionForId(kind: EmbedKind, id: string): string {
    return (
      findReportEmbeds(p.body).find((r) => r.kind === kind && r.id === id)
        ?.caption ?? ""
    );
  }
  // A figure's width, read off its line's `{…}` block (first occurrence);
  // undefined where a width means nothing (an embed inline in a paragraph,
  // which is not a figure).
  function widthForId(
    kind: EmbedKind,
    id: string,
  ): FastrFigureWidth | undefined {
    const src = p.body;
    const ref = findReportEmbeds(src).find(
      (r) => r.kind === kind && r.id === id,
    );
    if (!ref) return undefined;
    const from = src.lastIndexOf("\n", ref.start - 1) + 1;
    const nl = src.indexOf("\n", ref.end);
    const line = src.slice(from, nl === -1 ? src.length : nl);
    return isFastrEmbedLine(line) ? fastrFigureWidthOfLine(line) : undefined;
  }
  const selectedEmbedDetail = createMemo<SelectedEmbed | undefined>(() => {
    const sel = selectedEmbed();
    if (!sel) return undefined;
    if (sel.kind === "figure") {
      if (!hasFigure(sel.id)) return undefined;
      return {
        kind: "figure",
        id: sel.id,
        caption: captionForId("figure", sel.id),
        width: widthForId("figure", sel.id),
      };
    }
    const ib = images()[sel.id];
    if (!ib) return undefined;
    return {
      kind: "image",
      id: sel.id,
      caption: captionForId("image", sel.id),
      width: widthForId("image", sel.id),
      imgFile: ib.imgFile,
    };
  });

  // ── Edits from outside the keyboard ────────────────────────────────────────
  // True while the editor applies a body the user did not type, so the
  // host's onBodyChange can tell the two apart.
  let programmatic = false;

  // Apply a new body REBASED over anything that changed since `baseBody` was
  // read, so a collaborator's concurrent edits survive; hunks that collide
  // with a concurrent edit are skipped and returned.
  async function applyBody(baseBody: string, newBody: string) {
    // Never dispatch into a view mid-update (see ReportEditorApi.whenIdle).
    await editorApi?.whenIdle();
    programmatic = true;
    const res = editorApi?.applyRebasedBody(baseBody, newBody) ?? {
      applied: 0,
      skipped: [],
      firstAppliedLine: undefined,
    };
    programmatic = false;
    editorApi?.refresh();
    // Scroll to the first APPLIED change so the edit lands on screen
    // (deferred: let layout settle first). Absent when nothing applied.
    const changedLine = res.firstAppliedLine;
    if (changedLine !== undefined) {
      queueMicrotask(() =>
        requestAnimationFrame(() => editorApi?.scrollToLine(changedLine))
      );
    }
    return { skipped: res.skipped };
  }

  async function saveImages(next: Record<string, ReportImage>) {
    await p.onImagesChange?.(next);
  }

  async function saveSettings(next: ReportForgeSettings): Promise<boolean> {
    try {
      await p.onSettingsChange(next);
      return true;
    } catch (e) {
      await openMessage({
        text: e instanceof Error ? e.message : String(e),
        intent: "danger",
      });
      return false;
    }
  }

  // ── Theme and template ─────────────────────────────────────────────────────
  function changeTheme(next: FastrReportTheme) {
    if (next === theme()) return;
    void saveSettings({ ...p.settings, theme: next });
  }

  // Whether the body is still what a new document is created with, a title
  // line alone (whatever the title now says) or nothing: the only state a
  // template may replace.
  function bodyIsSeed(): boolean {
    const text = p.body.trim();
    return text.length === 0 || /^#\s[^\n]*$/.test(text);
  }

  // Step 2 of the theme modal picked a template: its body goes in through
  // the editor (one transaction, so collaborators and undo see it like any
  // edit) and the choice is stored in the settings.
  async function applyTemplate(chosen: FastrReportTemplate): Promise<void> {
    // Someone may have started writing while the gallery was open.
    if (!bodyIsSeed()) return;
    const next = fastrReportTemplateBody(chosen, title());
    await applyBody(p.body, next);
    await saveSettings({ ...p.settings, template: chosen });
  }

  // The document's look, from inside the document. A host's palette editor
  // is its own dialog, so `editPalette` closes the picker, runs the editor,
  // and loops back.
  async function openThemeModal(): Promise<void> {
    for (;;) {
      const res = await openModal({
        element: ThemeModal,
        props: {
          documentTitle: title(),
          themes: fastrThemeIds(),
          theme: theme(),
          paletteId: p.settings.paletteId,
          listPalettes: p.palettes?.list,
          canEditPalettes: p.palettes?.edit !== undefined,
          // A document still holding only its title: the template gallery
          // is the modal's step 2.
          offerTemplates: bodyIsSeed() && canEdit(),
          apply: async (choice) => {
            // Answering the picker is what retires it, whichever look was
            // picked. Rejections surface in the modal.
            await p.onSettingsChange({
              ...p.settings,
              theme: choice.theme,
              paletteId: choice.palette?.id,
              colors: choice.palette?.colors ?? undefined,
              themeChosen: true,
            });
          },
        },
      });
      if (!res) return;
      if ("editPalette" in res) {
        await p.palettes?.edit?.(res.editPalette);
        continue;
      }
      if (res.template !== undefined) await applyTemplate(res.template);
      return;
    }
  }
  // A document nobody has chosen a look for yet: ask now, once. Editors
  // only: a reader cannot answer it.
  let themeOffered = false;
  createEffect(() => {
    if (themeOffered || p.settings.themeChosen !== false || !canEdit()) return;
    themeOffered = true;
    void openThemeModal();
  });

  // What the Page menu's Document details panel shows. Cheap enough to
  // recompute on demand.
  const documentStats = () => {
    const text = p.body;
    const words = text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/^:::.*$/gm, " ")
      .replace(/[#*_>`|\[\]{}]/g, " ")
      .split(/\s+/)
      .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    return {
      words,
      headings: fastrDocumentOutline(text, 6).length,
      figures: figureIds().length,
      images: Object.keys(images()).length,
      lastSaved: p.lastSaved ?? "",
    };
  };

  // ── Images, logos, figures ─────────────────────────────────────────────────
  async function pickImage(): Promise<
    { imgFile: string; alt: string } | undefined
  > {
    const host = p.imageHost;
    if (!host) return undefined;
    if (host.pick) return await host.pick();
    return await openModal({ element: ImagePicker, props: { host } });
  }

  // Register a picked image like any other, so a host's prune keeps it, and
  // hand its id back.
  async function registerImage(imgFile: string): Promise<string> {
    const id = crypto.randomUUID();
    await saveImages({ ...images(), [id]: { type: "image", imgFile } });
    return id;
  }

  // The page ground as an IMAGE: pick (or upload) one and hand the id back
  // for the fence.
  async function pickPageImage(): Promise<string | undefined> {
    const picked = await pickImage();
    return picked ? await registerImage(picked.imgFile) : undefined;
  }

  async function insertImage() {
    const picked = await pickImage();
    if (!picked) return;
    const id = await registerImage(picked.imgFile);
    editorApi?.insertBlockOnNewLine(
      buildReportEmbedToken("image", id, picked.alt),
    );
    setSelectedEmbed({ kind: "image", id });
  }

  async function insertFigure() {
    const made = await p.figures?.insert?.();
    if (!made) return;
    editorApi?.insertBlockOnNewLine(
      buildReportEmbedToken("figure", made.id, made.caption),
    );
    setSelectedEmbed({ kind: "figure", id: made.id });
  }

  // A logos row's logos are image records like any other image, so the
  // editor and every export resolve them one way. An edit keeps the id of a
  // logo the row already had.
  async function registerLogos(
    files: string[],
    reuse: string[] = [],
  ): Promise<string[]> {
    const current = images();
    const next = { ...current };
    const free = reuse.filter((id) => current[id] !== undefined);
    const ids = files.map((file) => {
      const k = free.findIndex((id) => current[id].imgFile === file);
      if (k >= 0) return free.splice(k, 1)[0];
      const id = crypto.randomUUID();
      next[id] = { type: "image", imgFile: file };
      return id;
    });
    if (Object.keys(next).length !== Object.keys(current).length) {
      await saveImages(next);
    }
    return ids;
  }

  async function insertLogos() {
    const host = p.imageHost;
    if (!host) return;
    const files = await openModal({
      element: LogoPicker,
      props: { host, initial: [], editing: false },
    });
    if (!files || files.length === 0) return;
    const ids = await registerLogos(files);
    editorApi?.insertBlockOnNewLine(logosSnippet(ids));
  }

  async function editLogos(fence: FastrOpenFence) {
    const host = p.imageHost;
    if (!host || !canEdit()) return;
    const had = fastrLogoImageIds(fence.attrs);
    const files = await openModal({
      element: LogoPicker,
      props: {
        host,
        initial: had.map((id) => images()[id]?.imgFile).filter(
          (f): f is string => f !== undefined,
        ),
        editing: true,
      },
    });
    if (!files || files.length === 0) return;
    const ids = await registerLogos(files, had);
    editorApi?.setBlockAttrs(fence.line, { src: fastrLogoSrcAttr(ids) });
  }

  function handleUpdateCaption(id: string, caption: string) {
    const sel = selectedEmbed();
    if (!sel) return;
    editorApi?.setEmbedCaption(sel.kind, id, caption);
  }

  function handleSetEmbedWidth(width: FastrFigureWidth) {
    const sel = selectedEmbed();
    if (!sel) return;
    editorApi?.setEmbedWidth(sel.kind, sel.id, width);
  }

  async function handleChangeImageFile(id: string, imgFile: string) {
    const ib = images()[id];
    if (!ib) return;
    await saveImages({ ...images(), [id]: { ...ib, imgFile } });
  }

  function handleDelete() {
    const sel = selectedEmbed();
    if (!sel) return;
    // Remove only the body token; the record stays for the session so undo
    // restores a working embed (not "Missing image"). A host prunes records
    // the body no longer names when it sees fit.
    editorApi?.removeEmbedToken(sel.kind, sel.id);
    setSelectedEmbed(undefined);
  }

  function openDownload() {
    void openModal({
      element: DownloadDialog,
      props: {
        document: currentDocument,
        host: exportHost(),
        pageLayout: () => editorApi?.getPageLayout(),
        renderPdf: p.renderPdf,
      },
    });
  }

  // ── The handle a host holds ────────────────────────────────────────────────
  const api: ReportForgeApi = {
    getSelection: () => editorApi?.getSelection(),
    proposeEdit: async (proposal) => {
      const baseBody = p.body;
      const accepted = await openModal({
        element: ReportMarkdownDiff,
        props: {
          oldText: baseBody,
          newText: proposal.newBody,
          summary: proposal.summary,
          signal: proposal.signal,
        },
      });
      if (accepted !== true) return { accepted: false };
      const { skipped } = await applyBody(baseBody, proposal.newBody);
      return { accepted: true, skipped };
    },
    applyBody,
    insertBlock: (text) => editorApi?.insertBlockOnNewLine(text),
    getPageLayout: () => editorApi?.getPageLayout(),
    refreshEmbedSizes: () => setSizeTick((t) => t + 1),
    selectEmbed: setSelectedEmbed,
    selectedEmbed,
    openDownload,
    openThemePicker: () => void openThemeModal(),
    scrollToLine: (line) => editorApi?.scrollToLine(line),
    undo: () => editorApi?.undo(),
    redo: () => editorApi?.redo(),
  };
  p.ref?.(api);

  // The menu row sits above the toolbar's pill; the toolbar portals its
  // menus into it.
  const [menuRowHost, setMenuRowHost] = createSignal<HTMLDivElement>();

  return (
    <div class="rf-root rf:flex rf:h-full rf:w-full rf:flex-col">
      <Show when={canEdit()}>
        <HeaderRows>
          <MenuRow
            tour="report-menu-row"
            ref={(el) => {
              setMenuRowHost(el);
              onCleanup(() => setMenuRowHost(undefined));
            }}
          />
          <ReportToolbar
            menuRowHost={menuRowHost()}
            api={() => editorApi}
            onDownload={openDownload}
            fileMenuItems={() =>
              (p.menuItems ?? []).filter((item) => item.menu === "file")}
            menuTrailing={p.menuTrailing}
            context={blockContext}
            theme={theme}
            colors={colors}
            pageSetup={pageSetupFence}
            onPatchPageSetup={patchPageSetup}
            onSelectTheme={changeTheme}
            onOpenThemeModal={() => void openThemeModal()}
            onPickPageImage={pickPageImage}
            documentStats={documentStats}
            embedKind={() => selectedEmbed()?.kind}
            embedControls={
              <EmbedToolbarControls
                embed={selectedEmbedDetail()}
                canConfigure={canEdit()}
                imageHost={p.imageHost}
                figureControls={p.figures?.controls}
                onUpdateCaption={handleUpdateCaption}
                onSetWidth={handleSetEmbedWidth}
                onChangeImageFile={(id, file) =>
                  void handleChangeImageFile(id, file)}
                onDelete={handleDelete}
              />
            }
            canInsertFigure={() => p.figures?.insert !== undefined}
            canInsertImage={() => p.imageHost !== undefined}
            onInsertFigure={() => void insertFigure()}
            onInsertImage={() => void insertImage()}
            onInsertLogos={() => void insertLogos()}
            onEditLogos={(fence) => void editLogos(fence)}
          />
        </HeaderRows>
      </Show>
      <div class="rf:flex rf:min-h-0 rf:flex-1">
        <div
          class="rf:bg-base-200 rf:flex rf:h-full rf:min-w-0 rf:flex-1 rf:flex-col"
          // A press anywhere in the document but on an embed ends the embed
          // selection, so the toolbar returns to the text controls. On the
          // press and in the CAPTURE phase: the in-place editors (islands,
          // block titles, stat pieces) stop their clicks from bubbling, so a
          // click handler here never heard a press on another widget. A
          // press on an embed passes, and its own click selects it.
          ref={(el) =>
            el.addEventListener(
              "pointerdown",
              (e) => {
                const t = e.target as Element | null;
                if (t?.closest?.("[data-embed-id]")) return;
                setSelectedEmbed(undefined);
              },
              true,
            )}
        >
          {p.banner}
          <div
            class="rf:relative rf:flex rf:min-h-0 rf:flex-1"
            ref={(el) => {
              const ro = new ResizeObserver(() =>
                setEditorRowWidth(el.clientWidth)
              );
              ro.observe(el);
              onCleanup(() => ro.disconnect());
            }}
          >
            <Show
              when={!outlineClosed()}
              fallback={
                <div class="rf:absolute rf:top-2 rf:left-2 rf:z-10">
                  <Button
                    ghost
                    size="sm"
                    iconName="chevronRight"
                    iconPosition="right"
                    onClick={() => setOutlineClosed(false)}
                  >
                    {t3({
                      en: "Report tabs",
                      fr: "Onglets du rapport",
                      pt: "Separadores do relatório",
                    })}
                  </Button>
                </div>
              }
            >
              <div class="rf:absolute rf:inset-y-0 rf:left-0 rf:z-10">
                <ReportDocumentOutline
                  items={outlineItems()}
                  viewLine={outlineViewLine()}
                  onSelect={(line) => editorApi?.goToLine(line)}
                  onClose={() => setOutlineClosed(true)}
                />
              </div>
            </Show>
            <div
              class="rf:min-h-0 rf:flex-1"
              data-report-cursor="code-pane"
              data-tour="report-code-pane"
              style={{ "padding-left": `${outlinePagePad()}px` }}
            >
              {
                /* The theme sheet, scoped to the editor wrapper, so widgets
                  AND the editor's own text carry the document's design. A
                  theme switch re-renders this one element; the editor is
                  never touched. The font import leads the sheet (an @import
                  after other rules is dropped by CSS). */
              }
              <style>{liveSurfaceCss()}</style>
              <ReportBodyEditor
                body={p.body}
                hasFigure={hasFigure}
                FigureView={p.figures?.View}
                images={images()}
                figureInkFor={figureInkFor}
                figureChartPalette={chartPalette}
                figureSize={figureSize}
                imageSize={imageSize}
                assetUrl={assetUrl}
                onBodyChange={(next) =>
                  p.onBodyChange(next, programmatic ? "program" : "user")}
                onSelectEmbed={(kind, id) => setSelectedEmbed({ kind, id })}
                onEditLogos={(fence) => void editLogos(fence)}
                selectedId={() => selectedEmbed()?.id}
                onScroll={readOutlineViewLine}
                centered={() => true}
                collab={() => p.collab}
                canEdit={canEdit}
                onContextChange={setBlockContext}
                ref={(e) => {
                  editorApi = e;
                  // The page-box effect above can run before the editor
                  // mounts (first open): ask again now that it is here.
                  e.setPagination(emptyPagination());
                }}
              />
            </div>
          </div>
        </div>
        {p.dockedPanel}
      </div>
      <ModalHost />
    </div>
  );
}
