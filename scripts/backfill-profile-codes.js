"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function main() {
    const result = (await prisma.$runCommandRaw({
        find: 'Profile',
        filter: {
            $or: [
                { profileCode: null },
                { profileCode: '' },
                { profileCode: { $exists: false } },
            ],
        },
        projection: { _id: 1, profileCode: 1 },
    }));
    const profiles = (result?.cursor?.firstBatch ?? []).map((profile) => {
        const id = profile?._id && typeof profile._id === 'object' && profile._id.$oid
            ? profile._id.$oid
            : typeof profile?._id === 'string'
                ? profile._id
                : String(profile?._id ?? '');
        return { id };
    });
    let updated = 0;
    for (const profile of profiles) {
        let candidate = `PRO-${updated + 1}`;
        let counter = 1;
        while (true) {
            const existing = await prisma.profile.findUnique({
                where: { profileCode: candidate },
            });
            if (!existing)
                break;
            counter += 1;
            candidate = `PRO-${counter}`;
        }
        await prisma.profile.update({
            where: { id: profile.id },
            data: { profileCode: candidate },
        });
        updated += 1;
        console.log(`Backfilled ${profile.id} -> ${candidate}`);
    }
    console.log(`Updated ${updated} legacy profile(s).`);
}
main()
    .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=backfill-profile-codes.js.map