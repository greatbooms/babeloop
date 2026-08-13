import { resizeImageToSpec } from './image-resize';

const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('resizeImageToSpec', () => {
  it('실제 PNG를 중앙 크롭하고 lanczos로 정확한 PNG 픽셀 규격을 만든다', async () => {
    const resized = await resizeImageToSpec(ONE_PIXEL_PNG, 8, 8);

    expect(resized.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(resized.readUInt32BE(16)).toBe(8);
    expect(resized.readUInt32BE(20)).toBe(8);
  });
});
