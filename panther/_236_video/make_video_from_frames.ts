// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { join } from "./deps.ts";
import { extractNumber } from "./make_video_from_images_and_audio.ts";
import { makeVideoFromTimedFrames } from "./make_video_from_timed_frames.ts";

// The PNG frames in `framesDir`, in the order their file names' numbers
// give, each shown for one frame at `fps`.
export async function makeVideoFromFrames(
  framesDir: string,
  mp4FilePath: string,
  fps: number,
): Promise<void> {
  const frames: { name: string; order: number }[] = [];
  for await (const entry of Deno.readDir(framesDir)) {
    if (!entry.name.endsWith(".png")) {
      continue;
    }
    frames.push({ name: entry.name, order: extractNumber(entry.name) });
  }
  if (frames.length === 0) {
    throw new Error(`No PNG frames in ${framesDir}`);
  }
  frames.sort((a, b) => a.order - b.order);
  await makeVideoFromTimedFrames(
    frames.map((f) => ({ path: join(framesDir, f.name), seconds: 1 / fps })),
    mp4FilePath,
    fps,
  );
}
