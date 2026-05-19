// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { join } from "./deps.ts";

const SECONDS_AT_START_OF_EACH_CLIP = 0.3;
const SECONDS_AT_END_OF_EACH_CLIP = 0.5;

function extractNumber(str: string): number {
  const arr = str.match(/[0-9]+/);
  if (!arr || arr.length !== 1) {
    throw new Error(`No number found in filename: ${str}`);
  }
  const n = Number(arr[0]);
  if (isNaN(n)) {
    throw new Error(`Invalid number in filename: ${str}`);
  }
  return n;
}

export type MakeVideoOptions = {
  secondsAtStartOfEachClip?: number;
  secondsAtEndOfEachClip?: number;
  silenceThresholdDb?: number;
};

export async function makeVideoFromImagesAndAudio(
  imagesDir: string,
  audioDir: string,
  mp4FilePath: string,
  options?: MakeVideoOptions,
): Promise<void> {
  const secondsAtStart = options?.secondsAtStartOfEachClip ??
    SECONDS_AT_START_OF_EACH_CLIP;
  const secondsAtEnd = options?.secondsAtEndOfEachClip ??
    SECONDS_AT_END_OF_EACH_CLIP;
  const silenceThreshold = options?.silenceThresholdDb ?? -50;

  const audioFiles: { fileName: string; sortOrder: number }[] = [];
  const imageFiles: { fileName: string; sortOrder: number }[] = [];

  for await (const dirEntry of Deno.readDir(audioDir)) {
    if (dirEntry.name === ".DS_Store") {
      continue;
    }
    audioFiles.push({
      fileName: dirEntry.name,
      sortOrder: extractNumber(dirEntry.name),
    });
  }

  audioFiles.sort((a, b) => a.sortOrder - b.sortOrder);

  for await (const dirEntry of Deno.readDir(imagesDir)) {
    if (dirEntry.name === ".DS_Store") {
      continue;
    }
    imageFiles.push({
      fileName: dirEntry.name,
      sortOrder: extractNumber(dirEntry.name),
    });
  }

  imageFiles.sort((a, b) => a.sortOrder - b.sortOrder);

  if (audioFiles.length !== imageFiles.length) {
    throw new Error(
      `Mismatched files: ${imageFiles.length} images, ${audioFiles.length} audio clips`,
    );
  }

  const tempVideoDir = Deno.makeTempDirSync();
  const mylistFilePath = join(tempVideoDir, `mylist.txt`);
  let mylistStr = "";

  for (let i = 0; i < imageFiles.length; i++) {
    const tempTrimmedAudioClipFilePath = join(
      tempVideoDir,
      `trimmed-${audioFiles[i].fileName}`,
    );

    // Step 1: Trim silence and normalize audio
    const p1 = new Deno.Command("ffmpeg", {
      args: [
        "-y",
        "-i",
        join(audioDir, audioFiles[i].fileName),
        "-af",
        [
          // Remove silence from start
          `silenceremove=start_periods=1:start_silence=0.1:start_threshold=${silenceThreshold}dB`,
          "areverse",
          // Remove silence from end (reversed, so treating as start)
          `silenceremove=start_periods=1:start_silence=0.1:start_threshold=${silenceThreshold}dB`,
          // Add padding at end (which is start after reverse)
          `apad=pad_dur=${secondsAtStart}`,
          "areverse",
          // Add padding at end
          `apad=pad_dur=${secondsAtEnd}`,
        ].join(","),
        tempTrimmedAudioClipFilePath,
      ],
    });

    const s1 = await p1.output();
    if (!s1.success) {
      const decoder = new TextDecoder();
      console.error(decoder.decode(s1.stderr));
      throw new Error(`FFmpeg audio processing failed for clip ${i + 1}`);
    }

    // Step 2: Create video clip from image + audio
    const tempVideoClipFileName = `temp-video-clip-${i + 1}.mp4`;
    const tempVideoClipFilePath = join(tempVideoDir, tempVideoClipFileName);

    const p2 = new Deno.Command("ffmpeg", {
      args: [
        "-y",
        "-loop",
        "1",
        "-i",
        join(imagesDir, imageFiles[i].fileName),
        "-i",
        tempTrimmedAudioClipFilePath,
        "-c:v",
        "libx264",
        "-tune",
        "stillimage",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-pix_fmt",
        "yuv420p",
        "-shortest",
        "-fflags",
        "shortest",
        tempVideoClipFilePath,
      ],
    });

    const s2 = await p2.output();
    if (!s2.success) {
      const decoder = new TextDecoder();
      console.error(decoder.decode(s2.stderr));
      throw new Error(`FFmpeg video creation failed for clip ${i + 1}`);
    }

    mylistStr += `file '${tempVideoClipFileName}'\n`;
    console.log(`Processed clip ${i + 1}/${imageFiles.length}`);
  }

  await Deno.writeTextFile(mylistFilePath, mylistStr);

  // Step 3: Concatenate all video clips
  const p3 = new Deno.Command("ffmpeg", {
    args: [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      mylistFilePath,
      "-c",
      "copy",
      mp4FilePath,
    ],
  });

  const s3 = await p3.output();
  if (!s3.success) {
    const decoder = new TextDecoder();
    console.error(decoder.decode(s3.stderr));
    throw new Error("FFmpeg concatenation failed");
  }

  // Cleanup temp directory
  try {
    await Deno.remove(tempVideoDir, { recursive: true });
  } catch {
    // Cleanup failure is non-fatal; temp dir will be cleaned by OS
  }

  console.log(`Video created: ${mp4FilePath}`);
}
