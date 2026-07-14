import { Module } from '@nestjs/common';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';
import { GqlAuthGuard } from './gql-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  providers: [AuthService, AuthResolver, GqlAuthGuard, RolesGuard],
  exports: [GqlAuthGuard, RolesGuard],
})
export class AuthModule {}
