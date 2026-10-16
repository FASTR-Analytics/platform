// Builds demo_video/rough_cut.mp4 from cut_list.json: every cut is encoded to
// an exact frame count, the last cut of a section is held to its narration
// clip, sections and the end card are concatenated, and the narration plus a
// silent tail are muxed in. Run from the repo root:
//   deno run --allow-read --allow-write --allow-run demo_video/src/assemble.ts

type Cut = {
  source: string;
  in?: number;
  duration: number;
  speed?: number;
  crop?: string;
};
type Section = { audio: string; cuts: Cut[] };
type CutList = { shotCrop: string; sections: Section[]; end: Cut };

const FPS = 30;
const ROOT = "demo_video";
const OUT = `${ROOT}/rough_cut.mp4`;
const END_SILENCE_PAD = 0.05;

async function run(args: string[]): Promise<string> {
  const { code, stdout, stderr } = await new Deno.Command(args[0], {
    args: args.slice(1),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (code !== 0) {
    throw new Error(
      `${args.join(" ")}\n${new TextDecoder().decode(stderr)}`,
    );
  }
  return new TextDecoder().decode(stdout);
}

async function probeDuration(path: string): Promise<number> {
  const out = await run([
    "ffprobe",
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    path,
  ]);
  return Number(out.trim());
}

const toFrames = (seconds: number): number => Math.round(seconds * FPS);
const isStill = (source: string): boolean => /\.png$/i.test(source);

function videoFilter(cut: Cut, crop: string | undefined): string {
  const speed = cut.speed ?? 1;
  const parts: string[] = [];
  if (crop) parts.push(`crop=${crop}`);
  if (speed !== 1) parts.push(`setpts=PTS/${speed}`);
  parts.push(
    `fps=${FPS}`,
    "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos",
    "pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
    "tpad=stop_mode=clone:stop=-1",
    "format=yuv420p",
  );
  return parts.join(",");
}

async function encodeCut(
  cut: Cut,
  frames: number,
  crop: string | undefined,
  out: string,
): Promise<void> {
  const src = `${ROOT}/${cut.source}`;
  const speed = cut.speed ?? 1;
  const span = (frames / FPS) * speed;
  const input = isStill(cut.source)
    ? ["-loop", "1", "-framerate", String(FPS), "-i", src]
    : ["-ss", String(cut.in ?? 0), "-t", String(span + 1), "-i", src];
  if (!isStill(cut.source)) {
    const available = await probeDuration(src) - (cut.in ?? 0);
    if (available + 0.05 < span) {
      console.warn(
        `  hold: ${cut.source} has ${available.toFixed(1)} s after ${
          cut.in ?? 0
        } s, cut needs ${span.toFixed(1)} s`,
      );
    }
  }
  await run([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    ...input,
    "-an",
    "-vf",
    videoFilter(cut, crop),
    "-frames:v",
    String(frames),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-r",
    String(FPS),
    out,
  ]);
}

async function main(): Promise<void> {
  const list: CutList = JSON.parse(
    await Deno.readTextFile(`${ROOT}/src/cut_list.json`),
  );
  const work = await Deno.makeTempDir({ prefix: "rough_cut_" });
  const parts: string[] = [];
  let audioTotal = 0;
  let videoFrames = 0;
  const cropFor = (cut: Cut): string | undefined =>
    cut.crop ?? (cut.source.startsWith("shots/") ? list.shotCrop : undefined);

  for (const [s, section] of list.sections.entries()) {
    const clipLength = await probeDuration(`${ROOT}/${section.audio}`);
    audioTotal += clipLength;
    const sectionFrames = toFrames(clipLength);
    const planned = section.cuts.reduce((n, c) => n + toFrames(c.duration), 0);
    if (planned > sectionFrames) {
      throw new Error(
        `section ${s + 1}: cuts total ${
          (planned / FPS).toFixed(2)
        } s, clip is ${clipLength.toFixed(2)} s`,
      );
    }
    console.log(
      `section ${s + 1}: ${clipLength.toFixed(2)} s, cuts ${
        (planned / FPS).toFixed(2)
      } s, hold ${((sectionFrames - planned) / FPS).toFixed(2)} s`,
    );
    let used = 0;
    for (const [c, cut] of section.cuts.entries()) {
      const last = c === section.cuts.length - 1;
      const frames = last ? sectionFrames - used : toFrames(cut.duration);
      const out = `${work}/s${s + 1}_c${String(c + 1).padStart(2, "0")}.mp4`;
      console.log(
        `  ${cut.source} @${cut.in ?? 0}s x${
          cut.speed ?? 1
        } -> ${frames} frames`,
      );
      await encodeCut(cut, frames, cropFor(cut), out);
      parts.push(out);
      used += frames;
    }
    videoFrames += sectionFrames;
  }
  const endFrames = toFrames(list.end.duration);
  const endOut = `${work}/end.mp4`;
  await encodeCut(list.end, endFrames, cropFor(list.end), endOut);
  parts.push(endOut);
  videoFrames += endFrames;

  const concatList = `${work}/video.txt`;
  await Deno.writeTextFile(
    concatList,
    parts.map((p) => `file '${p}'`).join("\n") + "\n",
  );
  const video = `${work}/video.mp4`;
  await run([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatList,
    "-c",
    "copy",
    video,
  ]);

  const audioInputs = list.sections.flatMap((
    s,
  ) => ["-i", `${ROOT}/${s.audio}`]);
  const n = list.sections.length;
  const silence = videoFrames / FPS - audioTotal + END_SILENCE_PAD;
  const audio = `${work}/audio.m4a`;
  await run([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    ...audioInputs,
    "-f",
    "lavfi",
    "-t",
    silence.toFixed(3),
    "-i",
    "anullsrc=r=44100:cl=mono",
    "-filter_complex",
    `${Array.from({ length: n + 1 }, (_, i) => `[${i}:a]`).join("")}concat=n=${
      n + 1
    }:v=0:a=1[a]`,
    "-map",
    "[a]",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    audio,
  ]);

  await run([
    "ffmpeg",
    "-y",
    "-loglevel",
    "error",
    "-i",
    video,
    "-i",
    audio,
    "-c",
    "copy",
    "-shortest",
    "-movflags",
    "+faststart",
    OUT,
  ]);
  await Deno.remove(work, { recursive: true });
  console.log(
    `${OUT}: ${(videoFrames / FPS).toFixed(2)} s video, ${
      audioTotal.toFixed(2)
    } s narration`,
  );
}

if (import.meta.main) await main();
