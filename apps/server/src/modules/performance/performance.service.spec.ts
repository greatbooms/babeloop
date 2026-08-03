import { GraphQLError } from 'graphql';
import { SnowflakePerfSourceProvider } from '../../providers/perf-source/snowflake-perf-source.provider';
import { PerformanceService } from './performance.service';

describe('PerformanceService Snowflake sync', () => {
  it('소스가 설정되지 않으면 NOT_CONFIGURED 오류로 동기화 요청을 거부한다', async () => {
    const source = new SnowflakePerfSourceProvider({});
    const service = new PerformanceService(
      {} as never,
      {} as never,
      { enqueueOrRetry: jest.fn() } as never,
      source,
    );

    await expect(service.syncFromSnowflake({ id: 'user-1' } as never)).rejects.toMatchObject<Partial<GraphQLError>>({
      message: 'Snowflake 자격증명이 설정되지 않았습니다',
      extensions: { code: 'NOT_CONFIGURED' },
    });
  });
});
