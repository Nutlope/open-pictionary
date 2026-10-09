import { CLIP_FPS, CLIP_H, CLIP_W, clipCache, drawClip, timeline, type ClipDoc } from "./clip";

/**
 * Turn a clip into an MP4 (H.264), faster than real time, in the browser.
 * WebCodecs does the encoding and Mediabunny writes the file; both load only
 * when someone asks for a video. Falls back to 720p where 1080p will not encode.
 */
const SIZES = [
  [CLIP_W, CLIP_H],
  [720, 1280],
] as const;

let support: Promise<readonly [number, number] | null> | null = null;

export function videoSupport() {
  support ??= (async () => {
    if (typeof window === "undefined" || !("VideoEncoder" in window)) return null;
    try {
      const { canEncodeVideo } = await import("mediabunny");
      for (const [w, h] of SIZES) if (await canEncodeVideo("avc", { width: w, height: h })) return [w, h] as const;
    } catch {}
    return null;
  })();
  return support;
}

export async function encodeClip(doc: ClipDoc, family: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Blob> {
  const size = await videoSupport();
  if (!size) throw new Error("This browser cannot make videos.");
  const [w, h] = size;
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import("mediabunny");

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("No canvas.");

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: "avc", quality: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate: CLIP_FPS });
  await output.start();

  const cache = clipCache(doc, family);
  const frames = Math.ceil(timeline(doc).total * CLIP_FPS);
  try {
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      ctx.setTransform(w / CLIP_W, 0, 0, h / CLIP_H, 0, 0);
      drawClip(ctx, doc, i / CLIP_FPS, cache);
      await source.add(i / CLIP_FPS, 1 / CLIP_FPS);
      onProgress?.((i + 1) / frames);
    }
    await output.finalize();
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  }
  return new Blob([(output.target as InstanceType<typeof BufferTarget>).buffer!], { type: "video/mp4" });
}
