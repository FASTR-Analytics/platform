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

// Now always returns explicit layout
export type FreeformContentResult = {
  layoutType: "explicit";
  layout: LayoutNode<PageContentItem>;
};

export async function getRowsForFreeform(
  projectId: string,
  _reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
  pdfScaleFactor?: number,
): Promise<APIResponseWithData<FreeformContentResult>> {
  try {
    const extraScale = pdfScaleFactor ?? 1;
    const content = reportItemConfig.freeform.content;

    // Content is now always a LayoutNode (explicit layout)
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
