import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
  testTimeout: 120_000, // Testcontainers 기동 시간 포함
  maxWorkers: 1, // 컨테이너 공유 충돌 방지
};
export default config;
