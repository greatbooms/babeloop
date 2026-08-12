import { OpenAIVideoGenerationProvider } from './openai-video-generation.provider';

describe('OpenAIVideoGenerationProvider', () => {
  const originalVideoApiKey = process.env.VIDEO_API_KEY;
  const originalTextAiApiKey = process.env.TEXT_AI_API_KEY;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalVideoApiKey === undefined) delete process.env.VIDEO_API_KEY;
    else process.env.VIDEO_API_KEY = originalVideoApiKey;
    if (originalTextAiApiKey === undefined) delete process.env.TEXT_AI_API_KEY;
    else process.env.TEXT_AI_API_KEY = originalTextAiApiKey;
  });

  it('첫 프레임 참고 이미지를 multipart input_reference로 첨부한다', async () => {
    process.env.VIDEO_API_KEY = 'test-only-key';
    const video = Buffer.from('mock-video');
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'video-1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'video-1', status: 'completed' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(video, { status: 200, headers: { 'content-type': 'video/mp4' } }),
      );
    const provider = new OpenAIVideoGenerationProvider();
    const reference = Buffer.from('first-frame');

    const result = await provider.generate({
      prompt: '세로형 광고 영상',
      seconds: 4,
      size: '720x1280',
      inputReference: { buffer: reference, contentType: 'image/png' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('https://api.openai.com/v1/videos');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ Authorization: 'Bearer test-only-key' });
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    expect(body.get('model')).toBe('sora-2');
    expect(body.get('prompt')).toBe('세로형 광고 영상');
    expect(body.get('seconds')).toBe('4');
    expect(body.get('size')).toBe('720x1280');
    const file = body.get('input_reference') as File;
    expect(file).toMatchObject({ name: 'input-reference.png', type: 'image/png' });
    expect(Buffer.from(await file.arrayBuffer())).toEqual(reference);
    expect(result.video).toEqual({ buffer: video, contentType: 'video/mp4' });
  });
});
