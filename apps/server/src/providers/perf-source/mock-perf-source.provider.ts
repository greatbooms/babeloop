import { FetchPerfSignupsInput, PerfSignupRow, PerfSourceProvider } from './perf-source.provider';

export class MockPerfSourceProvider implements PerfSourceProvider {
  readonly name = 'mock';
  readonly configured = true;

  async fetchSignups(_input: FetchPerfSignupsInput): Promise<PerfSignupRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    return [
      { date: today, trackingCode: 'BL-MOCK-V1-R1', signups: 3 },
      { date: today, trackingCode: 'BL-MOCK-V2-R1', signups: 1 },
    ];
  }
}
