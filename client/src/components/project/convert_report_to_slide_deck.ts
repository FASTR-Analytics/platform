import type { LayoutNode } from "panther";
import type {
  APIResponseWithData,
  ContentBlock,
  CoverSlide,
  FigureBlock,
  ReplicantValueOverride,
  ReportItemConfig,
  ReportItemContentItem,
  SectionSlide,
  Slide,
  ContentSlide,
} from "lib";
import { serverActions } from "~/server_actions";
import {
  getPODetailFromCacheorFetch,
  getPOFigureInputsFromCacheOrFetch,
} from "~/state/po_cache";

type OnProgress = (fraction: number, msg: string) => void;

async function mapLayoutNodeAsync<A, B>(
  node: LayoutNode<A>,
  fn: (item: A) => Promise<B>,
): Promise<LayoutNode<B>> {
  if (node.type === "item") {
    return {
      type: "item",
      id: node.id,
      data: await fn(node.data),
      span: node.span,
    };
  }
  return {
    type: node.type,
    id: node.id,
    children: Array.isArray(node.children)
      ? await Promise.all(
          node.children.map((child) => mapLayoutNodeAsync(child, fn)),
        )
      : [],
    span: node.span,
  };
}

async function convertContentItem(
  projectId: string,
  item: ReportItemContentItem,
): Promise<ContentBlock> {
  switch (item.type) {
    case "text":
      return {
        type: "text",
        markdown: item.markdown ?? "",
        style: {
          textSize: item.textSize,
          textBackground: item.textBackground,
        },
      };

    case "figure": {
      const poInfo = item.presentationObjectInReportInfo;
      if (!poInfo?.id) {
        return { type: "figure" } as FigureBlock;
      }
      try {
        const override: ReplicantValueOverride = {
          selectedReplicantValue: poInfo.selectedReplicantValue || undefined,
          additionalScale: item.useFigureAdditionalScale
            ? (item.figureAdditionalScale ?? 1)
            : undefined,
          hideFigureCaption: item.hideFigureCaption,
          hideFigureSubCaption: item.hideFigureSubCaption,
          hideFigureFootnote: item.hideFigureFootnote,
        };

        const poDetailRes = await getPODetailFromCacheorFetch(projectId, poInfo.id);
        if (!poDetailRes.success) {
          return { type: "figure" } as FigureBlock;
        }

        const figureInputsRes = await getPOFigureInputsFromCacheOrFetch(
          projectId,
          poInfo.id,
          override,
        );
        if (!figureInputsRes.success) {
          return { type: "figure" } as FigureBlock;
        }

        return {
          type: "figure",
          figureInputs: figureInputsRes.data,
          source: {
            type: "from_data",
            metricId: poDetailRes.data.resultsValue.id,
            config: poDetailRes.data.config,
            snapshotAt: new Date().toISOString(),
          },
        };
      } catch {
        return { type: "figure" } as FigureBlock;
      }
    }

    case "image":
      return {
        type: "image",
        imgFile: item.imgFile ?? "",
        style: {
          imgFit: item.imgFit === "cover" ? "cover" : "contain",
        },
      };

    default:
      console.warn("[convert] Unknown content item type:", (item as any).type, item);
      return { type: "text", markdown: "" };
  }
}

function convertCover(config: ReportItemConfig): CoverSlide {
  return {
    type: "cover",
    title: config.cover.titleText ?? "",
    subtitle: config.cover.subTitleText,
    presenter: config.cover.presenterText,
    date: config.cover.dateText,
    logos: config.cover.logos,
    titleTextRelFontSize: config.cover.titleTextRelFontSize,
    subTitleTextRelFontSize: config.cover.subTitleTextRelFontSize,
    presenterTextRelFontSize: config.cover.presenterTextRelFontSize,
    dateTextRelFontSize: config.cover.dateTextRelFontSize,
  };
}

function convertSection(config: ReportItemConfig): SectionSlide {
  return {
    type: "section",
    sectionTitle: config.section.sectionText ?? "",
    sectionSubtitle: config.section.smallerSectionText,
    sectionTextRelFontSize: config.section.sectionTextRelFontSize,
    smallerSectionTextRelFontSize:
      config.section.smallerSectionTextRelFontSize,
  };
}

async function convertFreeform(
  projectId: string,
  config: ReportItemConfig,
): Promise<ContentSlide> {
  const layout = await mapLayoutNodeAsync(
    config.freeform.content,
    (item) => convertContentItem(projectId, item),
  );
  return {
    type: "content",
    header: config.freeform.useHeader ? config.freeform.headerText : undefined,
    subHeader: config.freeform.useHeader
      ? config.freeform.subHeaderText
      : undefined,
    date: config.freeform.useHeader ? config.freeform.dateText : undefined,
    headerLogos: config.freeform.useHeader
      ? config.freeform.headerLogos
      : undefined,
    footer: config.freeform.useFooter ? config.freeform.footerText : undefined,
    footerLogos: config.freeform.useFooter
      ? config.freeform.footerLogos
      : undefined,
    layout,
  };
}

export async function convertReportItemToSlide(
  projectId: string,
  config: ReportItemConfig,
): Promise<Slide> {
  switch (config.type) {
    case "cover":
      return convertCover(config);
    case "section":
      return convertSection(config);
    case "freeform":
      return await convertFreeform(projectId, config);
  }
}

export async function convertReportToSlideDeck(
  projectId: string,
  reportId: string,
  onProgress: OnProgress,
  folderId?: string | null,
): Promise<APIResponseWithData<{ deckId: string }>> {
  try {
    onProgress(0.05, "Fetching report...");
    const reportRes = await serverActions.getReportDetail({
      projectId,
      report_id: reportId,
    });
    if (!reportRes.success) {
      return { success: false, err: reportRes.err };
    }
    const report = reportRes.data;

    const items = [];
    for (const itemId of report.itemIdsInOrder) {
      const itemRes = await serverActions.getReportItem({
        projectId,
        report_id: reportId,
        item_id: itemId,
      });
      if (!itemRes.success) {
        return { success: false, err: `Failed to fetch item ${itemId}: ${itemRes.err}` };
      }
      items.push(itemRes.data);
    }

    onProgress(0.1, "Creating slide deck...");
    const createRes = await serverActions.createSlideDeck({
      projectId,
      label: report.config.label,
      folderId,
    });
    if (!createRes.success) {
      return { success: false, err: createRes.err };
    }
    const deckId = createRes.data.deckId;

    const configRes = await serverActions.updateSlideDeckConfig({
      projectId,
      deck_id: deckId,
      config: report.config,
    });
    if (!configRes.success) {
      return { success: false, err: configRes.err };
    }

    const total = items.length;
    for (let i = 0; i < total; i++) {
      onProgress(
        0.1 + 0.85 * (i / total),
        `Converting slide ${i + 1} of ${total}...`,
      );
      const slide = await convertReportItemToSlide(projectId, items[i].config);
      const addRes = await serverActions.createSlide({
        projectId,
        deck_id: deckId,
        position: { toEnd: true },
        slide,
      });
      if (!addRes.success) {
        return {
          success: false,
          err: `Failed on slide ${i + 1} of ${total}: ${addRes.err}`,
        };
      }
    }

    onProgress(1, "Done");
    return { success: true, data: { deckId } };
  } catch (err) {
    return {
      success: false,
      err: err instanceof Error ? err.message : String(err),
    };
  }
}
