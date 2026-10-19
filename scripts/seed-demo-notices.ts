/**
 * Demo banners and announcements, so the home page carousel, the member and seller dashboards and the
 * Admin > Banners / Announcements pages have something to show.
 *
 *   - 1 banner for the member and seller dashboards, using one of the client's own hero photographs
 *     (public/images/hero). No banner is added for the public home page on purpose: with none, the home
 *     page shows the client's own hero slides (their headlines and photographs).
 *   - 3 announcements, published straight away as the Super Admin (one for everyone, one for members,
 *     one for sellers).
 *
 * Safe to re-run: this script's banners are replaced (and any earlier generated-tile banners it used to
 * make are removed), and an announcement is matched by its title and skipped if it already exists.
 * Nothing here touches money.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-notices.ts
 *   ... scripts/seed-demo-notices.ts --remove     # delete only what this script made
 */
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { prisma } from "@/server/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/server/domain/audit/record";

const BUCKET = "catalog-public";

const BANNERS = [
  {
    placement: "DASHBOARD" as const,
    headline: "Refer a friend, earn on every order",
    subline: "Share your referral link. You earn a commission when the people you refer buy.",
    ctaLabel: "See my referrals",
    ctaHref: "/referrals",
    photo: "public/images/hero/slide-2.jpg",
  },
];

/** Banners an earlier version of this script made from generated colour tiles; removed on every run. */
const LEGACY_HEADLINES = [
  "Buy, sell and earn on one platform",
  "Post a requirement and get quotes from vendors",
];

const ANNOUNCEMENTS = [
  {
    title: "Referral earnings are on your Earnings page",
    body: "Direct and indirect commissions, and the business your team brings in, are listed on the Earnings page. Released commissions reach your wallet automatically.",
    audience: "ALL" as const,
  },
  {
    title: "Diwali holiday notice",
    body: "Support will be closed on Diwali. We reopen the next day. Orders and payments keep working as usual.",
    audience: "CUSTOMERS" as const,
  },
  {
    title: "Keep your listings up to date",
    body: "Add clear photos and a full description to your products, services and projects. Listings with complete details are easier for buyers to compare.",
    audience: "VENDORS" as const,
  },
];

async function main() {
  const admin = await prisma.user.findFirst({
    where: { userRoles: { some: { revokedAt: null, role: { code: "SUPER_ADMIN" } } } },
    select: { id: true },
  });
  if (!admin) throw new Error("No Super Admin found. Run bootstrap-admin.ts first.");
  const storage = createAdminClient().storage.from(BUCKET);

  const ownHeadlines = [...BANNERS.map((b) => b.headline), ...LEGACY_HEADLINES];
  async function removeOwnBanners() {
    const banners = await prisma.banner.findMany({
      where: { headline: { in: ownHeadlines } },
      select: { id: true, imagePath: true },
    });
    if (banners.length) await storage.remove(banners.map((b) => b.imagePath));
    await prisma.banner.deleteMany({ where: { id: { in: banners.map((b) => b.id) } } });
    return banners.length;
  }

  if (process.argv.includes("--remove")) {
    const bannerCount = await removeOwnBanners();
    const removed = await prisma.announcement.deleteMany({
      where: { title: { in: ANNOUNCEMENTS.map((a) => a.title) } },
    });
    console.log(`Removed ${bannerCount} banner(s) and ${removed.count} announcement(s).`);
    await prisma.$disconnect();
    return;
  }

  const replaced = await removeOwnBanners();
  if (replaced > 0) console.log(`Replaced ${replaced} earlier banner(s) made by this script.`);
  let sortOrder =
    (await prisma.banner.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  for (const banner of BANNERS) {
    const photo = await sharp(readFileSync(banner.photo))
      .resize({ width: 1920, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    const path = `banners/${randomUUID()}.jpg`;
    const { error } = await storage.upload(path, photo, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) throw new Error(`Could not upload the banner image: ${error.message}`);
    sortOrder += 1;
    const created = await prisma.banner.create({
      data: {
        placement: banner.placement,
        headline: banner.headline,
        subline: banner.subline,
        ctaLabel: banner.ctaLabel,
        ctaHref: banner.ctaHref,
        imagePath: path,
        sortOrder,
        isActive: true,
        createdBy: admin.id,
      },
      select: { id: true },
    });
    await recordAudit({
      actorId: admin.id,
      action: "BANNER_CREATED",
      entityType: "banners",
      entityId: created.id,
      after: { headline: banner.headline },
    });
    console.log(`Banner "${banner.headline}" added (${banner.placement}).`);
  }

  for (const notice of ANNOUNCEMENTS) {
    if (
      await prisma.announcement.findFirst({ where: { title: notice.title }, select: { id: true } })
    ) {
      console.log(`Announcement "${notice.title}" already exists, skipped.`);
      continue;
    }
    const created = await prisma.announcement.create({
      data: {
        title: notice.title,
        body: notice.body,
        audience: notice.audience,
        status: "PUBLISHED",
        createdBy: admin.id,
        publishedBy: admin.id,
        publishedAt: new Date(),
      },
      select: { id: true },
    });
    await recordAudit({
      actorId: admin.id,
      action: "ANNOUNCEMENT_CREATED",
      entityType: "announcements",
      entityId: created.id,
      after: { title: notice.title, audience: notice.audience },
    });
    console.log(`Announcement "${notice.title}" published (${notice.audience}).`);
  }
  await prisma.$disconnect();
}

void main();
