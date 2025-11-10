import type { Context } from "hono";
import { stream } from "hono/streaming";
import type { StreamMessage } from "lib";

export class StreamWriter<T = void> {
  private encoder = new TextEncoder();

  constructor(private write: (chunk: Uint8Array) => Promise<void>) {}

  private async writeMessage(message: StreamMessage): Promise<void> {
    const json = JSON.stringify(message);
    const chunk = this.encoder.encode(`${json}\n`);
    await this.write(chunk);
  }

  async progress(progress: number, message: string): Promise<void> {
    await this.writeMessage({
      progress: Math.min(1, Math.max(0, progress)),
      message,
    });
  }

  async error(errorMessage: string): Promise<void> {
    const result = { success: false, err: errorMessage };

    // Send error result in completion message
    const errorCompletionMessage = JSON.stringify({
      progress: -1, // Use -1 to indicate error
      message: errorMessage,
      result: result,
    });
    const chunk = this.encoder.encode(`${errorCompletionMessage}\n`);
    await this.write(chunk);
  }

  async complete(): Promise<void>;
  async complete<TData>(data: TData): Promise<void>;
  async complete<TData>(data?: TData): Promise<void> {
    const result =
      data !== undefined ? { success: true, data } : { success: true };

    // Send final result in completion message
    const completionMessage = JSON.stringify({
      progress: 1,
      message: "Complete",
      result: result,
    });
    const chunk = this.encoder.encode(`${completionMessage}\n`);
    await this.write(chunk);
  }
}

export async function streamResponse<T = void>(
  c: Context,
  handler: (writer: StreamWriter<T>) => Promise<void>
): Promise<Response> {
  return stream(c, async (streamWriter) => {
    const writer = new StreamWriter<T>(async (chunk) => {
      await streamWriter.write(chunk);
    });

    try {
      await handler(writer);
      // Response already sent via complete() or error()
    } catch (error) {
      // Send error completion message to ensure stream completes properly
      const errorMessage = error instanceof Error ? error.message : String(error);
      await writer.error(errorMessage);
      // No need to rethrow - error is already sent to client
    }
  });
}
