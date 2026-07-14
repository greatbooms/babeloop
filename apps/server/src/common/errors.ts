import { GraphQLError } from 'graphql';

export function unauthenticated(message = '로그인이 필요합니다'): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'UNAUTHENTICATED' } });
}

export function forbidden(message = '이 작업을 수행할 권한이 없습니다'): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'FORBIDDEN' } });
}
