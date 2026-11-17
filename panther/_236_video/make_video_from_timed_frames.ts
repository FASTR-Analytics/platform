// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { TimedFrame } from "./deps.ts";

// A PNG input's time base is 1/25 s, to which the concat demuxer rounds each
// file's start, so every file is read at the video's frame rate. The demuxer
// honours the last file's duration only when the file is listed again, and
// that repeat adds a hold of its own, so the output is cut at the timeline's
// frame count. Frames are scaled to even dimensions, which yuv420p (the pixel
// format every player decodes) needs.
export async function makeVideoFromTimedFrames(
  frames: TimedFrame[],
  mp4FilePath: string,
  fps: number,
): Promise<void> {
  const last = frames.at(-1);
  if (last === undefined) {
    throw new Error("A video needs at least one frame");
  }
  const file = (path: string) =>
    `file '${path.replaceAll("'", "'\\''")}'\noption framerate ${fps}\n`;
  const listPath = await Deno.makeTempFile({ suffix: ".txt" });
  try {
    await Deno.writeTextFile(
      listPath,
      frames.map((f) => `${file(f.path)}duration ${f.seconds}\n`).join("") +
        file(last.path),
    );
    const totalSeconds = frames.reduce((sum, f) => sum + f.seconds, 0);
    const p = new Deno.Command("ffmpeg", {
      args: [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        listPath,
        "-frames:v",
        String(Math.round(totalSeconds * fps)),
        "-vf",
        `fps=${fps},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        mp4FilePath,
      ],
    });
    const out = await p.output();
    if (!out.success) {
      console.error(new TextDecoder().decode(out.stderr));
      throw new Error("FFmpeg timed frame concatenation failed");
    }
  } finally {
    await Deno.remove(listPath);
  }
}
