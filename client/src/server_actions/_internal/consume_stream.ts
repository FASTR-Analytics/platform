import type {
  APIResponseNoData,
  APIResponseWithData,
  StreamMessage,
  ProgressCallback,
} from "lib";

export async function consumeStream<T = void>(
  response: Response,
  onProgress?: ProgressCallback,
): Promise<T extends void ? APIResponseNoData : APIResponseWithData<T>> {
  // Handle non-OK responses as standard errors (not streaming)
  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      err: errorText || `HTTP ${response.status}`,
    } as any;
  }

  const contentType = response.headers.get("content-type");

  // If it's JSON, it's a regular response (not streaming)
  if (contentType?.includes("application/json")) {
    const result = await response.json();
    return result as any;
  }

  // Otherwise, it's a streaming response
  if (!response.body) {
    return { success: false, err: "Response has no body" } as any;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim() === "") continue;

        try {
          const message: any = JSON.parse(line);

          if (message.progress === -1) {
            // Stream completed with error
            onProgress?.(0, message.message); // Report progress as 0 for error
            return message.result || { success: false, err: message.message };
          } else if (message.progress === 1) {
            // Stream completed successfully
            onProgress?.(message.progress, message.message);
            return message.result || { success: true };
          } else {
            // Progress update
            onProgress?.(message.progress, message.message);
          }
        } catch (parseError) {
          console.warn("Failed to parse streaming message:", line);
        }
      }
    }

    // Should never reach here if stream completes properly
    return { success: false, err: "Stream ended unexpectedly" } as any;
  } finally {
    reader.releaseLock();
  }
}
