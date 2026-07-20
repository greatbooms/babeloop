import { writeFile } from 'fs/promises';
import { extractVideoThumbnail } from './video-thumbnail';

describe('extractVideoThumbnail', () => {
  it('1초 프레임을 480px JPEG로 추출하는 ffmpeg 인자를 구성한다', async () => {
    const run = jest.fn(async (_binary: string, args: string[]) => {
      await writeFile(args.at(-2)!, Buffer.from('jpeg'));
    });

    const thumbnail = await extractVideoThumbnail(Buffer.from('video'), {
      ffmpegPath: '/test/ffmpeg',
      run,
    });

    expect(thumbnail).toEqual(Buffer.from('jpeg'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0][0]).toBe('/test/ffmpeg');
    expect(run.mock.calls[0][1]).toEqual([
      '-ss',
      '1',
      '-i',
      expect.stringMatching(/\/input$/),
      '-frames:v',
      '1',
      '-vf',
      'scale=480:-2',
      '-q:v',
      '4',
      expect.stringMatching(/\/thumb\.jpg$/),
      '-y',
    ]);
  });
});
