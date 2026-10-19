/**
 * Demo banners and announcements, so the home page carousel, the member and seller dashboards and the
 * Admin > Banners / Announcements pages have something to show.
 *
 *   - 3 banners (2 on the public home page, 1 on the dashboards). Each photo is a generated colour
 *     tile with no text, uploaded to the same public bucket and `banners/` folder the real uploader uses.
 *   - 3 announcements, published straight away as the Super Admin (one for everyone, one for members,
 *     one for sellers).
 *
 * Safe to re-run: a banner is matched by its headline and an announcement by its title, and skipped if
 * it already exists. Nothing here touches money.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-notices.ts
 *   ... scripts/seed-demo-notices.ts --remove     # delete only what this script made
 */
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/server/domain/audit/record";

const BUCKET = "catalog-public";

const BANNERS = [
  {
    placement: "HOME" as const,
    headline: "Buy, sell and earn on one platform",
    subline: "Browse approved vendors, post a requirement for bids, or share your referral link.",
    ctaLabel: "Browse products",
    ctaHref: "/products",
    colors: ["#0b3d5c", "#1f7a8c"],
  },
  {
    placement: "HOME" as const,
    headline: "Post a requirement and get quotes from vendors",
    subline: "Open tenders and reverse auctions: vendors bid, you pick the best offer.",
    ctaLabel: "See open bids",
    ctaHref: "/bids",
    colors: ["#5a1a2e", "#c2495f"],
  },
  {
    placement: "DASHBOARD" as const,
    headline: "Refer a friend, earn on every order",
    subline: "Share your referral link. You earn a commission when the people you refer buy.",
    ctaLabel: "See my referrals",
    ctaHref: "/referrals",
    colors: ["#2d4a22", "#7a9e3b"],
  },
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

/** A 1920x640 colour tile: a diagonal gradient with a few soft circles. No text, so no fonts are needed. */
async function tile([from, to]: string[]): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="640" viewBox="0 0 1920 640">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="1920" height="640" fill="url(#g)"/>
    <circle cx="1560" cy="120" r="260" fill="#ffffff" fill-opacity="0.08"/>
    <circle cx="1780" cy="520" r="180" fill="#ffffff" fill-opacity="0.07"/>
    <circle cx="1280" cy="600" r="120" fill="#ffffff" fill-opacity="0.06"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: { userRoles: { some: { revokedAt: null, role: { code: "SUPER_ADMIN" } } } },
    select: { id: true },
  });
  if (!admin) throw new Error("No Super Admin found. Run bootstrap-admin.ts first.");
  const storage = createAdminClient().storage.from(BUCKET);

  if (process.argv.includes("--remove")) {
    const banners = await prisma.banner.findMany({
      where: { headline: { in: BANNERS.map((b) => b.headline) } },
      select: { id: true, imagePath: true },
    });
    if (banners.length) await storage.remove(banners.map((b) => b.imagePath));
    await prisma.banner.deleteMany({ where: { id: { in: banners.map((b) => b.id) } } });
    const removed = await prisma.announcement.deleteMany({
      where: { title: { in: ANNOUNCEMENTS.map((a) => a.title) } },
    });
    console.log(`Removed ${banners.length} banner(s) and ${removed.count} announcement(s).`);
    await prisma.$disconnect();
    return;
  }

  let sortOrder =
    (await prisma.banner.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? 0;
  for (const banner of BANNERS) {
    if (
      await prisma.banner.findFirst({ where: { headline: banner.headline }, select: { id: true } })
    ) {
      console.log(`Banner "${banner.headline}" already exists, skipped.`);
      continue;
    }
    const path = `banners/${randomUUID()}.jpg`;
    const { error } = await storage.upload(path, await tile(banner.colors), {
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
