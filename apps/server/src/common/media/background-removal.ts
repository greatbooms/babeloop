import { createCanvas, loadImage } from '@napi-rs/canvas';
import { access } from 'fs/promises';
import path from 'path';

const MODEL_SIZE = 1024;
const MODEL_PIXELS = MODEL_SIZE * MODEL_SIZE;

type CutoutSession = {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>>;
};

type OnnxRuntime = {
  InferenceSession: {
    create(modelPath: string): Promise<CutoutSession>;
  };
  Tensor: new (
    type: 'float32',
    data: Float32Array,
    dimensions: readonly number[],
  ) => unknown;
};

export type CutoutInference = (input: Float32Array) => Promise<Float32Array>;

let cutoutSessionPromise: Promise<CutoutSession> | undefined;

function cutoutModelPath(): string {
  return process.env.CUTOUT_MODEL_PATH
    ?? path.join(process.cwd(), 'models/isnet-anime.onnx');
}

function loadOnnxRuntime(): OnnxRuntime {
  // Runtime loading stays behind the model check so a missing model reports the actionable cause first.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('onnxruntime-node') as OnnxRuntime;
}

export async function loadCutoutSession(): Promise<CutoutSession> {
  const modelPath = cutoutModelPath();
  try {
    await access(modelPath);
  } catch {
    throw new Error(
      `배경 제거 모델이 없습니다: ${modelPath} — models/isnet-anime.onnx를 내려받으세요`,
    );
  }

  if (!cutoutSessionPromise) {
    cutoutSessionPromise = loadOnnxRuntime().InferenceSession.create(modelPath);
  }

  try {
    return await cutoutSessionPromise;
  } catch (error) {
    cutoutSessionPromise = undefined;
    throw error;
  }
}

export const runInference: CutoutInference = async (input) => {
  if (input.length !== MODEL_PIXELS * 3) {
    throw new Error(`배경 제거 모델 입력 크기가 올바르지 않습니다: ${input.length}`);
  }

  const session = await loadCutoutSession();
  const inputName = session.inputNames[0];
  if (!inputName) throw new Error('배경 제거 모델 입력 이름이 없습니다');

  const runtime = loadOnnxRuntime();
  const tensor = new runtime.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const outputs = await session.run({ [inputName]: tensor });
  const outputName = session.outputNames[0] ?? Object.keys(outputs)[0];
  const output = outputName ? outputs[outputName] : undefined;
  if (!output) throw new Error('배경 제거 모델 출력이 없습니다');

  return output.data instanceof Float32Array
    ? output.data
    : Float32Array.from(output.data);
};

export async function removeBackground(
  buffer: Buffer,
  inference: CutoutInference = runInference,
): Promise<Buffer> {
  const image = await loadImage(buffer);
  const inputCanvas = createCanvas(MODEL_SIZE, MODEL_SIZE);
  const inputContext = inputCanvas.getContext('2d');
  inputContext.drawImage(image, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const rgba = inputContext.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data;
  const chw = new Float32Array(MODEL_PIXELS * 3);

  for (let pixel = 0; pixel < MODEL_PIXELS; pixel += 1) {
    const rgbaOffset = pixel * 4;
    chw[pixel] = rgba[rgbaOffset] / 255;
    chw[MODEL_PIXELS + pixel] = rgba[rgbaOffset + 1] / 255;
    chw[(MODEL_PIXELS * 2) + pixel] = rgba[rgbaOffset + 2] / 255;
  }

  const saliency = await inference(chw);
  if (saliency.length < MODEL_PIXELS) {
    throw new Error(`배경 제거 모델 출력 크기가 올바르지 않습니다: ${saliency.length}`);
  }

  const maskCanvas = createCanvas(MODEL_SIZE, MODEL_SIZE);
  const maskContext = maskCanvas.getContext('2d');
  const maskImageData = maskContext.createImageData(MODEL_SIZE, MODEL_SIZE);
  for (let pixel = 0; pixel < MODEL_PIXELS; pixel += 1) {
    const value = Math.min(1, Math.max(0, saliency[pixel]));
    const alpha = value <= 0.05 ? 0 : Math.round(value * 255);
    const offset = pixel * 4;
    maskImageData.data[offset] = alpha;
    maskImageData.data[offset + 1] = alpha;
    maskImageData.data[offset + 2] = alpha;
    maskImageData.data[offset + 3] = 255;
  }
  maskContext.putImageData(maskImageData, 0, 0);

  const outputCanvas = createCanvas(image.width, image.height);
  const outputContext = outputCanvas.getContext('2d');
  outputContext.drawImage(image, 0, 0, image.width, image.height);
  const outputImageData = outputContext.getImageData(0, 0, image.width, image.height);

  const resizedMaskCanvas = createCanvas(image.width, image.height);
  const resizedMaskContext = resizedMaskCanvas.getContext('2d');
  resizedMaskContext.imageSmoothingEnabled = true;
  resizedMaskContext.drawImage(maskCanvas, 0, 0, image.width, image.height);
  const resizedMask = resizedMaskContext.getImageData(0, 0, image.width, image.height).data;

  for (let offset = 3; offset < outputImageData.data.length; offset += 4) {
    outputImageData.data[offset] = resizedMask[offset - 3];
  }
  outputContext.putImageData(outputImageData, 0, 0);

  return outputCanvas.toBuffer('image/png');
}
