import { UseGuards } from '@nestjs/common';
import { Args, Context, Mutation, Query, Resolver } from '@nestjs/graphql';
import { User } from '../../../generated/prisma';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { GqlAuthGuard } from './gql-auth.guard';
import { UserModel } from './user.model';

@Resolver(() => UserModel)
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => UserModel)
  async login(
    @Args('email') email: string,
    @Args('password') password: string,
    @Context('req') req: { session: { userId?: string } },
  ): Promise<User> {
    const user = await this.authService.validateCredentials(email, password);
    req.session.userId = user.id;
    return user;
  }

  @Mutation(() => Boolean)
  async logout(@Context('req') req: { session: { destroy: (cb: () => void) => void } }): Promise<boolean> {
    await new Promise<void>((resolve) => req.session.destroy(resolve));
    return true;
  }

  @Query(() => UserModel)
  @UseGuards(GqlAuthGuard)
  me(@CurrentUser() user: User): User {
    return user;
  }
}
