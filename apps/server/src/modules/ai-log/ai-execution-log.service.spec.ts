import { AiExecutionLogService } from './ai-execution-log.service';

describe('AiExecutionLogService', () => {
  const createMock = jest.fn().mockResolvedValue({});
  const prisma = { aiExecutionLog: { create: createMock } };
  const service = new AiExecutionLogService(prisma as never);

  beforeEach(() => createMock.mockClear());

  it('성공 시 SUCCESS와 결과를 기록하고 결과를 반환한다', async () => {
    const result = await service.record(
      { provider: 'mock', model: 'mock-1', inputRef: 'test:1' },
      async () => ({ answer: 42 }),
    );
    expect(result).toEqual({ answer: 42 });
    const data = createMock.mock.calls[0][0].data;
    expect(data.status).toBe('SUCCESS');
    expect(data.output).toEqual({ answer: 42 });
    expect(typeof data.latencyMs).toBe('number');
  });

  it('실패 시 FAILURE와 오류 메시지를 기록하고 오류를 다시 던진다', async () => {
    await expect(
      service.record({ provider: 'mock', model: 'mock-1' }, async () => {
        throw new Error('provider exploded');
      }),
    ).rejects.toThrow('provider exploded');
    const data = createMock.mock.calls[0][0].data;
    expect(data.status).toBe('FAILURE');
    expect(data.errorMessage).toBe('provider exploded');
  });

  it('배열 결과는 전체 값 대신 길이만 기록한다', async () => {
    const result = await service.record(
      { provider: 'mock', model: 'mock-embedding-1' },
      async () => [0.1, 0.2, 0.3],
    );
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(createMock.mock.calls[0][0].data.output).toEqual({ length: 3 });
  });
});
