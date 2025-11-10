import {
  ReportConfig,
  ReportItemConfig,
  _CF_RED,
  _SLIDE_BACKGROUND_COLOR,
  getColorDetailsForColorTheme,
} from "lib";
import {
  ADTItem,
  ADTParagraphStyleOptions,
  APIResponseWithData,
  ColContainerForLayout,
  ItemOrContainerForLayout,
  MeasurableItem,
  ADTFigure,
} from "panther";
import { _SERVER_HOST } from "~/server_actions/config";
import { getImgFromCacheOrFetch } from "~/state/img_cache";
import { getPOFigureInputsFromCacheOrFetch } from "~/state/po_cache";

export async function getRowsForFreeform(
  projectId: string,
  reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
  pdfScaleFactor?: number,
): Promise<APIResponseWithData<ColContainerForLayout<ADTItem>[]>> {
  try {
    const cDetails = getColorDetailsForColorTheme(reportConfig.colorTheme);
    const extraScale = pdfScaleFactor ?? 1;
    const finalRows: ColContainerForLayout<ADTItem>[] = [];
    for (
      let i_row = 0;
      i_row < reportItemConfig.freeform.content.length;
      i_row++
    ) {
      const row = reportItemConfig.freeform.content[i_row];
      const finalCols: (MeasurableItem<ADTItem> & {
        span?: number;
      })[] = [];
      const isOnlyPlaceholders = !reportItemConfig.freeform.content.some(
        (row) =>
          row.some((col) => {
            return (
              (col.type === "figure" && col.presentationObjectInReportInfo) ||
              (col.type === "text" && col.markdown?.trim()) ||
              (col.type === "text" && col.imgFile)
            );
          }),
      );
      for (let i_col = 0; i_col < row.length; i_col++) {
        const col = row[i_col];
        if (col.type === "placeholder") {
          finalCols.push({
            spacer: true,
            noShading: col.placeholderInvisible,
            span: col.span,
            stretch: col.placeholderStretch,
            height: !col.placeholderStretch ? col.placeholderHeight : undefined,
          });
          continue;
        }
        if (col.type === "text") {
          // Note show placeholder if no data
          if (!col.markdown?.trim()) {
            finalCols.push({
              spacer: true,
              span: col.span,
              stretch: isOnlyPlaceholders,
            });
            continue;
          }

          const s: ADTParagraphStyleOptions = {
            fontSizeMultiplier: col.textSize,
            padding:
              col.textBackground === undefined || col.textBackground === "none"
                ? 0
                : [50 * extraScale, 60 * extraScale],
            backgroundColor:
              col.textBackground === "none"
                ? undefined
                : col.textBackground === "grey"
                  ? { key: "base200" }
                  : col.textBackground === "primary"
                    ? cDetails.primaryBackgroundColor
                    : col.textBackground === "success"
                      ? _SLIDE_BACKGROUND_COLOR
                      : col.textBackground === "danger"
                        ? _CF_RED
                        : undefined,
            color:
              (col.textBackground === "primary" &&
                cDetails.lightOrDark === "dark") ||
              col.textBackground === "success" ||
              col.textBackground === "danger"
                ? { key: "base100" }
                : { key: "baseContent" },
          };
          finalCols.push({
            // We allow extra whitespace lines (but not whitespace within lines)
            p: col.markdown.split("\n").map((p) => p.trim()),
            span: col.span,
            fillArea: col.fillArea,
            s,
          });
          continue;
        }
        if (col.type === "figure") {
          // Note show placeholder if no data
          if (!col.presentationObjectInReportInfo) {
            finalCols.push({
              spacer: true,
              span: col.span,
              stretch: isOnlyPlaceholders,
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
          const figureInputs: ItemOrContainerForLayout<ADTFigure> & {
            span?: number;
          } = {
            ...resFigureInputs.data,
            // style: {
            //   ...(resFigureInputs.data.style ?? {}),
            //   scale:
            //     reportItemConfig.figureScale === undefined ||
            //     reportItemConfig.figureScale === "default"
            //       ? (reportConfig.figureScale ?? 2)
            //       : (reportItemConfig.figureScale ?? 2),
            // },
            span: col.span,
            stretch: col.stretch,
            fillArea: false,
          };
          finalCols.push(figureInputs);
          continue;
        }
        if (col.type === "image") {
          // Note show placeholder if no data
          if (!col.imgFile) {
            finalCols.push({
              spacer: true,
              span: col.span,
              stretch: isOnlyPlaceholders,
            });
            continue;
          }
          const resImg = await getImgFromCacheOrFetch(
            `${_SERVER_HOST}/${col.imgFile}`,
          );
          if (resImg.success === false) {
            finalCols.push({
              spacer: true,
              span: col.span,
              stretch: isOnlyPlaceholders,
            });
            continue;
          }
          finalCols.push({
            img: resImg.data,
            span: col.span,
            stretch: col.imgStretch,
            s: {
              fit: col.imgFit ?? "cover",
              shouldResizeToFit: col.imgStretch,
            },
            height: col.imgHeight,
            fillArea: !col.imgStretch ? false : undefined,
          });
          continue;
        }
        throw new Error("Should not be possible");
      }
      finalRows.push({ cols: finalCols });
    }
    return { success: true, data: finalRows };
  } catch (e) {
    return {
      success: false,
      err:
        "Problem getting rows for freeform slide: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}
