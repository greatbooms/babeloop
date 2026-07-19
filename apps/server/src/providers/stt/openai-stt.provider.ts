import { SttInput, SttOutput, SttProvider } from './stt.provider';

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface OpenAISttClient {
  audio: {
    transcriptions: {
      create(input: { file: unknown; model: string }): Promise<{ text: string; language?: string }>;
    };
  };
}

type ToFile = (buffer: Buffer, filename: string) => Promise<unknown>;

export class OpenAISttProvider implements SttProvider {
  readonly name = 'openai';
  readonly model = process.env.STT_MODEL ?? 'whisper-1';
  private readonly client: OpenAISttClient;
  private readonly toFile: ToFile;

  constructor(client?: OpenAISttClient, toFile?: ToFile) {
    if (client && toFile) {
      this.client = client;
      this.toFile = toFile;
      return;
    }
    // SDK와 uploads 헬퍼는 실제 OpenAI provider를 선택할 때만 로드한다.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const OpenAI = require('openai').default;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const uploads = require('openai/uploads') as { toFile: ToFile };
    this.client = new OpenAI({ apiKey: process.env.STT_API_KEY ?? process.env.TEXT_AI_API_KEY });
    this.toFile = uploads.toFile;
  }

  async transcribe(input: SttInput): Promise<SttOutput> {
    if (input.buffer.length > MAX_FILE_BYTES) {
      throw new Error('영상이 25MB를 초과합니다. FFmpeg 오디오 추출(추후 작업)이 필요합니다');
    }
    const file = await this.toFile(input.buffer, this.uploadFilename(input));
    const response = await this.client.audio.transcriptions.create({ file, model: this.model });
    // STT는 재생 시간을 알 수 없어 분 단위 비용을 추정하지 않는다.
    return { text: response.text, language: response.language };
  }

  /** Whisper는 파일명 확장자로 포맷을 판별한다 — ST 다운로드 자산은 확장자가 없으므로
   *  contentType에서 유도한다 (실측: 'external-{id}' 파일명이 400 Unrecognized file format). */
  private uploadFilename(input: SttInput): string {
    const known = /\.(flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i;
    if (input.filename && known.test(input.filename)) return input.filename;
    const byContentType: Record<string, string> = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/mpeg': 'mpeg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/flac': 'flac',
    };
    const ext = byContentType[input.contentType.toLowerCase()] ?? 'mp4';
    return `media.${ext}`;
  }
}
