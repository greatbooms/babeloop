import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client';

// 같은 도메인 배포(나스 단일 이미지)에서는 빈 값 → 상대경로 /graphql.
// 프론트 분리 배포(버셀)에서는 VITE_API_URL=https://api.도메인 → 절대경로 + 크로스 사이트 쿠키.
const apiBase = import.meta.env.VITE_API_URL ?? '';

export const apolloClient = new ApolloClient({
  link: new HttpLink({
    uri: `${apiBase}/graphql`,
    credentials: apiBase ? 'include' : 'same-origin',
  }),
  cache: new InMemoryCache(),
});
