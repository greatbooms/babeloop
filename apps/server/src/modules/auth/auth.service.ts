import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { unauthenticated } from '../../common/errors';
import { PrismaService } from '../../common/prisma/prisma.service';
import { User } from '../../../generated/prisma';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw unauthenticated('이메일 또는 비밀번호가 올바르지 않습니다');
    }
    return user;
  }
}
