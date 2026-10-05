/**
 * Demo catalog for design/QA — vendors, categories and approved listings so
 * the public portal (header mega-menu, homepage rail, stats, featured
 * sections) can be reviewed with realistic data.
 *
 * Safe to re-run (upserts by slug/email) and fully reversible:
 *   npx tsx scripts/seed-demo-catalog.ts            # add / refresh demo data
 *   npx tsx scripts/seed-demo-catalog.ts --remove   # delete everything it created
 *
 * Everything it creates is identifiable: slugs start with "demo-", demo
 * vendor users use @demo.justreference.test emails. The users are DB rows
 * only (no Supabase Auth account), so nobody can sign in as them.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildReferralPath, formatMemberId } from "../src/server/domain/identity/member-id";

const DEMO_EMAIL_DOMAIN = "@demo.justreference.test";
const rupees = (n: number) => BigInt(n) * 100n;

const VENDORS = [
  { key: "northwind", name: "Northwind Traders" },
  { key: "kaveri", name: "Kaveri Industrial Supplies" },
  { key: "bluepeak", name: "BluePeak Services" },
  { key: "stonebridge", name: "Stonebridge Builders" },
] as const;
type VendorKey = (typeof VENDORS)[number]["key"];

const PRODUCT_CATEGORIES = [
  "Office Furniture",
  "Computers and Accessories",
  "Safety and Fire Equipment",
  "Medical Supplies",
  "Stationery and Printing",
  "Electrical and Lighting",
];
const SERVICE_CATEGORIES = [
  "Security Services",
  "Catering and Housekeeping",
  "Transport and Vehicle Hire",
  "IT and Software Support",
  "Training and Consulting",
];
const PROJECT_CATEGORIES = ["Civil and Interiors", "Software Development", "Installation Projects"];

const PRODUCTS: [VendorKey, string, string, string, number, number][] = [
  // vendor, category, title, description, priceRupees, stock
  [
    "northwind",
    "Office Furniture",
    "Ergonomic Mesh Office Chair",
    "Adjustable lumbar support, breathable mesh back, 5-year frame warranty.",
    8499,
    40,
  ],
  [
    "northwind",
    "Office Furniture",
    "Height-Adjustable Standing Desk",
    "Electric dual-motor frame with a 140 cm laminated top.",
    21999,
    15,
  ],
  [
    "northwind",
    "Office Furniture",
    "Four-Drawer Steel Filing Cabinet",
    "Powder-coated steel with central locking.",
    6299,
    25,
  ],
  [
    "northwind",
    "Computers and Accessories",
    "14-inch Business Laptop, 16 GB / 512 GB",
    "Lightweight aluminium body with a full-day battery.",
    52999,
    12,
  ],
  [
    "northwind",
    "Computers and Accessories",
    "27-inch QHD IPS Monitor",
    "Flicker-free panel with height-adjustable stand.",
    14499,
    18,
  ],
  [
    "kaveri",
    "Safety and Fire Equipment",
    "ABC Fire Extinguisher, 4 kg",
    "ISI-marked dry chemical powder extinguisher with wall bracket.",
    1799,
    120,
  ],
  [
    "kaveri",
    "Safety and Fire Equipment",
    "Industrial Safety Helmet",
    "High-impact ABS shell with a 6-point suspension.",
    349,
    300,
  ],
  [
    "kaveri",
    "Safety and Fire Equipment",
    "First Aid Kit, Workplace Grade",
    "Compliant 50-person kit in a wall-mount case.",
    2399,
    60,
  ],
  [
    "kaveri",
    "Electrical and Lighting",
    "18 W LED Panel Light (Pack of 10)",
    "Cool white, 50,000-hour rated life.",
    2199,
    80,
  ],
  [
    "kaveri",
    "Electrical and Lighting",
    "Industrial Extension Board, 6 Socket",
    "Surge-protected with individual switches.",
    749,
    150,
  ],
  [
    "bluepeak",
    "Medical Supplies",
    "Pulse Oximeter, Fingertip",
    "OLED display with SpO2 and pulse rate.",
    1299,
    90,
  ],
  [
    "bluepeak",
    "Medical Supplies",
    "Digital Infrared Thermometer",
    "Non-contact, 1-second reading.",
    999,
    110,
  ],
  [
    "bluepeak",
    "Stationery and Printing",
    "A4 Copier Paper, 75 GSM (Ream of 500)",
    "Bright white, jam-free for laser and inkjet.",
    289,
    500,
  ],
  [
    "bluepeak",
    "Stationery and Printing",
    "Laser Toner Cartridge, Black",
    "Compatible high-yield cartridge, 3,000 pages.",
    2699,
    45,
  ],
];

const SERVICES: [VendorKey, string, string, string, "FIXED" | "QUOTE", number | null][] = [
  [
    "bluepeak",
    "Security Services",
    "Unarmed Security Guard, 12-hour Shift",
    "Verified and uniformed guards with supervisor visits.",
    "FIXED",
    18500,
  ],
  [
    "bluepeak",
    "Security Services",
    "CCTV Installation and Monitoring Setup",
    "Site survey, installation and remote-view configuration.",
    "QUOTE",
    null,
  ],
  [
    "bluepeak",
    "Catering and Housekeeping",
    "Daily Office Housekeeping, Monthly Contract",
    "Trained staff, supplies included, monthly billing.",
    "FIXED",
    24000,
  ],
  [
    "bluepeak",
    "Catering and Housekeeping",
    "Corporate Lunch Catering, per Plate",
    "Hygienic vegetarian menu with minimum 25 plates.",
    "FIXED",
    220,
  ],
  [
    "stonebridge",
    "Transport and Vehicle Hire",
    "Sedan with Driver, Full Day",
    "8-hour, 80 km booking with a GPS-tracked vehicle.",
    "FIXED",
    3200,
  ],
  [
    "stonebridge",
    "Transport and Vehicle Hire",
    "Tempo Traveller, Outstation per Day",
    "12-seater with experienced driver.",
    "FIXED",
    6800,
  ],
  [
    "northwind",
    "IT and Software Support",
    "On-site IT Support Engineer, per Visit",
    "Hardware, network and software troubleshooting.",
    "FIXED",
    1500,
  ],
  [
    "northwind",
    "Training and Consulting",
    "Workplace Safety Training Workshop",
    "Half-day on-site session with certificates.",
    "QUOTE",
    null,
  ],
];

const PROJECTS: [VendorKey, string, string, string, number][] = [
  [
    "stonebridge",
    "Civil and Interiors",
    "Office Fit-out, up to 2,000 sq ft",
    "Partitions, false ceiling, flooring and electrical, delivered turnkey.",
    1450000,
  ],
  [
    "stonebridge",
    "Installation Projects",
    "Rooftop Solar Installation, 10 kW",
    "Design, supply, net-metering paperwork and commissioning.",
    540000,
  ],
  [
    "northwind",
    "Software Development",
    "Inventory Management Web App",
    "Requirements, build, deployment and 3 months of support.",
    380000,
  ],
  [
    "northwind",
    "Software Development",
    "Company Website with CMS",
    "Up to 12 pages, content management and SEO setup.",
    95000,
  ],
];

const MEMBERS = [
  { key: "aarav", name: "Aarav Sharma", status: "ACTIVE", referredBy: null },
  { key: "neha", name: "Neha Verma", status: "ACTIVE", referredBy: "aarav" },
  { key: "rohit", name: "Rohit Gupta", status: "BLOCKED", referredBy: "aarav" },
  { key: "priya", name: "Priya Nair", status: "ACTIVE", referredBy: "neha" },
  { key: "imran", name: "Imran Khan", status: "ACTIVE", referredBy: null },
] as const;

const BLOG_POSTS: [string, string, string][] = [
  [
    "Welcome to the new Justreference",
    "A marketplace where every vendor is reviewed before they list.",
    "Justreference brings products, services and projects from approved vendors into one place.\n\nEvery vendor is reviewed by our team before they can list anything for sale, every payment is confirmed on our servers, and every order gets its own invoice.\n\nIf you have questions or ideas, use the Feedback page or open a support ticket from your dashboard. We read everything.",
  ],
  [
    "How the referral program works",
    "Introduce a buyer or vendor and earn when their orders complete.",
    "When you share your referral code and someone registers with it, they become part of your referral network.\n\nWhen an order placed by someone in your network is completed, a commission is recorded for you. Commissions become available after a short release window and can be paid out from your wallet once your PAN and bank account are verified.\n\nYou can follow every referral, commission and payout from your dashboard.",
  ],
];

const slugify = (value: string) =>
  `demo-${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;

async function main() {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) throw new Error("Missing DATABASE_URL in env.");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    if (process.argv.includes("--remove")) {
      await remove(prisma);
    } else {
      await seed(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function remove(prisma: PrismaClient) {
  const demoSlug = { slug: { startsWith: "demo-" } };

  // Images first: their rows reference the listings, and the files live in storage.
  const imageRows = [
    ...(await prisma.productImage.findMany({
      where: { product: demoSlug },
      select: { id: true, storagePath: true },
    })),
    ...(await prisma.serviceImage.findMany({
      where: { service: demoSlug },
      select: { id: true, storagePath: true },
    })),
    ...(await prisma.projectImage.findMany({
      where: { project: demoSlug },
      select: { id: true, storagePath: true },
    })),
  ];
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (imageRows.length > 0 && supabaseUrl && serviceRoleKey) {
    await createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
      .storage.from("catalog-public")
      .remove(imageRows.map((i) => i.storagePath));
  }
  await prisma.productImage.deleteMany({ where: { product: demoSlug } });
  await prisma.serviceImage.deleteMany({ where: { service: demoSlug } });
  await prisma.projectImage.deleteMany({ where: { project: demoSlug } });
  const counts = {
    products: (await prisma.product.deleteMany({ where: demoSlug })).count,
    services: (await prisma.service.deleteMany({ where: demoSlug })).count,
    projects: (await prisma.project.deleteMany({ where: demoSlug })).count,
  };
  const posts = (await prisma.blogPost.deleteMany({ where: demoSlug })).count;
  console.log("Removed blog posts:", posts);
  await prisma.productCategory.deleteMany({ where: demoSlug });
  await prisma.serviceCategory.deleteMany({ where: demoSlug });
  await prisma.projectCategory.deleteMany({ where: demoSlug });
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DEMO_EMAIL_DOMAIN } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const profiles = await prisma.memberProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);
  await prisma.referralRelationship.deleteMany({
    where: { OR: [{ memberId: { in: profileIds } }, { referrerId: { in: profileIds } }] },
  });
  await prisma.memberProfile.deleteMany({ where: { id: { in: profileIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.vendorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  console.log("Removed demo data:", { ...counts, vendors: userIds.length });
}

async function seed(prisma: PrismaClient) {
  const now = new Date();
  const approved = { approvalStatus: "APPROVED" as const, approvedAt: now, isActive: true };

  const vendorIds = new Map<VendorKey, string>();
  for (const vendor of VENDORS) {
    const email = `${vendor.key}${DEMO_EMAIL_DOMAIN}`;
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          fullName: vendor.name,
          status: "ACTIVE",
          emailVerifiedAt: now,
        },
      }));
    const profile = await prisma.vendorProfile.upsert({
      where: { userId: user.id },
      update: { businessName: vendor.name, approvalStatus: "APPROVED" },
      create: {
        userId: user.id,
        businessName: vendor.name,
        approvalStatus: "APPROVED",
        approvedAt: now,
      },
    });
    vendorIds.set(vendor.key, profile.id);
  }

  const customerRole = await prisma.role.findFirst({ where: { code: "CUSTOMER" } });
  const memberUserIds = new Map<string, string>();
  const memberProfiles = new Map<string, { id: string; path: string }>();
  for (const member of MEMBERS) {
    const email = `${member.key}${DEMO_EMAIL_DOMAIN}`;
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({
        data: {
          id: randomUUID(),
          email,
          fullName: member.name,
          status: member.status,
          emailVerifiedAt: now,
        },
      }));
    await prisma.user.update({ where: { id: user.id }, data: { status: member.status } });
    memberUserIds.set(member.key, user.id);

    let profile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      const parent = member.referredBy ? memberProfiles.get(member.referredBy) : undefined;
      const created = await prisma.memberProfile.create({
        data: {
          userId: user.id,
          referredByUserId: member.referredBy
            ? (memberUserIds.get(member.referredBy) ?? null)
            : null,
          referralPath: "",
        },
      });
      const memberId = formatMemberId(created.memberSeq);
      profile = await prisma.memberProfile.update({
        where: { id: created.id },
        data: {
          memberId,
          referralCode: memberId,
          referralPath: buildReferralPath(parent?.path ?? null, created.id),
        },
      });
      if (parent) {
        await prisma.referralRelationship.create({
          data: { memberId: profile.id, referrerId: parent.id, level: 1, changedAt: now },
        });
      }
    }
    memberProfiles.set(member.key, { id: profile.id, path: profile.referralPath });
    if (customerRole) {
      const hasRole = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: customerRole.id, revokedAt: null },
      });
      if (!hasRole)
        await prisma.userRole.create({ data: { userId: user.id, roleId: customerRole.id } });
    }
  }

  const categoryIds = {
    product: new Map<string, string>(),
    service: new Map<string, string>(),
    project: new Map<string, string>(),
  };
  for (const name of PRODUCT_CATEGORIES) {
    const row = await prisma.productCategory.upsert({
      where: { slug: slugify(name) },
      update: { name, deletedAt: null },
      create: { name, slug: slugify(name) },
    });
    categoryIds.product.set(name, row.id);
  }
  for (const name of SERVICE_CATEGORIES) {
    const row = await prisma.serviceCategory.upsert({
      where: { slug: slugify(name) },
      update: { name, deletedAt: null },
      create: { name, slug: slugify(name) },
    });
    categoryIds.service.set(name, row.id);
  }
  for (const name of PROJECT_CATEGORIES) {
    const row = await prisma.projectCategory.upsert({
      where: { slug: slugify(name) },
      update: { name, deletedAt: null },
      create: { name, slug: slugify(name) },
    });
    categoryIds.project.set(name, row.id);
  }

  for (const [vendor, category, title, description, price, stock] of PRODUCTS) {
    const data = {
      vendorId: vendorIds.get(vendor)!,
      categoryId: categoryIds.product.get(category)!,
      title,
      description,
      price: rupees(price),
      stock,
      deletedAt: null,
      ...approved,
    };
    await prisma.product.upsert({
      where: { slug: slugify(title) },
      update: data,
      create: { ...data, slug: slugify(title) },
    });
  }
  for (const [vendor, category, title, description, pricingType, price] of SERVICES) {
    const data = {
      vendorId: vendorIds.get(vendor)!,
      categoryId: categoryIds.service.get(category)!,
      title,
      description,
      pricingType,
      price: price === null ? null : rupees(price),
      deletedAt: null,
      ...approved,
    };
    await prisma.service.upsert({
      where: { slug: slugify(title) },
      update: data,
      create: { ...data, slug: slugify(title) },
    });
  }
  for (const [vendor, category, title, description, price] of PROJECTS) {
    const data = {
      vendorId: vendorIds.get(vendor)!,
      categoryId: categoryIds.project.get(category)!,
      title,
      description,
      price: rupees(price),
      deletedAt: null,
      ...approved,
    };
    await prisma.project.upsert({
      where: { slug: slugify(title) },
      update: data,
      create: { ...data, slug: slugify(title) },
    });
  }

  const author = await prisma.user.findUnique({
    where: { email: "admin@justreference.in" },
    select: { id: true },
  });
  if (author) {
    for (const [title, excerpt, body] of BLOG_POSTS) {
      const data = {
        title,
        excerpt,
        body,
        status: "PUBLISHED" as const,
        publishedAt: now,
        authorId: author.id,
        deletedAt: null,
      };
      await prisma.blogPost.upsert({
        where: { slug: slugify(title) },
        update: data,
        create: { ...data, slug: slugify(title) },
      });
    }
  } else {
    console.log(
      "Skipped blog posts: admin@justreference.in not found (run scripts/bootstrap-admin.ts first).",
    );
  }

  console.log("Seeded demo data:", {
    vendors: VENDORS.length,
    members: MEMBERS.length,
    products: PRODUCTS.length,
    services: SERVICES.length,
    projects: PROJECTS.length,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
