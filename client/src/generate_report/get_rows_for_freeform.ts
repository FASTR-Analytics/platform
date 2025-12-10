import {
  ReportConfig,
  ReportItemConfig,
  _CF_RED,
  _SLIDE_BACKGROUND_COLOR,
  getColorDetailsForColorTheme,
} from "lib";
import {
  APIResponseWithData,
  createColsNode,
  createItemNode,
  createRowsNode,
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

export async function getRowsForFreeform(
  projectId: string,
  reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
  pdfScaleFactor?: number,
): Promise<APIResponseWithData<LayoutNode<PageContentItem>>> {
  try {
    const cDetails = getColorDetailsForColorTheme(reportConfig.colorTheme);
    const extraScale = pdfScaleFactor ?? 1;

    const rowNodes: LayoutNode<PageContentItem>[] = [];

    for (const row of reportItemConfig.freeform.content) {
      const colNodes: (LayoutNode<PageContentItem> & { span?: number })[] = [];

      for (const col of row) {
        if (col.type === "placeholder") {
          const spacerItem: PageSpacerInputs = {
            spacerHeight: col.placeholderHeight ?? 100,
          };
          colNodes.push({
            ...createItemNode(spacerItem),
            span: col.span,
          });
          continue;
        }

        if (col.type === "text") {
          if (!col.markdown?.trim()) {
            const spacerItem: PageSpacerInputs = { spacerHeight: 50 };
            colNodes.push({
              ...createItemNode(spacerItem),
              span: col.span,
            });
            continue;
          }

          // TODO: Old markdown style had padding, backgroundColor, color - see NEED_TO_REVISIT.md
          const markdownStyle: CustomMarkdownStyleOptions = {
            scale: col.textSize,
          };

          const markdownItem: MarkdownRendererInput = {
            markdown: col.markdown,
            style: markdownStyle,
          };
          colNodes.push({
            ...createItemNode(markdownItem),
            span: col.span,
          });
          continue;
        }

        if (col.type === "figure") {
          if (!col.presentationObjectInReportInfo) {
            const spacerItem: PageSpacerInputs = { spacerHeight: 50 };
            colNodes.push({
              ...createItemNode(spacerItem),
              span: col.span,
            });
            continue;
          }

          const resFigureInputs = await getPOFigureInputsFromCacheOrFetch(
            projectId,
            col.presentationObjectInReportInfo.id,
            {
              selectedReplicantValue:
                col.presentationObjectInReportInfo.selectedReplicantValue,
              additionalScale:
                (col.figureAdditionalScale ?? 1) * (pdfScaleFactor ?? 1),
              hideFigureCaption: col.hideFigureCaption,
              hideFigureSubCaption: col.hideFigureSubCaption,
              hideFigureFootnote: col.hideFigureFootnote,
            },
          );
          if (resFigureInputs.success === false) {
            return resFigureInputs;
          }

          colNodes.push({
            ...createItemNode(resFigureInputs.data as FigureInputs),
            span: col.span,
          });
          continue;
        }

        if (col.type === "image") {
          if (!col.imgFile) {
            const spacerItem: PageSpacerInputs = { spacerHeight: 50 };
            colNodes.push({
              ...createItemNode(spacerItem),
              span: col.span,
            });
            continue;
          }

          const resImg = await getImgFromCacheOrFetch(
            `${_SERVER_HOST}/${col.imgFile}`,
          );
          if (resImg.success === false) {
            const spacerItem: PageSpacerInputs = { spacerHeight: 50 };
            colNodes.push({
              ...createItemNode(spacerItem),
              span: col.span,
            });
            continue;
          }

          const imageItem: ImageInputs = {
            image: resImg.data,
            height: col.imgHeight,
            fit: col.imgFit === "inside" ? "contain" : (col.imgFit ?? "cover"),
          };
          colNodes.push({
            ...createItemNode(imageItem),
            span: col.span,
          });
          continue;
        }

        throw new Error("Unknown column type");
      }

      rowNodes.push(createColsNode(colNodes));
    }

    return { success: true, data: createRowsNode(rowNodes) };
  } catch (e) {
    return {
      success: false,
      err:
        "Problem getting rows for freeform slide: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}
