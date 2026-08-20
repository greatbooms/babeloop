import { createHash } from 'crypto';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { Logger } from '@nestjs/common';
import { removeBackground } from './background-removal';

export type CharacterPosition = 'LEFT' | 'CENTER' | 'RIGHT';

export type CharacterCompositeConfig = {
  position: CharacterPosition;
  heightRatio: number;
};

const logger = new Logger('CharacterComposite');

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
}): Promise<{ buffer: Buffer; cutoutKey: string }> {
  const hash = createHash('sha256').update(input.sourceBuffer).digest('hex');
  const cutoutKey = `cutouts/${input.sourceKey}/${hash}.png`;
  if (await input.storage.head(cutoutKey)) {
    return { buffer: await input.storage.getBuffer(cutoutKey), cutoutKey };
  }

  let cutout = input.sourceBuffer;
  let cutoutContentType = input.sourceContentType;
  if (!await hasAlphaChannel(input.sourceBuffer)) {
    logger.log(`로컬 배경 제거 시작: ${input.sourceKey} (외부 호출 없음, 비용 $0)`);
    cutout = await removeBackground(input.sourceBuffer);
    cutoutContentType = 'image/png';
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
