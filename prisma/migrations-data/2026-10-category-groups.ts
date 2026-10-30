/**
 * One-time data migration for "Category Types" (CategoryGroup) and profile payments.
 *
 *   npm run db:migrate:category-groups -- --dry-run   # preview
 *   npm run db:migrate:category-groups                # apply
 *
 * 1. Creates the initial category types (idempotent, matched by type + name).
 * 2. Assigns every category without a category type to the first type of its profile type.
 * 3. Sets Profile.paidAt for profiles that already have a PAID payment.
 */
import { CategoryType, PaymentStatus, PrismaClient } from '@prisma/client';

try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env');
} catch {
  // rely on the environment
}

const DRY_RUN = process.argv.includes('--dry-run');
const prisma = new PrismaClient();

export const INITIAL_GROUPS: { type: CategoryType; name: string; sortOrder: number }[] = [
  {
    type: CategoryType.PROFESSIONAL_CONSULTANT,
    name: 'Licenced Practitioners / Statutory Professionals',
    sortOrder: 1,
  },
  {
    type: CategoryType.PROFESSIONAL_CONSULTANT,
    name: 'Business & Strategy Consultants / Advisory Consultants',
    sortOrder: 2,
  },
  { type: CategoryType.SERVICE_AND_RETAIL_BRANDS, name: 'Service & Retail Brand', sortOrder: 1 },
];

async function ensureGroups() {
  const defaults = new Map<CategoryType, string>();
  for (const g of INITIAL_GROUPS) {
    let group = await prisma.categoryGroup.findFirst({ where: { type: g.type, name: g.name } });
    if (!group && !DRY_RUN) group = await prisma.categoryGroup.create({ data: g });
    console.log(`Category type "${g.name}" (${g.type}): ${group ? 'ok' : 'would be created'}`);
    if (!defaults.has(g.type)) defaults.set(g.type, group?.id ?? `<new ${g.name}>`);
  }
  return defaults;
}

async function assignCategories(defaults: Map<CategoryType, string>) {
  const categories = await prisma.category.findMany({
    where: { OR: [{ groupId: null }, { groupId: { isSet: false } }] },
    select: { id: true, name: true, type: true },
  });
  console.log(`Categories without a category type: ${categories.length}`);
  for (const c of categories) {
    const groupId = defaults.get(c.type);
    const target = INITIAL_GROUPS.find((g) => g.type === c.type)?.name;
    console.log(`  "${c.name}" -> ${target}`);
    if (!DRY_RUN && groupId)
      await prisma.category.update({ where: { id: c.id }, data: { groupId } });
  }
}

async function backfillPaidAt() {
  const payments = await prisma.payment.findMany({
    where: { status: PaymentStatus.PAID, profileId: { not: null } },
    orderBy: { paidAt: 'asc' },
    select: { profileId: true, paidAt: true },
  });
  const firstPaid = new Map<string, Date>();
  for (const p of payments)
    if (p.profileId && !firstPaid.has(p.profileId))
      firstPaid.set(p.profileId, p.paidAt ?? new Date());
  console.log(`Profiles with a PAID payment: ${firstPaid.size}`);
  for (const [profileId, paidAt] of firstPaid) {
    if (!DRY_RUN) {
      await prisma.profile.updateMany({
        where: { id: profileId, OR: [{ paidAt: null }, { paidAt: { isSet: false } }] },
        data: { paidAt },
      });
    }
  }
}

async function main() {
  console.log(
    DRY_RUN ? '--- DRY RUN (no changes written) ---' : '--- Applying category types migration ---',
  );
  const defaults = await ensureGroups();
  await assignCategories(defaults);
  await backfillPaidAt();
  console.log('Done.');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
