import { OpenAISttProvider } from './openai-stt.provider';

function fakeClient(create: jest.Mock) {
  return { audio: { transcriptions: { create } } };
}

describe('OpenAISttProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, STT_MODEL: 'whisper-test' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('toFile로 만든 파일과 모델을 전달한다', async () => {
    const uploadedFile = { name: 'clip.webm' };
    const toFile = jest.fn().mockResolvedValue(uploadedFile);
    const create = jest.fn().mockResolvedValue({ text: '안녕하세요' });
    const provider = new OpenAISttProvider(fakeClient(create), toFile);
    const buffer = Buffer.from('video');

    await provider.transcribe({ buffer, contentType: 'video/webm', filename: 'clip.webm' });

    expect(toFile).toHaveBeenCalledWith(buffer, 'clip.webm');
    expect(create).toHaveBeenCalledWith({ file: uploadedFile, model: 'whisper-test' });
  });

  it('응답 text와 선택적 language를 매핑한다', async () => {
    const provider = new OpenAISttProvider(
      fakeClient(jest.fn().mockResolvedValue({ text: 'hello', language: 'en' })),
      jest.fn().mockResolvedValue({}),
    );
    await expect(provider.transcribe({ buffer: Buffer.from('x'), contentType: 'video/mp4' })).resolves.toEqual({ text: 'hello', language: 'en' });
  });

  it('25MB 초과 버퍼는 파일 변환과 API 호출 전에 거부한다', async () => {
    const create = jest.fn();
    const toFile = jest.fn();
    const provider = new OpenAISttProvider(fakeClient(create), toFile);

    await expect(provider.transcribe({ buffer: Buffer.alloc(25 * 1024 * 1024 + 1), contentType: 'video/mp4' }))
      .rejects.toThrow('FFmpeg 오디오 추출');
    expect(toFile).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('API 오류를 그대로 전파한다', async () => {
    const error = new Error('api failed');
    const provider = new OpenAISttProvider(
      fakeClient(jest.fn().mockRejectedValue(error)),
      jest.fn().mockResolvedValue({}),
    );
    await expect(provider.transcribe({ buffer: Buffer.from('x'), contentType: 'video/mp4' })).rejects.toBe(error);
  });
});
