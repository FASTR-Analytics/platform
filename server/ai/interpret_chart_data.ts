import { _ANTHROPIC_API_URL } from "../exposed_env_vars.ts";
import type {
  AnthropicAPIRequest,
  AnthropicAPIResponse,
  ChartDataInterpretationRequest,
  ChartData,
  ChartDataset,
} from "./types.ts";

function formatDataForPrompt(data: ChartData): string {
  let formatted = `Chart Type: ${data.type}\n`;

  if (data.title) {
    formatted += `Title: ${data.title}\n`;
  }

  if (data.xAxisLabel) {
    formatted += `X-Axis: ${data.xAxisLabel}\n`;
  }

  if (data.yAxisLabel) {
    formatted += `Y-Axis: ${data.yAxisLabel}\n`;
  }

  formatted += "\nDatasets:\n";

  data.datasets.forEach((dataset: ChartDataset, index: number) => {
    formatted += `\nDataset ${index + 1}: ${dataset.label}\n`;
    if (dataset.type) {
      formatted += `Type: ${dataset.type}\n`;
    }
    formatted += "Data points:\n";

    dataset.data.forEach((point) => {
      formatted += `  - X: ${point.x}, Y: ${point.y}`;

      const additionalProps = Object.entries(point)
        .filter(([key]) => key !== "x" && key !== "y")
        .map(([key, value]) => `${key}: ${value}`);

      if (additionalProps.length > 0) {
        formatted += ` (${additionalProps.join(", ")})`;
      }
      formatted += "\n";
    });
  });

  return formatted;
}

export async function interpretChartFromData(
  apiKey: string,
  request: ChartDataInterpretationRequest
): Promise<string> {
  const systemPrompt = `
You are an expert data analyst specializing in interpretation of global health data. 
Your task is to analyze structured chart data and provide clear, insightful interpretations.
Focus on:
- Key trends and patterns in the data
- Notable outliers or anomalies
Base your analysis purely on the provided data.
Keep your interpretation concise but comprehensive.
`;

  const formattedData = formatDataForPrompt(request.data);

  const userPrompt = `${request.context}

${
  request.additionalInstructions
    ? `Additional instructions: ${request.additionalInstructions}\n`
    : ""
}
Here is the chart data to analyze:

${formattedData}

Please provide your interpretation of this data.`;

  const anthropicRequest: AnthropicAPIRequest = {
    model: "claude-3-5-sonnet-20241022",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: userPrompt,
          },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.3,
    system: systemPrompt,
  };

  const response = await fetch(_ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(anthropicRequest),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${error}`);
  }

  const data: AnthropicAPIResponse = await response.json();

  if (!data.content || data.content.length === 0) {
    throw new Error("No response content from Anthropic API");
  }

  return data.content[0].text;
}
