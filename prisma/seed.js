import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@muzakere.local';
  const username = 'admin';
  const password = 'admin123';
  const saltRounds = 12; // cost factor 12
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { passwordHash, username },
    create: {
      email,
      username,
      passwordHash,
    },
  });

  console.log(`Seed completed. Default admin account upserted: ${admin.email} (username: ${admin.username})`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
