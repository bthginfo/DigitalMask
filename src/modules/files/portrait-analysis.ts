import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { FaceDetector } from "@tensorflow-models/face-detection";
import type { io } from "@tensorflow/tfjs-core";

export interface PortraitFocus {
  x: number;
  y: number;
  faceWidth: number;
  faceHeight: number;
  detected: boolean;
  version: 1;
}
export interface PortraitMetadata {
  width: number;
  height: number;
  portraitFocus: PortraitFocus;
}
export const fallbackPortraitFocus: PortraitFocus = {
  x: 0.5,
  y: 0.24,
  faceWidth: 0,
  faceHeight: 0,
  detected: false,
  version: 1,
};
const normalized = (value: number) => Math.max(0, Math.min(1, value));
let detectorPromise: Promise<FaceDetector> | undefined;
let analysisQueue: Promise<unknown> = Promise.resolve();

async function loadDetector() {
  // Local weights only: photos never leave our server for analysis. Reuse the model while warm.
  const [tf, detection] = await Promise.all([
    import("@tensorflow/tfjs-core"),
    import("@tensorflow-models/face-detection"),
    import("@tensorflow/tfjs-backend-cpu"),
  ]);
  await tf.setBackend("cpu");
  await tf.ready();
  const directory = join(process.cwd(), "src/modules/files/assets/face-detection");
  const [modelText, weights] = await Promise.all([
    readFile(join(directory, "model.json"), "utf8"),
    readFile(join(directory, "group1-shard1of1.bin")),
  ]);
  const model = JSON.parse(modelText);
  const artifacts: io.ModelArtifacts = {
    modelTopology: model.modelTopology,
    weightSpecs: model.weightsManifest.flatMap(
      (group: { weights: io.WeightsManifestEntry[] }) => group.weights,
    ),
    weightData: weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength),
    format: model.format,
    generatedBy: model.generatedBy,
    convertedBy: model.convertedBy,
  };
  return detection.createDetector(detection.SupportedModels.MediaPipeFaceDetector, {
    runtime: "tfjs",
    modelType: "short",
    maxFaces: 3,
    detectorModelUrl: tf.io.fromMemory(artifacts),
  });
}

/** A small, one-time geometry calculation at import/upload; no identity recognition or DB reads. */
export async function analyzePortrait(bytes: Buffer): Promise<PortraitMetadata> {
  const original = await sharp(bytes).metadata();
  const metadata: PortraitMetadata = {
    width: original.width || 1,
    height: original.height || 1,
    portraitFocus: { ...fallbackPortraitFocus },
  };
  const analyze = async () => {
    const detector = await (detectorPromise ??= loadDetector());
    const tf = await import("@tensorflow/tfjs-core");
    const { data, info } = await sharp(bytes)
      .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const input = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], "int32");
    try {
      const faces = await detector.estimateFaces(input);
      const face = faces.sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0];
      if (face && face.box.width > 0 && face.box.height > 0) {
        metadata.portraitFocus = {
          x: normalized((face.box.xMin + face.box.width / 2) / info.width),
          y: normalized((face.box.yMin + face.box.height / 2) / info.height),
          faceWidth: normalized(face.box.width / info.width),
          faceHeight: normalized(face.box.height / info.height),
          detected: true,
          version: 1,
        };
      }
    } finally {
      input.dispose();
    }
  };
  // Serial inference bounds memory when several photos arrive in the same import batch.
  const work = analysisQueue.then(analyze);
  analysisQueue = work.catch(() => {});
  try {
    await work;
  } catch {
    // A missing/unrecognizable face must not prevent an otherwise valid image upload.
  }
  return metadata;
}
