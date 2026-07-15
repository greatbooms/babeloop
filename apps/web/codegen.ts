import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../server/src/generated/schema.gql',
  documents: ['src/**/*.{ts,tsx}'],
  generates: {
    'src/generated/': { preset: 'client' },
  },
};
export default config;
