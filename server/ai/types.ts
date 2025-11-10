export interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContent[];
}

export type AnthropicContent = AnthropicTextContent | AnthropicImageContent;

export interface AnthropicTextContent {
  type: "text";
  text: string;
}

export interface AnthropicImageContent {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
    data: string;
  };
}

export interface AnthropicAPIRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  system?: string;
}

export interface AnthropicAPIResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: Array<{
    type: "text";
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: null | string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface ChartInterpretationRequest {
  context: string;
  additionalInstructions?: string;
}

export interface ChartImageInterpretationRequest
  extends ChartInterpretationRequest {
  imageBase64: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
}

export interface ChartDataInterpretationRequest
  extends ChartInterpretationRequest {
  data: ChartData;
}

export interface ChartData {
  type:
    | "bar"
    | "line"
    | "pie"
    | "scatter"
    | "area"
    | "combo"
    | "stacked-bar"
    | "grouped-bar";
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  datasets: ChartDataset[];
  metadata?: {
    timeRange?: string;
    dataSource?: string;
    aggregationType?: string;
    [key: string]: string | number | boolean | null | undefined;
  };
}

export interface ChartDataset {
  label: string;
  data: Array<{
    x: string | number;
    y: number;
    [key: string]: string | number | boolean | null;
  }>;
  color?: string;
  type?: "bar" | "line" | "scatter";
}
