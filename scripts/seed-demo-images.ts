/**
 * Gives the demo listings (slug prefix "demo-", see seed-demo-catalog.ts)
 * a product image so the public portal doesn't show empty placeholders.
 *
 * Images are generated, not photographs: a soft gradient tile with the
 * category's icon (lucide path data, rendered with sharp). They contain no
 * text, so nothing depends on system fonts. Each is uploaded to the same
 * public Supabase bucket and path scheme the real uploader uses
 * (`<kind>/<itemId>/<uuid>.jpg`) and recorded in the matching *_images table.
 *
 *   npx tsx scripts/seed-demo-images.ts            # add images to demo listings that have none
 *   npx tsx scripts/seed-demo-images.ts --replace  # swap every demo listing's image for the current photo/tile
 *   npx tsx scripts/seed-demo-images.ts --remove   # delete the demo images (rows + storage objects)
 *
 * seed-demo-catalog.ts --remove also clears these before deleting listings.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const BUCKET = "catalog-public";

/**
 * Real photographs (Unsplash License, see docs/IMAGE_CREDITS.md) per demo
 * category. If a download fails the script falls back to the generated tile
 * below, so a flaky network never leaves a listing without an image.
 */
const PHOTOS: Record<string, string[]> = {
  "Office Furniture": ["1594235048794-fae8583a5af5"],
  "Computers and Accessories": ["1496181133206-80ce9b88a853", "1541807084-5c52b6b3adef"],
  "Safety and Fire Equipment": ["1625958936686-a9343dc35b5b"],
  "Medical Supplies": ["1505751172876-fa1923c5c528", "1655313719493-16ebe4906441"],
  "Stationery and Printing": ["1562240020-ce31ccb0fa7d", "1585119192382-71236d43b689"],
  "Electrical and Lighting": ["1532007271951-c487760934ae", "1552862750-746b8f6f7f25"],
  "Security Services": ["1589935447067-5531094415d1"],
  "Catering and Housekeeping": ["1627905646269-7f034dcc5738"],
  "Transport and Vehicle Hire": ["1518614768202-663a3a0ecf59", "1624807806624-dd74b21e717a"],
  "IT and Software Support": ["1712159018726-4564d92f3ec2"],
  "Training and Consulting": ["1524178232363-1fb2b075b655"],
  "Civil and Interiors": ["1715593949273-09009558300a"],
  "Software Development": ["1542831371-29b0f74f9713", "1515879218367-8466d910aaa4"],
  "Installation Projects": ["1726795867801-63c0a37b80c6"],
};

const photoCache = new Map<string, Buffer | null>();
const nextVariant = new Map<string, number>();
/** Hands out a category's photos in turn so two listings side by side don't look identical. */
async function downloadPhoto(category: string): Promise<Buffer | null> {
  const ids = PHOTOS[category];
  if (!ids?.length) return null;
  const turn = nextVariant.get(category) ?? 0;
  nextVariant.set(category, turn + 1);
  const id = ids[turn % ids.length]!;
  if (photoCache.has(id)) return photoCache.get(id) ?? null;
  try {
    const response = await fetch(
      `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1400&q=80`,
    );
    if (!response.ok) throw new Error(String(response.status));
    const jpeg = await sharp(Buffer.from(await response.arrayBuffer()))
      .resize({ width: 1200, height: 900, fit: "cover" })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    photoCache.set(id, jpeg);
    return jpeg;
  } catch (error) {
    console.warn(
      `Could not download photo ${id} for "${category}" (${String(error)}); using a generated tile.`,
    );
    photoCache.set(id, null);
    return null;
  }
}

/** Category name -> [lucide icon file, gradient from, gradient to]. */
const LOOKS: Record<string, [string, string, string]> = {
  "Office Furniture": ["armchair", "#f4e3d7", "#e8b9a0"],
  "Computers and Accessories": ["laptop", "#dfe7f2", "#aebfdc"],
  "Safety and Fire Equipment": ["fire-extinguisher", "#fbe0dc", "#ef9d93"],
  "Medical Supplies": ["stethoscope", "#dcefe9", "#9fd3c3"],
  "Stationery and Printing": ["printer", "#ece6f4", "#c6b6e0"],
  "Electrical and Lighting": ["lightbulb", "#fbf0cf", "#f0d37c"],
  "Security Services": ["shield-check", "#dfe7f2", "#9fb3d6"],
  "Catering and Housekeeping": ["utensils", "#f8e6d2", "#efc08e"],
  "Transport and Vehicle Hire": ["car", "#e1ecf5", "#a4c8e4"],
  "IT and Software Support": ["headset", "#e6e3f5", "#b8b0e6"],
  "Training and Consulting": ["graduation-cap", "#dcefe9", "#a8d6c6"],
  "Civil and Interiors": ["building-complex", "#efe6dc", "#d4bfa5"],
  "Software Development": ["code", "#e1e8f5", "#9db4e6"],
  "Installation Projects": ["sun", "#fbf0cf", "#f2c96b"],
};
const FALLBACK: [string, string, string] = ["package", "#ececec", "#c9c9c9"];

type IconNode = [string, Record<string, string | number>][];

async function iconNodes(file: string): Promise<IconNode> {
  // Depending on tsx's ESM/CJS interop the named export can surface directly or under `default`.
  const mod = (await import(`lucide-react/dist/esm/icons/${file}.mjs`)) as Record<string, unknown>;
  const holder = (mod["__iconData"] ??
    (mod["default"] as Record<string, unknown> | undefined)?.["__iconData"]) as
    { node: IconNode } | undefined;
  if (!holder) throw new Error(`Could not read icon data for "${file}".`);
  return holder.node;
}

function toSvg(nodes: IconNode, from: string, to: string): string {
  const shapes = nodes
    .map(([tag, attrs]) => {
      const rest = Object.entries(attrs)
        .filter(([k]) => k !== "key")
        .map(([k, v]) => `${k}="${v}"`)
        .join(" ");
      return `<${tag} ${rest}/>`;
    })
    .join("");
  // Icon is drawn on a 24-unit grid; scale it to ~46% of the 1200px tile, centred.
  const scale = 22;
  const offset = (1200 - 24 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
  <rect width="1200" height="1200" fill="url(#g)"/>
  <circle cx="1020" cy="170" r="260" fill="#ffffff" fill-opacity="0.22"/>
  <circle cx="140" cy="1060" r="320" fill="#ffffff" fill-opacity="0.16"/>
  <g transform="translate(${offset} ${offset}) scale(${scale})" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">${shapes}</g>
</svg>`;
}

async function main() {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const databaseUrl = process.env["DATABASE_URL"];
  if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL in env.",
    );
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The app's uploader (src/server/lib/image-upload.ts) and the public
  // image URLs both assume this public bucket exists; a fresh Supabase
  // project doesn't have it, so image upload fails with "Bucket not found".
  const existing = await supabase.storage.getBucket(BUCKET);
  if (existing.error) {
    const created = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: 5 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (created.error)
      throw new Error(`Could not create bucket "${BUCKET}": ${created.error.message}`);
    console.log(`Created public storage bucket "${BUCKET}".`);
  }
  const storage = supabase.storage.from(BUCKET);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  const kinds = [
    {
      owner: "product" as const,
      items: () =>
        prisma.product.findMany({
          where: { slug: { startsWith: "demo-" } },
          select: {
            id: true,
            category: { select: { name: true } },
            images: { select: { id: true, storagePath: true } },
          },
        }),
      createImage: (itemId: string, storagePath: string) =>
        prisma.productImage.create({ data: { productId: itemId, storagePath, sortOrder: 0 } }),
      deleteImages: (ids: string[]) =>
        prisma.productImage.deleteMany({ where: { id: { in: ids } } }),
    },
    {
      owner: "service" as const,
      items: () =>
        prisma.service.findMany({
          where: { slug: { startsWith: "demo-" } },
          select: {
            id: true,
            category: { select: { name: true } },
            images: { select: { id: true, storagePath: true } },
          },
        }),
      createImage: (itemId: string, storagePath: string) =>
        prisma.serviceImage.create({ data: { serviceId: itemId, storagePath, sortOrder: 0 } }),
      deleteImages: (ids: string[]) =>
        prisma.serviceImage.deleteMany({ where: { id: { in: ids } } }),
    },
    {
      owner: "project" as const,
      items: () =>
        prisma.project.findMany({
          where: { slug: { startsWith: "demo-" } },
          select: {
            id: true,
            category: { select: { name: true } },
            images: { select: { id: true, storagePath: true } },
          },
        }),
      createImage: (itemId: string, storagePath: string) =>
        prisma.projectImage.create({ data: { projectId: itemId, storagePath, sortOrder: 0 } }),
      deleteImages: (ids: string[]) =>
        prisma.projectImage.deleteMany({ where: { id: { in: ids } } }),
    },
  ];

  try {
    const remove = process.argv.includes("--remove");
    const replace = process.argv.includes("--replace");
    let added = 0;
    let removed = 0;
    for (const kind of kinds) {
      for (const item of await kind.items()) {
        if (remove) {
          if (item.images.length === 0) continue;
          await storage.remove(item.images.map((i) => i.storagePath));
          await kind.deleteImages(item.images.map((i) => i.id));
          removed += item.images.length;
          continue;
        }
        if (item.images.length > 0 && replace) {
          await storage.remove(item.images.map((i) => i.storagePath));
          await kind.deleteImages(item.images.map((i) => i.id));
        } else if (item.images.length > 0) {
          continue;
        }
        const photo = await downloadPhoto(item.category.name);
        const [icon, from, to] = LOOKS[item.category.name] ?? FALLBACK;
        const jpeg =
          photo ??
          (await sharp(Buffer.from(toSvg(await iconNodes(icon), from, to)))
            .jpeg({ quality: 82, mozjpeg: true })
            .toBuffer());
        const storagePath = `${kind.owner}/${item.id}/${randomUUID()}.jpg`;
        const { error } = await storage.upload(storagePath, jpeg, {
          contentType: "image/jpeg",
          upsert: false,
        });
        if (error) throw new Error(`Upload failed for ${storagePath}: ${error.message}`);
        await kind.createImage(item.id, storagePath);
        added += 1;
      }
    }
    console.log(remove ? `Removed ${removed} demo images.` : `Added ${added} demo images.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
