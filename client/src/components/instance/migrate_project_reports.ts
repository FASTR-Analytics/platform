import type {
  ProjectDetail,
  ReportConfig,
  ReportItem,
  SlideDeckConfig,
  Slide,
  CoverSlide,
  SectionSlide,
  ContentSlide,
  ContentBlock,
  FigureBlock,
  TextBlock,
  ImageBlock,
  FigureSource,
  ReportItemContentItem,
  PresentationObjectConfig,
  ReplicantValueOverride,
} from "lib";
import { getColorDetailsForColorTheme, t3 } from "lib";
import type { LayoutNode } from "@timroberton/panther";
import { normalizeLayout } from "@timroberton/panther";
import { serverActions } from "~/server_actions";
import {
  getPODetailFromCacheorFetch,
  getPOFigureInputsFromCacheOrFetch,
} from "~/state/po_cache";
import { stripFigureInputsForStorage } from "~/generate_visualization/mod";

type ProgressCallback = (current: number, total: number) => void;
type LogCallback = (msg: string) => void;

export async function migrateProjectReports(
  projectDetail: ProjectDetail,
  onItemProgress: ProgressCallback,
  addLog: LogCallback,
  addError: LogCallback
): Promise<{ migratedCount: number }> {
  const projectId = projectDetail.id;
  const reports = projectDetail.reports.filter((r) => r.reportType === "slide_deck");

  if (reports.length === 0) {
    return { migratedCount: 0 };
  }

  const timestamp = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const folderRes = await serverActions.createSlideDeckFolder({
    projectId,
    label: t3({
      en: `Old reports (migrated ${timestamp})`,
      fr: `Anciens rapports (migré ${timestamp})`,
    }),
  });
  if (!folderRes.success) {
    throw new Error("Failed to create folder: " + folderRes.err);
  }
  const folderId = folderRes.data.folderId;

  let totalItems = 0;
  const reportDataList: {
    report: { config: ReportConfig; label: string };
    items: ReportItem[];
    itemIdsInOrder: string[];
  }[] = [];

  for (const report of reports) {
    const backupRes = await serverActions.backupReport({
      projectId,
      report_id: report.id,
    });
    if (!backupRes.success) {
      addError(`Skipping report "${report.label}": ${backupRes.err}`);
      continue;
    }
    const { report: reportDetail, reportItems } = backupRes.data;
    totalItems += reportDetail.itemIdsInOrder.length;
    reportDataList.push({
      report: { config: reportDetail.config, label: reportDetail.config.label },
      items: reportItems,
      itemIdsInOrder: reportDetail.itemIdsInOrder,
    });
  }

  let processedItems = 0;

  for (const { report, items, itemIdsInOrder } of reportDataList) {
    const deckRes = await serverActions.createSlideDeck({
      projectId,
      label: report.label || "Untitled",
      folderId,
    });
    if (!deckRes.success) {
      addError(`Failed to create deck for "${report.label}": ${deckRes.err}`);
      continue;
    }
    const deckId = deckRes.data.deckId;

    const slideDeckConfig = mapReportConfigToSlideDeckConfig(report.config);
    await serverActions.updateSlideDeckConfig({
      projectId,
      deck_id: deckId,
      config: slideDeckConfig,
    });

    const itemMap = new Map(items.map((item) => [item.id, item]));

    for (const itemId of itemIdsInOrder) {
      const item = itemMap.get(itemId);
      if (!item) {
        processedItems++;
        onItemProgress(processedItems, totalItems);
        continue;
      }

      const slide = await convertReportItemToSlide(item, projectId, addLog);

      await serverActions.createSlide({
        projectId,
        deck_id: deckId,
        position: { toEnd: true },
        slide,
      });

      processedItems++;
      onItemProgress(processedItems, totalItems);
    }
  }

  return { migratedCount: reportDataList.length };
}

function mapReportConfigToSlideDeckConfig(rc: ReportConfig): SlideDeckConfig {
  const colorDetails = getColorDetailsForColorTheme(rc.colorTheme);
  return {
    label: rc.label,
    selectedReplicantValue: rc.selectedReplicantValue,
    logos: rc.logos,
    logoSize: rc.logoSize,
    figureScale: rc.figureScale,
    deckFooter: rc.footer ? { text: rc.footer, logos: [] } : undefined,
    showPageNumbers: rc.showPageNumbers,
    headerSize: rc.headerSize,
    useWatermark: rc.useWatermark,
    watermarkText: rc.watermarkText,
    primaryColor: colorDetails.primaryBackgroundColor,
    overlay: rc.overlay,
  };
}

async function convertReportItemToSlide(
  item: ReportItem,
  projectId: string,
  addLog: LogCallback
): Promise<Slide> {
  const c = item.config;

  switch (c.type) {
    case "cover": {
      const slide: CoverSlide = {
        type: "cover",
        title: c.cover.titleText ?? "",
        subtitle: c.cover.subTitleText,
        presenter: c.cover.presenterText,
        date: c.cover.dateText,
        logos: c.cover.logos,
        titleTextRelFontSize: c.cover.titleTextRelFontSize,
        subTitleTextRelFontSize: c.cover.subTitleTextRelFontSize,
        presenterTextRelFontSize: c.cover.presenterTextRelFontSize,
        dateTextRelFontSize: c.cover.dateTextRelFontSize,
      };
      return slide;
    }

    case "section": {
      const slide: SectionSlide = {
        type: "section",
        sectionTitle: c.section.sectionText ?? "",
        sectionSubtitle: c.section.smallerSectionText,
        sectionTextRelFontSize: c.section.sectionTextRelFontSize,
        smallerSectionTextRelFontSize: c.section.smallerSectionTextRelFontSize,
      };
      return slide;
    }

    case "freeform": {
      const rawLayout = await convertLayoutNode(c.freeform.content, projectId, addLog);
      const layout = normalizeLayout(rawLayout, 12);
      const slide: ContentSlide = {
        type: "content",
        header: c.freeform.useHeader ? c.freeform.headerText : undefined,
        subHeader: c.freeform.useHeader ? c.freeform.subHeaderText : undefined,
        date: c.freeform.useHeader ? c.freeform.dateText : undefined,
        headerLogos: c.freeform.useHeader ? c.freeform.headerLogos : undefined,
        footer: c.freeform.useFooter ? c.freeform.footerText : undefined,
        footerLogos: c.freeform.useFooter ? c.freeform.footerLogos : undefined,
        layout,
      };
      return slide;
    }
  }
}

async function convertLayoutNode(
  node: LayoutNode<ReportItemContentItem>,
  projectId: string,
  addLog: LogCallback
): Promise<LayoutNode<ContentBlock>> {
  if (node.type === "item") {
    const block = await convertContentItem(node.data, projectId, addLog);
    return {
      type: "item",
      id: node.id,
      data: block,
      span: node.span,
    };
  }

  const children = await Promise.all(
    (node.children ?? []).map((child) => convertLayoutNode(child, projectId, addLog))
  );
  return {
    type: node.type,
    id: node.id,
    children,
    span: node.span,
  };
}

async function convertContentItem(
  item: ReportItemContentItem,
  projectId: string,
  addLog: LogCallback
): Promise<ContentBlock> {
  switch (item.type) {
    case "text": {
      const block: TextBlock = {
        type: "text",
        markdown: item.markdown ?? "",
        style: {
          textSize: item.textSize,
          textBackground: item.textBackground !== "none" ? item.textBackground : undefined,
        },
      };
      return block;
    }

    case "image": {
      const block: ImageBlock = {
        type: "image",
        imgFile: item.imgFile ?? "",
        style: {
          imgFit: item.imgFit === "inside" ? "contain" : "cover",
        },
      };
      return block;
    }

    case "figure": {
      const poInfo = item.presentationObjectInReportInfo;
      if (!poInfo) {
        return { type: "text", markdown: "[Empty figure]" };
      }

      const poDetailRes = await getPODetailFromCacheorFetch(projectId, poInfo.id);
      if (!poDetailRes.success) {
        addLog(`Figure PO not found: ${poInfo.id}`);
        return { type: "text", markdown: "[Missing figure]" };
      }

      const override: ReplicantValueOverride = {
        selectedReplicantValue: poInfo.selectedReplicantValue || undefined,
        additionalScale: item.useFigureAdditionalScale
          ? item.figureAdditionalScale ?? undefined
          : undefined,
        hideFigureCaption: item.hideFigureCaption,
        hideFigureSubCaption: item.hideFigureSubCaption,
        hideFigureFootnote: item.hideFigureFootnote,
      };

      const configForSource: PresentationObjectConfig = structuredClone(poDetailRes.data.config);
      if (override.selectedReplicantValue) {
        configForSource.d.selectedReplicantValue = override.selectedReplicantValue;
      }
      if (override.hideFigureCaption) {
        configForSource.t.caption = "";
      }
      if (override.hideFigureSubCaption) {
        configForSource.t.subCaption = "";
      }
      if (override.hideFigureFootnote) {
        configForSource.t.footnote = "";
      }

      const source: FigureSource = {
        type: "from_data",
        metricId: poInfo.metricId,
        config: configForSource,
        snapshotAt: new Date().toISOString(),
      };

      const figureInputsRes = await getPOFigureInputsFromCacheOrFetch(
        projectId,
        poInfo.id,
        override
      );

      const block: FigureBlock = {
        type: "figure",
        figureInputs: figureInputsRes.success
          ? stripFigureInputsForStorage(figureInputsRes.data)
          : undefined,
        source,
      };

      if (!figureInputsRes.success) {
        addLog(`Figure render failed for PO ${poInfo.id}: ${figureInputsRes.err}`);
      }

      return block;
    }

    default: {
      addLog(`Unknown content type: ${(item as any).type}`);
      return { type: "text", markdown: "" };
    }
  }
}
