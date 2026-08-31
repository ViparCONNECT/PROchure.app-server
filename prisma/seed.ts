import { PrismaClient, AdminRole, CategoryType } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SUPER_ADMIN_FIRST_NAME ?? 'Super';
  const lastName = process.env.SUPER_ADMIN_LAST_NAME ?? 'Admin';

  if (!email || !password) {
    throw new Error('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set');
  }

  // Seed super admin (idempotent)
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (!existing) {
    const passwordHash = await argon2.hash(password);
    await prisma.admin.create({
      data: { email, firstName, lastName, passwordHash, role: AdminRole.SUPER_ADMIN },
    });
    console.log(`Super admin created: ${email}`);
  } else {
    console.log(`Super admin already exists: ${email}`);
  }

  // Seed one default category per type (idempotent by name)
  const categories: Array<{ name: string; type: CategoryType }> = [
    { name: 'Professional Consultant', type: CategoryType.PROFESSIONAL_CONSULTANT },
    { name: 'Service Brands', type: CategoryType.SERVICE_BRANDS },
    { name: 'Product Brands', type: CategoryType.PRODUCT_BRANDS },
    { name: 'Retail Brands', type: CategoryType.RETAIL_BRANDS },
  ];

  for (const cat of categories) {
    const exists = await prisma.category.findFirst({ where: { name: cat.name } });
    if (!exists) {
      await prisma.category.create({
        data: { name: cat.name, type: cat.type, isSubCategoryNeeded: false },
      });
    }
  }
  console.log('Categories seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
