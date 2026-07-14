import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { unauthenticated } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class GqlAuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = GqlExecutionContext.create(ctx).getContext().req;
    const userId = req.session?.userId;
    if (!userId) throw unauthenticated();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw unauthenticated();
    req.user = user;
    return true;
  }
}
