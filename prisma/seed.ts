import 'dotenv/config';
import { PrismaClient } from '../apps/server/generated/prisma';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@babeloop.local';
  const password = process.env.ADMIN_PASSWORD ?? 'changeme-admin';

  await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await argon2.hash(password),
      displayName: 'Admin',
      role: 'ADMIN',
    },
  });

  const reviewerEmail = process.env.REVIEWER_EMAIL ?? 'reviewer@babeloop.local';
  const reviewerPassword = process.env.REVIEWER_PASSWORD ?? 'changeme-reviewer';
  await prisma.user.upsert({
    where: { email: reviewerEmail },
    update: {},
    create: {
      email: reviewerEmail,
      passwordHash: await argon2.hash(reviewerPassword),
      displayName: 'Reviewer',
      role: 'REVIEWER',
    },
  });

  await prisma.market.upsert({
    where: { code: 'TW' },
    update: {},
    create: {
      code: 'TW',
      name: '대만',
      defaultLocale: 'zh-TW',
      locales: ['zh-TW'],
    },
  });

  console.log('seed done:', email, reviewerEmail, '+ market TW');
}

main().finally(() => prisma.$disconnect());
