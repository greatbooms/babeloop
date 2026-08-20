import { createCanvas, loadImage } from '@napi-rs/canvas';
import path from 'path';
import {
  loadCutoutSession,
  removeBackground,
  type CutoutInference,
} from './background-removal';

async function opaquePng(width: number, height: number): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

describe('local background removal', () => {
  it('applies mocked half saliency as half transparency without loading the model', async () => {
    const source = await opaquePng(2, 2);
    const saliency = new Float32Array(1024 * 1024).fill(0.5);
    const inference = jest
      .fn<ReturnType<CutoutInference>, Parameters<CutoutInference>>()
      .mockResolvedValue(saliency);

    const result = await removeBackground(source, inference);
    const image = await loadImage(result);
    const canvas = createCanvas(2, 2);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, 2, 2).data;

    expect(inference).toHaveBeenCalledTimes(1);
    expect(inference).toHaveBeenCalledWith(expect.any(Float32Array));
    expect(pixels[3]).toBeGreaterThanOrEqual(127);
    expect(pixels[3]).toBeLessThanOrEqual(128);
    expect(pixels[7]).toBe(pixels[3]);
    expect(pixels[11]).toBe(pixels[3]);
    expect(pixels[15]).toBe(pixels[3]);
  });

  it('reports the configured path when the model file is missing', async () => {
    const previousPath = process.env.CUTOUT_MODEL_PATH;
    const missingPath = path.join(process.cwd(), 'models', 'missing-isnet-anime.onnx');
    process.env.CUTOUT_MODEL_PATH = missingPath;

    try {
      await expect(loadCutoutSession()).rejects.toThrow(
        `배경 제거 모델이 없습니다: ${missingPath} — models/isnet-anime.onnx를 내려받으세요`,
      );
    } finally {
      if (previousPath === undefined) delete process.env.CUTOUT_MODEL_PATH;
      else process.env.CUTOUT_MODEL_PATH = previousPath;
    }
  });
});
