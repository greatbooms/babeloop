import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  compositeCharacter,
  hasAlphaChannel,
  obtainCutout,
} from './character-composite';
import { removeBackground } from './background-removal';

jest.mock('./background-removal', () => ({ removeBackground: jest.fn() }));

async function png(width: number, height: number, color: string): Promise<Buffer> {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

describe('character composite media helpers', () => {
  beforeEach(() => {
    jest.mocked(removeBackground).mockReset();
  });

  it('keeps an alpha source byte-for-byte and stores it under the prescribed cutout cache', async () => {
    const source = await png(20, 20, 'rgba(255, 0, 0, 0.5)');
    const storage = { head: jest.fn().mockResolvedValue(null), getBuffer: jest.fn(), putBuffer: jest.fn() };

    const result = await obtainCutout({ sourceBuffer: source, sourceContentType: 'image/png', sourceKey: 'generated-image-1', storage });

    expect(await hasAlphaChannel(source)).toBe(true);
    expect(result.buffer).toEqual(source);
    expect(result.cutoutKey).toMatch(/^cutouts\/generated-image-1\/[a-f0-9]{64}\.png$/);
    expect(storage.putBuffer).toHaveBeenCalledWith(result.cutoutKey, source, 'image/png');
    expect(removeBackground).not.toHaveBeenCalled();
  });

  it('removes an opaque background locally once, stores a PNG, and reuses the cached cutout', async () => {
    const source = await png(20, 20, '#ffffff');
    const generated = await png(20, 20, 'rgba(0, 0, 255, 0.5)');
    const cached = new Map<string, Buffer>();
    const storage = {
      head: jest.fn(async (key: string) => cached.has(key) ? { sizeBytes: cached.get(key)!.length } : null),
      getBuffer: jest.fn(async (key: string) => cached.get(key)!),
      putBuffer: jest.fn(async (key: string, body: Buffer) => { cached.set(key, body); }),
    };
    jest.mocked(removeBackground).mockResolvedValue(generated);

    const first = await obtainCutout({ sourceBuffer: source, sourceContentType: 'image/png', sourceKey: 'media-asset-1', storage });
    const second = await obtainCutout({ sourceBuffer: source, sourceContentType: 'image/png', sourceKey: 'media-asset-1', storage });

    expect(first).toEqual(second);
    expect(second.buffer).toEqual(generated);
    expect(removeBackground).toHaveBeenCalledTimes(1);
    expect(removeBackground).toHaveBeenCalledWith(source);
    expect(storage.putBuffer).toHaveBeenCalledWith(first.cutoutKey, generated, 'image/png');
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
