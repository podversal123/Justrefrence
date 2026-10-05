import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { RequirementItemKind, RequirementType } from "@/generated/prisma/enums";

const LIST_SELECT = {
  id: true,
  reqSeq: true,
  title: true,
  itemKind: true,
  categoryLabel: true,
  quantity: true,
  unit: true,
  deliveryCity: true,
  type: true,
  status: true,
  closesAt: true,
  estimatedValue: true,
  createdAt: true,
  buyer: { select: { fullName: true } },
  _count: { select: { bids: { where: { status: { not: "WITHDRAWN" as const } } } } },
} satisfies Prisma.RequirementSelect;

const PAGE_SIZE = 20;

export type RequirementState = "open" | "closed" | "all";

export interface RequirementFilter {
  search?: string;
  kind?: RequirementItemKind;
  type?: RequirementType;
  state: RequirementState;
  cursor?: string;
}

/** `REQ-000012`, `req12` or `12` all find requirement #12, alongside the text search. */
function sequenceFromSearch(search: string): bigint | null {
  const match = /^(?:req-?)?0*(\d{1,12})$/i.exec(search.trim());
  return match?.[1] ? BigInt(match[1]) : null;
}

function buildWhere(filter: RequirementFilter, now: Date): Prisma.RequirementWhereInput {
  const and: Prisma.RequirementWhereInput[] = [];
  if (filter.state === "open") and.push({ status: "OPEN", closesAt: { gt: now } });
  if (filter.state === "closed") {
    and.push({
      OR: [
        { status: { in: ["CLOSED", "AWARDED", "CANCELLED"] } },
        { status: "OPEN", closesAt: { lte: now } },
      ],
    });
  }
  if (filter.kind) and.push({ itemKind: filter.kind });
  if (filter.type) and.push({ type: filter.type });
  const search = filter.search?.trim();
  if (search) {
    const seq = sequenceFromSearch(search);
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { categoryLabel: { contains: search, mode: "insensitive" } },
        { deliveryCity: { contains: search, mode: "insensitive" } },
        ...(seq !== null ? [{ reqSeq: seq }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

/** Public browse list: keyset pagination, soonest-closing first for open ones, newest first otherwise. */
export async function listRequirements(filter: RequirementFilter, now = new Date()) {
  const rows = await prisma.requirement.findMany({
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

export async function listClosingSoon(limit: number, now = new Date()) {
  return prisma.requirement.findMany({
    where: { status: "OPEN", closesAt: { gt: now } },
    orderBy: { closesAt: "asc" },
    take: limit,
    select: LIST_SELECT,
  });
}

export async function countOpenRequirements(now = new Date()) {
  return prisma.requirement.count({ where: { status: "OPEN", closesAt: { gt: now } } });
}

export async function listRequirementsForBuyer(buyerId: string) {
  return prisma.requirement.findMany({
    where: { buyerId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: LIST_SELECT,
  });
}

export async function listAllRequirementsForStaff(
  filter: { search?: string; state: RequirementState; cursor?: string },
  now = new Date(),
) {
  return listRequirements({ ...filter }, now);
}

export async function getRequirementById(id: string) {
  return prisma.requirement.findUnique({
    where: { id },
    select: {
      ...LIST_SELECT,
      description: true,
      buyerId: true,
      minDecrement: true,
      autoExtendMinutes: true,
      awardedBidId: true,
      cancelledReason: true,
    },
  });
}

export async function listBidRows(requirementId: string) {
  const bids = await prisma.bid.findMany({
    where: { requirementId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      vendorId: true,
      unitPrice: true,
      totalPrice: true,
      deliveryDays: true,
      note: true,
      status: true,
      priceSetAt: true,
      createdAt: true,
      vendor: { select: { businessName: true } },
    },
  });
  return bids.map(({ vendor, ...bid }) => ({ ...bid, vendorName: vendor.businessName }));
}

export async function listBidRevisions(bidId: string) {
  return prisma.bidRevision.findMany({
    where: { bidId },
    orderBy: { createdAt: "asc" },
    select: { id: true, unitPrice: true, totalPrice: true, deliveryDays: true, createdAt: true },
  });
}

export async function listBidsForVendor(vendorId: string) {
  return prisma.bid.findMany({
    where: { vendorId },
    orderBy: { updatedAt: "desc" },
    take: 100,
    select: {
      id: true,
      unitPrice: true,
      totalPrice: true,
      deliveryDays: true,
      status: true,
      updatedAt: true,
      requirement: { select: LIST_SELECT },
    },
  });
}
