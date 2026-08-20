import { createHash } from 'crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { ImageGenerationProvider } from '../../providers/image/image-generation.provider';

export type CharacterPosition = 'LEFT' | 'CENTER' | 'RIGHT';

export type CharacterCompositeConfig = {
  position: CharacterPosition;
  heightRatio: number;
};

type CutoutAiLogMeta = {
  provider: string;
  model: string;
  promptVersion: string;
  inputRef: string;
  costEstimateUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
};

type CutoutAiLog = {
  record(meta: CutoutAiLogMeta, run: () => Promise<unknown>): Promise<unknown>;
};

const CUTOUT_PROMPT = 'Extract ONLY the character exactly as drawn — identical colors, lines and details. Output on a fully transparent background. Do not add, remove or restyle anything.';

export async function hasAlphaChannel(buffer: Buffer): Promise<boolean> {
  const image = await loadImage(buffer);
  const scale = Math.min(1, 128 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] < 255) return true;
  }
  return false;
}

export async function obtainCutout(input: {
  sourceBuffer: Buffer;
  sourceContentType: string;
  sourceKey: string;
  storage: Pick<{ head(key: string): Promise<{ sizeBytes: number } | null>; getBuffer(key: string): Promise<Buffer>; putBuffer(key: string, body: Buffer, contentType: string): Promise<void> }, 'head' | 'getBuffer' | 'putBuffer'>;
  imageAi: ImageGenerationProvider;
  aiLog: CutoutAiLog;
}): Promise<{ buffer: Buffer; cutoutKey: string }> {
  const hash = createHash('sha256').update(input.sourceBuffer).digest('hex');
  const cutoutKey = `cutouts/${input.sourceKey}/${hash}.png`;
  if (await input.storage.head(cutoutKey)) {
    return { buffer: await input.storage.getBuffer(cutoutKey), cutoutKey };
  }

  let cutout = input.sourceBuffer;
  let cutoutContentType = input.sourceContentType;
  if (!await hasAlphaChannel(input.sourceBuffer)) {
    const meta: CutoutAiLogMeta = {
      provider: input.imageAi.name,
      model: input.imageAi.model,
      promptVersion: 'character-cutout@v1',
      inputRef: `character-cutout:${input.sourceKey}`,
    };
    await input.aiLog.record(meta, async () => {
      const generated = await input.imageAi.generate({
        prompt: CUTOUT_PROMPT,
        referenceImages: [{ buffer: input.sourceBuffer, contentType: input.sourceContentType }],
        transparentBackground: true,
        quality: 'high',
        count: 1,
      });
      const image = generated.images[0];
      if (!image) throw new Error('캐릭터 누끼 생성 결과가 없습니다');
      cutout = image.buffer;
      cutoutContentType = image.contentType;
      meta.costEstimateUsd = generated.costEstimateUsd;
      meta.inputTokens = generated.inputTokens;
      meta.outputTokens = generated.outputTokens;
      return { imageCount: 1, contentTypes: [image.contentType] };
    });
  }
  await input.storage.putBuffer(cutoutKey, cutout, cutoutContentType);
  return { buffer: cutout, cutoutKey };
}

export async function compositeCharacter(
  background: Buffer,
  cutout: Buffer,
  config: CharacterCompositeConfig,
): Promise<Buffer> {
  const [backgroundImage, cutoutImage] = await Promise.all([loadImage(background), loadImage(cutout)]);
  const canvas = createCanvas(backgroundImage.width, backgroundImage.height);
  const context = canvas.getContext('2d');
  context.drawImage(backgroundImage, 0, 0);
  const height = Math.max(1, Math.round(backgroundImage.height * config.heightRatio));
  const width = Math.max(1, Math.round(cutoutImage.width * (height / cutoutImage.height)));
  const margin = Math.round(backgroundImage.width * 0.04);
  const x = config.position === 'LEFT'
    ? margin
    : config.position === 'CENTER'
      ? Math.round((backgroundImage.width - width) / 2)
      : backgroundImage.width - width - margin;
  context.drawImage(cutoutImage, x, backgroundImage.height - height, width, height);
  return canvas.toBuffer('image/png');
}
