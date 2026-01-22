import {
  ReportConfig,
  ReportItemConfig,
  ReportItemContentItem,
} from "lib";
import {
  APIResponseWithData,
  CustomMarkdownStyleOptions,
  FigureInputs,
  ImageInputs,
  LayoutNode,
  MarkdownRendererInput,
  PageContentItem,
  PageSpacerInputs,
} from "panther";
import { _SERVER_HOST } from "~/server_actions/config";
import { getImgFromCacheOrFetch } from "~/state/img_cache";
import { getPOFigureInputsFromCacheOrFetch } from "~/state/po_cache";

type ConvertResult = {
  node: LayoutNode<PageContentItem>;
};

type ConvertItemsResult = {
  items: PageContentItem[];
};

export type FreeformContentResult =
  | { layoutType: "explicit"; layout: LayoutNode<PageContentItem> }
  | { layoutType: "optimize"; items: PageContentItem[] };

export async function getRowsForFreeform(
  projectId: string,
  _reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
  pdfScaleFactor?: number,
): Promise<APIResponseWithData<FreeformContentResult>> {
  try {
    const extraScale = pdfScaleFactor ?? 1;
    const content = reportItemConfig.freeform.content;

    // Handle new format with layoutType
    if (typeof content === "object" && content !== null && "layoutType" in content) {
      if (content.layoutType === "optimize") {
        const result = await convertItemsArray(
          content.items,
          projectId,
          extraScale,
          pdfScaleFactor,
        );
        if (result.success === false) return result;
        console.log("[OPTIMIZE] Converted items:", result.data.items.map(item => {
          if ('markdown' in item) {
            return `markdown(autofit=${(item as any).autofit})`;
          }
          if ('chartData' in item) return 'chartOV';
          if ('tableData' in item) return 'table';
          if ('timeseriesData' in item) return 'timeseries';
          if ('simpleVizData' in item) return 'simpleViz';
          if ('spacer' in item) return 'spacer';
          if ('image' in item) return 'image';
          return `unknown: ${JSON.stringify(Object.keys(item))}`;
        }));
        return {
          success: true,
          data: { layoutType: "optimize", items: result.data.items },
        };
      } else {
        const result = await convertLayoutNode(
          content.layout,
          projectId,
          extraScale,
          pdfScaleFactor,
        );
        if (result.success === false) return result;
        return {
          success: true,
          data: { layoutType: "explicit", layout: result.data.node },
        };
      }
    }

    // Handle legacy format (direct LayoutNode) for backwards compatibility
    const result = await convertLayoutNode(
      content,
      projectId,
      extraScale,
      pdfScaleFactor,
    );
    if (result.success === false) return result;
    return {
      success: true,
      data: { layoutType: "explicit", layout: result.data.node },
    };
  } catch (e) {
    return {
      success: false,
      err:
        "Problem getting rows for freeform slide: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

async function convertItemsArray(
  items: ReportItemContentItem[],
  projectId: string,
  extraScale: number,
  pdfScaleFactor?: number,
): Promise<APIResponseWithData<ConvertItemsResult>> {
  const convertedItems: PageContentItem[] = [];

  for (const item of items) {
    const result = await convertContentItem(
      item,
      crypto.randomUUID(),
      projectId,
      extraScale,
      pdfScaleFactor,
      true, // isForOptimizer - reduce figure scale
    );
    if (result.success === false) return result;
    convertedItems.push(result.data);
  }

  return { success: true, data: { items: convertedItems } };
}

async function convertLayoutNode(
  node: LayoutNode<ReportItemContentItem>,
  projectId: string,
  extraScale: number,
  pdfScaleFactor?: number,
): Promise<APIResponseWithData<ConvertResult>> {
  if (node.type === "item") {
    const result = await convertContentItem(
      node.data,
      node.id,
      projectId,
      extraScale,
      pdfScaleFactor,
    );
    if (result.success === false) return result;

    const convertedNode: LayoutNode<PageContentItem> = {
      ...node,
      data: result.data,
    };

    return { success: true, data: { node: convertedNode } };
  }

  const convertedChildren: (LayoutNode<PageContentItem> & { span?: number })[] = [];

  for (const child of node.children) {
    const result = await convertLayoutNode(
      child,
      projectId,
      extraScale,
      pdfScaleFactor,
    );
    if (result.success === false) return result;

    convertedChildren.push({
      ...result.data.node,
      span: (child as { span?: number }).span,
    } as LayoutNode<PageContentItem> & { span?: number });
  }

  const convertedNode: LayoutNode<PageContentItem> = {
    ...node,
    children: convertedChildren,
  };

  return { success: true, data: { node: convertedNode } };
}

async function convertContentItem(
  item: ReportItemContentItem,
  _itemId: string,
  projectId: string,
  extraScale: number,
  pdfScaleFactor?: number,
  isForOptimizer: boolean = false,
): Promise<APIResponseWithData<PageContentItem>> {
  if (item.type === "placeholder") {
    const spacerItem: PageSpacerInputs = { spacer: true };
    return { success: true, data: spacerItem };
  }

  if (item.type === "text") {
    if (!item.markdown?.trim()) {
      const spacerItem: PageSpacerInputs = { spacer: true };
      return { success: true, data: spacerItem };
    }

    const markdownStyle: CustomMarkdownStyleOptions = {
      scale: (item.textSize ?? 1) * extraScale,
    };

    const markdownItem: MarkdownRendererInput = {
      markdown: item.markdown,
      style: markdownStyle,
      autofit: item.stretch ? false : true,
    };
    return { success: true, data: markdownItem };
  }

  if (item.type === "figure") {
    if (!item.presentationObjectInReportInfo) {
      const spacerItem: PageSpacerInputs = { spacer: true };
      return { success: true, data: spacerItem };
    }

    const resFigureInputs = await getPOFigureInputsFromCacheOrFetch(
      projectId,
      item.presentationObjectInReportInfo.id,
      {
        selectedReplicantValue:
          item.presentationObjectInReportInfo.selectedReplicantValue,
        additionalScale: isForOptimizer
          ? 1  // Use scale 1 for optimizer
          : (item.figureAdditionalScale ?? 1) * (pdfScaleFactor ?? 1),
        hideFigureCaption: isForOptimizer ? true : item.hideFigureCaption,
        hideFigureSubCaption: isForOptimizer ? true : item.hideFigureSubCaption,
        hideFigureFootnote: isForOptimizer ? true : item.hideFigureFootnote,
        _forOptimizer: isForOptimizer,
      } as any,
    );
    if (resFigureInputs.success === false) {
      return resFigureInputs;
    }

    if (isForOptimizer) {
      console.log("[OPTIMIZE FIGURE] caption:", (resFigureInputs.data as any).caption?.substring(0, 50));
      console.log("[OPTIMIZE FIGURE] subCaption:", (resFigureInputs.data as any).subCaption?.substring(0, 50));
      console.log("[OPTIMIZE FIGURE] footnote:", (resFigureInputs.data as any).footnote?.substring(0, 50));
    }

    return { success: true, data: resFigureInputs.data as FigureInputs };
  }

  if (item.type === "image") {
    if (!item.imgFile) {
      const spacerItem: PageSpacerInputs = { spacer: true };
      return { success: true, data: spacerItem };
    }

    const resImg = await getImgFromCacheOrFetch(
      `${_SERVER_HOST}/${item.imgFile}`,
    );
    if (resImg.success === false) {
      const spacerItem: PageSpacerInputs = { spacer: true };
      return { success: true, data: spacerItem };
    }

    const imageItem: ImageInputs = {
      image: resImg.data,
      height: item.imgHeight,
      fit: item.imgFit === "inside" ? "contain" : (item.imgFit ?? "cover"),
    };
    return { success: true, data: imageItem };
  }

  throw new Error("Unknown content item type");
}
