import {
  ReportConfig,
  ReportItemConfig,
  ReportItemContentItem,
  getColorDetailsForColorTheme,
  _SLIDE_BACKGROUND_COLOR,
  _CF_RED,
} from "lib";
import type { ColorDetails } from "lib";
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
import type { ContainerStyleOptions } from "panther";
import { _SERVER_HOST } from "~/server_actions/config";
import { getImgFromCacheOrFetch } from "~/state/img_cache";
import { getPOFigureInputsFromCacheOrFetch } from "~/state/po_cache";

type ConvertResult = {
  node: LayoutNode<PageContentItem>;
};

export type FreeformContentResult = LayoutNode<PageContentItem>;

export async function getRowsForFreeform(
  projectId: string,
  _reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
): Promise<APIResponseWithData<FreeformContentResult>> {
  try {
    const content = reportItemConfig.freeform.content;
    const cDetails = getColorDetailsForColorTheme(_reportConfig.colorTheme);

    // Content is now always a LayoutNode (explicit layout)
    const result = await convertLayoutNode(
      content,
      projectId,
      cDetails,
    );
    if (result.success === false) return result;
    return {
      success: true,
      data: result.data.node,
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

function resolveTextBackground(bg: string | undefined, cDetails: ColorDetails): { containerStyle: ContainerStyleOptions; textColor: string } | undefined {
  if (!bg || bg === "none") return undefined;
  const pad: [number, number] = [50, 60];
  if (bg === "grey") {
    return {
      containerStyle: { backgroundColor: { key: "base200" }, padding: pad },
      textColor: cDetails.baseTextColor,
    };
  }
  if (bg === "primary") {
    return {
      containerStyle: { backgroundColor: cDetails.primaryBackgroundColor, padding: pad },
      textColor: cDetails.lightOrDark === "dark" ? "#FFFFFF" : cDetails.baseTextColor,
    };
  }
  if (bg === "success") {
    return {
      containerStyle: { backgroundColor: _SLIDE_BACKGROUND_COLOR, padding: pad },
      textColor: "#FFFFFF",
    };
  }
  if (bg === "danger") {
    return {
      containerStyle: { backgroundColor: _CF_RED, padding: pad },
      textColor: "#FFFFFF",
    };
  }
  return undefined;
}

async function convertLayoutNode(
  node: LayoutNode<ReportItemContentItem>,
  projectId: string,
  cDetails: ColorDetails,
): Promise<APIResponseWithData<ConvertResult>> {
  if (node.type === "item") {
    const resolved = node.data.type === "text"
      ? resolveTextBackground(node.data.textBackground, cDetails)
      : undefined;

    const result = await convertContentItem(
      node.data,
      node.id,
      projectId,
      false,
      resolved?.textColor,
    );
    if (result.success === false) return result;

    const convertedNode: LayoutNode<PageContentItem> = {
      ...node,
      data: result.data,
      ...(resolved ? { style: resolved.containerStyle } : {}),
    };

    return { success: true, data: { node: convertedNode } };
  }

  const convertedChildren: (LayoutNode<PageContentItem> & { span?: number })[] = [];

  for (const child of node.children) {
    const result = await convertLayoutNode(
      child,
      projectId,
      cDetails,
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
  isForOptimizer: boolean = false,
  textColor?: string,
): Promise<APIResponseWithData<PageContentItem>> {
  if (item.type === "text") {
    if (!item.markdown?.trim()) {
      const spacerItem: PageSpacerInputs = { spacer: true };
      return { success: true, data: spacerItem };
    }

    const markdownStyle: CustomMarkdownStyleOptions = {
      scale: item.textSize ?? 1,
      ...(textColor ? { text: { base: { color: textColor } } } : {}),
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
        additionalScale: isForOptimizer ? 1 : (item.figureAdditionalScale ?? 1),
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

    return { success: true, data: {
      ...resFigureInputs.data as FigureInputs,
      autofit: item.stretch ? false : true,
     } };
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
