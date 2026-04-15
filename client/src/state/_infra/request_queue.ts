type QueuedRequest<T> = {
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

export class RequestQueue {
  private queue: QueuedRequest<unknown>[] = [];
  private running = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        execute: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.running++;

    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  getStats() {
    return {
      queued: this.queue.length,
      running: this.running,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

// Global queue for PO items requests
// Limit to 15 concurrent requests to prevent overwhelming the server
export const poItemsQueue = new RequestQueue(15);

// Global queue for Variable Info requests
// Limit to 20 concurrent requests (lightweight queries, can handle more)
export const resultsValueInfoQueue = new RequestQueue(20);
