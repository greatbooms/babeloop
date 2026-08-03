import { MockPerfSourceProvider } from './mock-perf-source.provider';

describe('MockPerfSourceProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('현재 날짜와 실제 추적코드 형식으로 결정적인 가입 성과 2행을 반환한다', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-03T00:00:00.000Z'));
    const provider = new MockPerfSourceProvider();

    const rows = await provider.fetchSignups({ from: '2026-07-21', to: '2026-08-03' });

    expect(provider.name).toBe('mock');
    expect(provider.configured).toBe(true);
    expect(rows).toEqual([
      { date: '2026-08-03', trackingCode: 'BL-MOCK-V1-R1', signups: 3 },
      { date: '2026-08-03', trackingCode: 'BL-MOCK-V2-R1', signups: 1 },
    ]);
  });
});
