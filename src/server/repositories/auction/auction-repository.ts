import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AuctionStatus, CatalogItemKind } from "@/generated/prisma/enums";

/** Shape every auction list/card needs: the auction, its seller's business name, and how many bids it has. */
const LIST_SELECT = {
  id: true,
  auctionSeq: true,
  title: true,
  itemType: true,
  itemId: true,
  quantity: true,
  startPrice: true,
  closesAt: true,
  status: true,
  checkoutId: true,
  createdAt: true,
  vendor: { select: { businessName: true } },
  _count: { select: { bids: true } },
  bids: { orderBy: { unitPrice: "desc" as const }, take: 1, select: { unitPrice: true } },
} satisfies Prisma.AuctionSelect;

export type AuctionListRow = Prisma.AuctionGetPayload<{ select: typeof LIST_SELECT }>;

const PAGE_SIZE = 20;

export type AuctionState = "open" | "ended" | "all";

export interface AuctionFilter {
  search?: string;
  kind?: CatalogItemKind;
  state: AuctionState;
  cursor?: string;
}

/** `AUC-000012`, `auc12` or `12` all find auction #12, alongside the text search. */
function sequenceFromSearch(search: string): bigint | null {
  const match = /^(?:auc-?)?0*(\d{1,12})$/i.exec(search.trim());
  return match?.[1] ? BigInt(match[1]) : null;
}

function buildWhere(filter: AuctionFilter, now: Date): Prisma.AuctionWhereInput {
  const and: Prisma.AuctionWhereInput[] = [];
  if (filter.state === "open") and.push({ status: "OPEN", closesAt: { gt: now } });
  if (filter.state === "ended") {
    and.push({
      OR: [
        { status: { in: ["SOLD", "UNSOLD", "CANCELLED"] } },
        { status: "OPEN", closesAt: { lte: now } },
      ],
    });
  }
  if (filter.kind) and.push({ itemType: filter.kind });
  const search = filter.search?.trim();
  if (search) {
    const seq = sequenceFromSearch(search);
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { vendor: { businessName: { contains: search, mode: "insensitive" } } },
        ...(seq !== null ? [{ auctionSeq: seq }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

/** Public browse list: keyset pagination, soonest-closing first for open ones, newest first otherwise. */
export async function listAuctions(filter: AuctionFilter, now = new Date()) {
  const rows = await prisma.auction.findMany({
    where: buildWhere(filter, now),
    orderBy:
      filter.state === "open"
        ? [{ closesAt: "asc" }, { id: "asc" }]
        : [{ createdAt: "desc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: LIST_SELECT,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export async function countOpenAuctions(now = new Date()) {
  return prisma.auction.count({ where: { status: "OPEN", closesAt: { gt: now } } });
}

export async function listAuctionsForVendor(vendorId: string) {
  return prisma.auction.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: LIST_SELECT,
  });
}

/** Auctions a member has bid in (newest activity first), each with whether they are winning or won. */
export async function listAuctionsForBidder(bidderId: string) {
  const rows = await prisma.auction.findMany({
    where: { bids: { some: { bidderId } } },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      ...LIST_SELECT,
      winningBid: { select: { bidderId: true, totalPrice: true } },
      _count: { select: { bids: true } },
    },
  });
  const mine = await prisma.auctionBid.groupBy({
    by: ["auctionId"],
    where: { bidderId, auctionId: { in: rows.map((r) => r.id) } },
    _max: { unitPrice: true },
  });
  const myBest = new Map(mine.map((m) => [m.auctionId, m._max.unitPrice]));
  return rows.map((row) => ({ ...row, myBestUnitPrice: myBest.get(row.id) ?? null }));
}

export async function listAllAuctionsForStaff(filter: AuctionFilter, now = new Date()) {
  return listAuctions(filter, now);
}

export async function getAuctionById(id: string) {
  const auction = await prisma.auction.findUnique({
    where: { id },
    select: {
      id: true,
      auctionSeq: true,
      vendorId: true,
      itemType: true,
      itemId: true,
      title: true,
      description: true,
      quantity: true,
      startPrice: true,
      reservePrice: true,
      minIncrement: true,
      autoExtendMinutes: true,
      closesAt: true,
      status: true,
      winningBidId: true,
      checkoutId: true,
      cancelledReason: true,
      createdAt: true,
      vendor: { select: { businessName: true, userId: true } },
      winningBid: { select: { bidderId: true } },
    },
  });
  return auction;
}

export async function listAuctionBidRows(auctionId: string) {
  const bids = await prisma.auctionBid.findMany({
    where: { auctionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      bidderId: true,
      unitPrice: true,
      totalPrice: true,
      createdAt: true,
      bidder: { select: { fullName: true, email: true } },
    },
  });
  return bids.map(({ bidder, ...bid }) => ({
    ...bid,
    bidderName: bidder.fullName ?? bidder.email,
  }));
}

export async function countAuctionsByStatus(): Promise<Record<AuctionStatus, number>> {
  const groups = await prisma.auction.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<AuctionStatus, number> = { OPEN: 0, SOLD: 0, UNSOLD: 0, CANCELLED: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}

export interface AuctionableListing {
  kind: CatalogItemKind;
  id: string;
  title: string;
  price: bigint | null;
  stock: number | null;
}

/** The vendor's own approved, active listings, ready to put up for auction. */
export async function listAuctionableListings(vendorId: string): Promise<AuctionableListing[]> {
  const where = { vendorId, approvalStatus: "APPROVED" as const, isActive: true, deletedAt: null };
  const [products, services, projects] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { title: "asc" },
      take: 200,
      select: { id: true, title: true, price: true, stock: true },
    }),
    prisma.service.findMany({
      where,
      orderBy: { title: "asc" },
      take: 200,
      select: { id: true, title: true, price: true },
    }),
    prisma.project.findMany({
      where,
      orderBy: { title: "asc" },
      take: 200,
      select: { id: true, title: true, price: true },
    }),
  ]);
  return [
    ...products.map((p) => ({ kind: "PRODUCT" as const, ...p })),
    ...services.map((s) => ({ kind: "SERVICE" as const, ...s, stock: null })),
    ...projects.map((p) => ({ kind: "PROJECT" as const, ...p, stock: null })),
  ];
}

/** Status of the order an auction sale turned into, so the winner can be sent back to pay if they left. */
export async function getAuctionOrderStatus(checkoutId: string) {
  const order = await prisma.order.findFirst({
    where: { checkoutId },
    select: { id: true, status: true },
  });
  return order;
}
