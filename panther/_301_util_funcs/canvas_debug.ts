// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export interface CanvasInfo {
  id: string;
  width: number;
  height: number;
  type: "2d" | "webgl" | "webgl2";
  component: string;
  createdAt: number;
}

class CanvasDebugger {
  private canvases = new Map<string, CanvasInfo>();
  private contextCount = 0;
  private totalContextsCreated = 0;
  private warningThreshold = 12;
  private criticalThreshold = 14;
  private debugMode = false;

  constructor() {
    if (typeof window !== "undefined") {
      (window as any).__canvasDebugger = this;
    }
  }

  enableDebug(enabled = true) {
    this.debugMode = enabled;
    if (enabled) {
      console.log("[Canvas Debug] Debugging enabled");
      this.logStatus();
    }
  }

  registerCanvas(
    id: string,
    canvas: HTMLCanvasElement,
    type: "2d" | "webgl" | "webgl2",
    component: string,
  ): void {
    const info: CanvasInfo = {
      id,
      width: canvas.width,
      height: canvas.height,
      type,
      component,
      createdAt: Date.now(),
    };

    if (!this.canvases.has(id)) {
      this.contextCount++;
      this.totalContextsCreated++;
    }

    this.canvases.set(id, info);

    if (this.debugMode) {
      console.log(
        `[Canvas Debug] Registered canvas "${id}" from ${component} (${type}, ${canvas.width}x${canvas.height})`,
      );
    }

    this.checkThresholds();
  }

  unregisterCanvas(id: string): void {
    if (this.canvases.has(id)) {
      const info = this.canvases.get(id)!;
      this.canvases.delete(id);
      this.contextCount--;

      if (this.debugMode) {
        const lifetime = Date.now() - info.createdAt;
        console.log(
          `[Canvas Debug] Unregistered canvas "${id}" from ${info.component} (lived ${lifetime}ms)`,
        );
      }
    }
  }

  updateCanvasSize(id: string, width: number, height: number): void {
    const info = this.canvases.get(id);
    if (info) {
      info.width = width;
      info.height = height;
      if (this.debugMode) {
        console.log(
          `[Canvas Debug] Canvas "${id}" resized to ${width}x${height}`,
        );
      }
    }
  }

  private checkThresholds(): void {
    if (this.debugMode) {
      if (this.contextCount >= this.criticalThreshold) {
        console.error(
          `[Canvas Debug] CRITICAL: ${this.contextCount} active canvas contexts! GPU exhaustion imminent!`,
        );
        this.logStatus();
      } else if (this.contextCount >= this.warningThreshold) {
        console.warn(
          `[Canvas Debug] WARNING: ${this.contextCount} active canvas contexts approaching limit`,
        );
      }
    }
  }

  getActiveCanvasCount(): number {
    return this.contextCount;
  }

  getTotalContextsCreated(): number {
    return this.totalContextsCreated;
  }

  getEstimatedMemoryUsage(): number {
    let totalPixels = 0;
    this.canvases.forEach((info) => {
      totalPixels += info.width * info.height;
    });
    return totalPixels * 4;
  }

  logStatus(): void {
    if (this.debugMode) {
      console.group("[Canvas Debug] Status Report");
      console.log(`Active contexts: ${this.contextCount}`);
      console.log(`Total created: ${this.totalContextsCreated}`);
      console.log(
        `Estimated GPU memory: ${
          (
            this.getEstimatedMemoryUsage() /
            1024 /
            1024
          ).toFixed(2)
        } MB`,
      );

      if (this.canvases.size > 0) {
        console.group("Active canvases:");
        this.canvases.forEach((info, id) => {
          const age = Date.now() - info.createdAt;
          console.log(
            `  ${id}: ${info.component} (${info.type}, ${info.width}x${info.height}, age: ${age}ms)`,
          );
        });
        console.groupEnd();
      }

      console.groupEnd();
    }
  }

  getDebugInfo(): {
    active: number;
    total: number;
    memory: string;
    canvases: CanvasInfo[];
  } {
    return {
      active: this.contextCount,
      total: this.totalContextsCreated,
      memory: `${(this.getEstimatedMemoryUsage() / 1024 / 1024).toFixed(2)} MB`,
      canvases: Array.from(this.canvases.values()),
    };
  }
}

export const canvasDebugger = new CanvasDebugger();

export function trackCanvas(
  canvas: HTMLCanvasElement,
  component: string,
  type: "2d" | "webgl" | "webgl2" = "2d",
): string {
  const id = `${component}-${Date.now()}-${
    Math.random()
      .toString(36)
      .substring(2, 11)
  }`;
  canvasDebugger.registerCanvas(id, canvas, type, component);
  return id;
}

export function untrackCanvas(id: string): void {
  canvasDebugger.unregisterCanvas(id);
}

export function releaseCanvasGPUMemory(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
