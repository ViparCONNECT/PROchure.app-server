/**
 * One-time data migration for the profile v2 redesign. Run BEFORE starting the new API build.
 *
 *   npm run db:migrate:profile-v2 -- --dry-run   # preview
 *   npm run db:migrate:profile-v2                # apply
 *
 * 1. Category.type SERVICE_BRANDS | PRODUCT_BRANDS | RETAIL_BRANDS  ->  SERVICE_AND_RETAIL_BRANDS
 *    (urlSlugs that collide inside the merged type get a -2/-3 suffix)
 * 2. Old-format profiles are converted to the new fields. Every old field is preserved under `legacy`.
 *
 * Idempotent: already-migrated documents are skipped.
 */
import { PrismaClient } from '@prisma/client';

try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile('.env');
} catch {
  // rely on the environment
}

const DRY_RUN = process.argv.includes('--dry-run');
const OLD_BRAND_TYPES = ['SERVICE_BRANDS', 'PRODUCT_BRANDS', 'RETAIL_BRANDS'];
const NEW_BRAND_TYPE = 'SERVICE_AND_RETAIL_BRANDS';

type Doc = Record<string, any>;
interface DaySchedule {
  closed: boolean;
  open: string | null;
  close: string | null;
  breakStart: string | null;
  breakEnd: string | null;
}

const prisma = new PrismaClient();

const oid = (d: Doc) => ({ $oid: d._id.$oid as string });
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function to24h(t: string): string | null {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ap = m[3]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Parses the old admin format "hh:mm A to hh:mm A[ | Lunch Break | hh:mm A to hh:mm A]". */
export function parseOldDay(value: unknown): DaySchedule {
  const closed: DaySchedule = {
    closed: true,
    open: null,
    close: null,
    breakStart: null,
    breakEnd: null,
  };
  const s = str(value);
  if (!s || /closed|holiday/i.test(s) || /^00:00/.test(s)) return closed;
  const ranges = s
    .split('|')
    .map((p) => p.trim())
    .filter((p) => / to /i.test(p))
    .map((p) => p.split(/ to /i).map(to24h));
  if (!ranges.length || ranges.some((r) => !r[0] || !r[1])) return closed;
  const [first, second] = ranges;
  return second
    ? { closed: false, open: first[0], close: second[1], breakStart: first[1], breakEnd: second[0] }
    : { closed: false, open: first[0], close: first[1], breakStart: null, breakEnd: null };
}

async function migrateCategories() {
  const pending = (await prisma.category.findRaw({
    filter: { type: { $in: OLD_BRAND_TYPES } },
  })) as unknown as Doc[];
  for (const c of pending) console.log(`  category "${c.name}": ${c.type} -> ${NEW_BRAND_TYPE}`);
  if (!DRY_RUN && pending.length) {
    await prisma.$runCommandRaw({
      update: 'Category',
      updates: [
        {
          q: { type: { $in: OLD_BRAND_TYPES } },
          u: { $set: { type: NEW_BRAND_TYPE } },
          multi: true,
        },
      ],
    });
  }
  console.log(`Categories ${DRY_RUN ? 'to move' : 'moved'}: ${pending.length}`);

  const types = DRY_RUN ? [NEW_BRAND_TYPE, ...OLD_BRAND_TYPES] : [NEW_BRAND_TYPE];
  const cats = (await prisma.category.findRaw({
    filter: { type: { $in: types } },
  })) as unknown as Doc[];
  const seen = new Set<string>();
  for (const cat of cats.sort((a, b) => String(a._id.$oid).localeCompare(String(b._id.$oid)))) {
    const base = str(cat.urlSlug);
    if (!base) continue;
    let slug = base;
    for (let n = 2; seen.has(slug); n++) slug = `${base}-${n}`;
    seen.add(slug);
    if (slug !== base) {
      console.log(`  re-slug category "${cat.name}": ${base} -> ${slug}`);
      if (!DRY_RUN) {
        await prisma.$runCommandRaw({
          update: 'Category',
          updates: [{ q: { _id: oid(cat) }, u: { $set: { urlSlug: slug } } }],
        });
      }
    }
  }
}

async function migrateProfiles() {
  const categories = (await prisma.category.findRaw({})) as unknown as Doc[];
  const typeById = new Map(categories.map((c) => [c._id.$oid as string, c.type as string]));
  const profiles = (await prisma.profile.findRaw({
    filter: { servicesOffered: { $exists: false } },
  })) as unknown as Doc[];
  console.log(`Profiles to convert: ${profiles.length}`);

  for (const p of profiles) {
    const isConsultant = typeById.get(p.categoryId?.$oid) === 'PROFESSIONAL_CONSULTANT';
    const contact: Doc = p.contact ?? {};
    const wh: Doc = p.workingHours ?? {};
    const phone = str(contact.officialContactNumber);
    const countryCode = str(contact.countryCode) ?? '';
    const email = str(contact.officialEmailId);

    const set: Doc = {
      status: 'ACTIVE',
      isDisabled: p.isDisabled ?? false,
      consultantKind: isConsultant ? 'INDEPENDENT' : null,
      name: str(p.name) ?? '',
      consultantName: null,
      degrees: isConsultant ? str(p.qualifications) : null,
      registrationNumber: null,
      servicesOffered: [str(p.services), str(p.specializations)].filter(Boolean).join(' | '),
      sinceYear:
        (isConsultant
          ? (str(p.yearOfPractice) ?? str(p.yearOfEstablishment))
          : (str(p.yearOfEstablishment) ?? str(p.yearOfPractice))) ?? '',
      isWomenEntrepreneur: p.isWomenEntrepreneur ?? false,
      contactNumbers: phone
        ? [
            `${countryCode.startsWith('+') || !countryCode ? countryCode : `+${countryCode}`}${phone}`.replace(
              /\s+/g,
              '',
            ),
          ]
        : [],
      emails: email ? [email.toLowerCase()] : [],
      languages: Array.isArray(contact.mostComfortablePreferredLanguages)
        ? contact.mostComfortablePreferredLanguages
        : [],
      address: p.address ?? {},
      workingHours: {
        weekdays: parseOldDay(wh.monday),
        saturday: parseOldDay(wh.saturday),
        sunday: parseOldDay(wh.sunday),
      },
      userId: null,
      publishedAt: p.createdAt ?? null,
      legacy: {
        image: p.image ?? null,
        logo: p.logo ?? null,
        professionalTitle: p.professionalTitle ?? null,
        qualifications: p.qualifications ?? null,
        specializations: p.specializations ?? null,
        services: p.services ?? null,
        yearOfEstablishment: p.yearOfEstablishment ?? null,
        yearOfPractice: p.yearOfPractice ?? null,
        contact,
        workingHours: wh,
      },
    };

    console.log(
      `  ${p._id.$oid} "${set.name}" -> since=${set.sinceYear || '?'} phones=${set.contactNumbers.length} emails=${set.emails.length}`,
    );
    if (DRY_RUN) continue;
    await prisma.$runCommandRaw({
      update: 'Profile',
      updates: [
        {
          q: { _id: oid(p) },
          u: {
            $set: set,
            $unset: {
              image: '',
              logo: '',
              professionalTitle: '',
              qualifications: '',
              specializations: '',
              services: '',
              yearOfEstablishment: '',
              yearOfPractice: '',
              contact: '',
            },
          },
        },
      ],
    });
  }
}

async function main() {
  console.log(
    DRY_RUN ? '--- DRY RUN (no changes written) ---' : '--- Applying profile v2 migration ---',
  );
  await migrateCategories();
  await migrateProfiles();
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
