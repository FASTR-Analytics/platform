// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { writeSequenceFrames } from "./deps.ts";
import type { SequenceExportOptions, SequenceInputs } from "./deps.ts";
import { makeVideoFromTimedFrames } from "./make_video_from_timed_frames.ts";

export async function renderSequenceVideo(
  sequence: SequenceInputs,
  mp4FilePath: string,
  opts: SequenceExportOptions,
): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "sequence_frames_" });
  try {
    const frames = await writeSequenceFrames(dir, sequence, opts);
    await makeVideoFromTimedFrames(frames, mp4FilePath, opts.fps);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}
