"use server";

import {
  ChartOVRenderer,
  ADTFigure,
  TableRenderer,
  TimeseriesRenderer,
} from "@timroberton/panther";
import { _ANTHROPIC_API_KEY } from "../exposed_env_vars.ts";
import {
  getChartDataFromChartOVInputs,
  getChartDataFromTableInputs,
  getChartDataFromTimeseriesInputs,
} from "./_internal/converters/mod.ts";
import { interpretChartFromData } from "./interpret_chart_data.ts";

export async function getAIInterpretation(
  figureInputs: ADTFigure,
  userAdditionalInstructions: string,
  userContext: string
): Promise<string> {
  const additionalInstructions =
    userAdditionalInstructions.trim() +
    " Focus on trends, patterns, and any notable insights. Keep the interpretation concise and relevant to health system management.";
  const context =
    "This visualization shows health facility data. " + userContext.trim();
  try {
    if (TimeseriesRenderer.isType(figureInputs)) {
      const chartData = getChartDataFromTimeseriesInputs(figureInputs);
      return await interpretChartFromData(_ANTHROPIC_API_KEY, {
        data: chartData,
        context,
        additionalInstructions,
      });
    }
    if (ChartOVRenderer.isType(figureInputs)) {
      const chartData = getChartDataFromChartOVInputs(figureInputs);
      return await interpretChartFromData(_ANTHROPIC_API_KEY, {
        data: chartData,
        context,
        additionalInstructions,
      });
    }
    if (TableRenderer.isType(figureInputs)) {
      const chartData = getChartDataFromTableInputs(figureInputs);
      return await interpretChartFromData(_ANTHROPIC_API_KEY, {
        data: chartData,
        context,
        additionalInstructions,
      });
    } else {
      return "Unknown visualization type.";
    }
  } catch (error) {
    console.error("Error getting AI interpretation:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to get interpretation";
    return `AI interpretation failed: ${errorMessage}`;
  }
}
