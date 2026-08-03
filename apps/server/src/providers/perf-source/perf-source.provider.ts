export interface PerfSignupRow {
  date: string;
  trackingCode: string;
  signups: number;
}

export interface FetchPerfSignupsInput {
  from: string;
  to: string;
}

export interface PerfSourceProvider {
  readonly name: string;
  readonly configured: boolean;
  fetchSignups(input: FetchPerfSignupsInput): Promise<PerfSignupRow[]>;
}

export const PERF_SOURCE_PROVIDER = Symbol('PERF_SOURCE_PROVIDER');
