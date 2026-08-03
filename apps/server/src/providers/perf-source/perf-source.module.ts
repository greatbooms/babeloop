import { Global, Module } from '@nestjs/common';
import { MockPerfSourceProvider } from './mock-perf-source.provider';
import { PERF_SOURCE_PROVIDER } from './perf-source.provider';
import { SnowflakePerfSourceProvider } from './snowflake-perf-source.provider';

@Global()
@Module({
  providers: [
    {
      provide: PERF_SOURCE_PROVIDER,
      useFactory: () => process.env.PERF_SOURCE_PROVIDER === 'mock'
        ? new MockPerfSourceProvider()
        : new SnowflakePerfSourceProvider(),
    },
  ],
  exports: [PERF_SOURCE_PROVIDER],
})
export class PerfSourceModule {}
