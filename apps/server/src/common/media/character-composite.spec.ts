import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  compositeCharacter,
  hasAlphaChannel,
  obtainCutout,
} from './character-composite';

async function png(width: number, height: number, color: string): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

describe('character composite media helpers', () => {
  it('keeps an alpha source byte-for-byte and stores it under the prescribed cutout cache', async () => {
    const source = await png(20, 20, 'rgba(255, 0, 0, 0.5)');
    const storage = { head: jest.fn().mockResolvedValue(null), getBuffer: jest.fn(), putBuffer: jest.fn() };
    const imageAi = { name: 'mock', model: 'mock-image-1', generate: jest.fn() };
    const aiLog = { record: jest.fn() };

    const result = await obtainCutout({ sourceBuffer: source, sourceContentType: 'image/png', sourceKey: 'generated-image-1', storage, imageAi, aiLog });

    expect(await hasAlphaChannel(source)).toBe(true);
    expect(result.buffer).toEqual(source);
    expect(result.cutoutKey).toMatch(/^cutouts\/generated-image-1\/[a-f0-9]{64}\.png$/);
    expect(storage.putBuffer).toHaveBeenCalledWith(result.cutoutKey, source, 'image/png');
    expect(imageAi.generate).not.toHaveBeenCalled();
    expect(aiLog.record).not.toHaveBeenCalled();
  });

  it('reuses a cached cutout without making a second AI request', async () => {
    const source = await png(20, 20, '#ffffff');
    const generated = await png(20, 20, 'rgba(0, 0, 255, 0.5)');
    const cached = new Map<string, Buffer>();
    const storage = {
      head: jest.fn(async (key: string) => cached.has(key) ? { sizeBytes: cached.get(key)!.length } : null),
      getBuffer: jest.fn(async (key: string) => cached.get(key)!),
      putBuffer: jest.fn(async (key: string, body: Buffer) => { cached.set(key, body); }),
    };
    const imageAi = {
      name: 'mock',
      model: 'mock-image-1',
      generate: jest.fn().mockResolvedValue({ images: [{ buffer: generated, contentType: 'image/png' }] }),
    };
    const aiLog = { record: jest.fn(async (_meta: unknown, run: () => Promise<unknown>) => run()) };

    const first = await obtainCutout({ sourceBuffer: source, sourceContentType: 'image/png', sourceKey: 'media-asset-1', storage, imageAi, aiLog });
    const second = await obtainCutout({ sourceBuffer: source, sourceContentType: 'image/png', sourceKey: 'media-asset-1', storage, imageAi, aiLog });

    expect(first).toEqual(second);
    expect(second.buffer).toEqual(generated);
    expect(imageAi.generate).toHaveBeenCalledTimes(1);
    expect(aiLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ promptVersion: 'character-cutout@v1', inputRef: 'character-cutout:media-asset-1' }),
      expect.any(Function),
    );
  });

  it('keeps a JPEG source MIME for the AI input and uses the returned cutout MIME in storage', async () => {
    const canvas = createCanvas(20, 20);
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 20, 20);
    const source = canvas.toBuffer('image/jpeg');
    const generated = await png(20, 20, 'rgba(0, 0, 255, 0.5)');
    const storage = { head: jest.fn().mockResolvedValue(null), getBuffer: jest.fn(), putBuffer: jest.fn() };
    const imageAi = {
      name: 'mock',
      model: 'mock-image-1',
      generate: jest.fn().mockResolvedValue({ images: [{ buffer: generated, contentType: 'image/webp' }] }),
    };
    const aiLog = { record: jest.fn(async (_meta: unknown, run: () => Promise<unknown>) => run()) };

    const result = await obtainCutout({
      sourceBuffer: source,
      sourceContentType: 'image/jpeg',
      sourceKey: 'media-asset-jpeg',
      storage,
      imageAi,
      aiLog,
    });

    expect(imageAi.generate).toHaveBeenCalledWith(expect.objectContaining({
      referenceImages: [{ buffer: source, contentType: 'image/jpeg' }],
    }));
    expect(storage.putBuffer).toHaveBeenCalledWith(result.cutoutKey, generated, 'image/webp');
  });

  it('places a height-scaled character at the requested side and bottom edge', async () => {
    const background = await png(100, 100, '#ffffff');
    const cutout = await png(20, 40, '#ff0000');

    const result = await compositeCharacter(background, cutout, { position: 'LEFT', heightRatio: 0.5 });
    const image = await loadImage(result);
    const canvas = createCanvas(100, 100);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    expect(Array.from(context.getImageData(5, 99, 1, 1).data.slice(0, 3))).toEqual([255, 0, 0]);
    expect(Array.from(context.getImageData(28, 50, 1, 1).data.slice(0, 3))).toEqual([255, 0, 0]);
    expect(Array.from(context.getImageData(29, 50, 1, 1).data.slice(0, 3))).toEqual([255, 255, 255]);
  });
});
