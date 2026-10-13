import { Prisma } from "@/generated/prisma/client";
import type { ChangeEntityType } from "@/generated/prisma/enums";
import { prisma } from "@/server/lib/prisma";
import { formatPaise } from "@/lib/money";
import type { FieldSpec, FieldValues } from "@/server/domain/approvals/diff";

/**
 * One handler per kind of record that can be changed through a request. A handler knows how to read
 * the record's current values, how to show them to a person, and how to write approved values back.
 * Adding a new kind of record to the approval flow means adding one handler here, nothing else.
 *
 * `raw` values are what is stored and applied (money as a paise string, a date as YYYY-MM-DD);
 * `display` values are what a reviewer reads.
 */

export type Tx = Prisma.TransactionClient;

export interface Snapshot {
  /** A readable name for the record, kept on the request. */
  label: string;
  raw: FieldValues;
}

export interface ChangeHandler {
  fields: readonly FieldSpec[];
  load(entityId: string): Promise<Snapshot | null>;
  display(raw: FieldValues): Promise<FieldValues>;
  apply(tx: Tx, entityId: string, changed: FieldValues): Promise<void>;
}

const has = (changed: FieldValues, key: string) =>
  Object.prototype.hasOwnProperty.call(changed, key);

// ---------------------------------------------------------------- member profile

const MEMBER_FIELDS = [
  { key: "fullName", label: "Full name" },
  { key: "dob", label: "Date of birth" },
  { key: "pan", label: "PAN" },
  { key: "gstin", label: "GSTIN" },
  { key: "telephone", label: "Telephone" },
  { key: "websiteUrl", label: "Website" },
  { key: "socialLinks", label: "Social links" },
] as const;

const memberHandler: ChangeHandler = {
  fields: MEMBER_FIELDS,
  async load(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        email: true,
        memberProfile: {
          select: {
            dob: true,
            pan: true,
            gstin: true,
            telephone: true,
            websiteUrl: true,
            socialLinks: true,
          },
        },
      },
    });
    if (!user?.memberProfile) return null;
    const p = user.memberProfile;
    return {
      label: user.fullName ?? user.email,
      raw: {
        fullName: user.fullName,
        dob: p.dob ? p.dob.toISOString().slice(0, 10) : null,
        pan: p.pan,
        gstin: p.gstin,
        telephone: p.telephone,
        websiteUrl: p.websiteUrl,
        socialLinks: typeof p.socialLinks === "string" ? p.socialLinks : null,
      },
    };
  },
  async display(raw) {
    return raw;
  },
  async apply(tx, userId, changed) {
    if (has(changed, "fullName")) {
      await tx.user.update({ where: { id: userId }, data: { fullName: changed["fullName"] } });
    }
    const data: Prisma.MemberProfileUpdateInput = {};
    if (has(changed, "dob")) data.dob = changed["dob"] ? new Date(changed["dob"]) : null;
    if (has(changed, "pan")) data.pan = changed["pan"];
    if (has(changed, "gstin")) data.gstin = changed["gstin"];
    if (has(changed, "telephone")) data.telephone = changed["telephone"];
    if (has(changed, "websiteUrl")) data.websiteUrl = changed["websiteUrl"];
    if (has(changed, "socialLinks")) {
      data.socialLinks = changed["socialLinks"] ? changed["socialLinks"] : Prisma.JsonNull;
    }
    if (Object.keys(data).length > 0) {
      await tx.memberProfile.update({ where: { userId }, data });
    }
  },
};

// ---------------------------------------------------------------- vendor profile

const VENDOR_FIELDS = [
  { key: "businessName", label: "Business name" },
  { key: "phone", label: "Business mobile" },
  { key: "telephone", label: "Telephone" },
  { key: "gstin", label: "GSTIN" },
  { key: "pan", label: "Business PAN" },
] as const;

const vendorHandler: ChangeHandler = {
  fields: VENDOR_FIELDS,
  async load(vendorProfileId) {
    const v = await prisma.vendorProfile.findUnique({
      where: { id: vendorProfileId },
      select: { businessName: true, phone: true, telephone: true, gstin: true, pan: true },
    });
    if (!v) return null;
    return { label: v.businessName, raw: { ...v } };
  },
  async display(raw) {
    return raw;
  },
  async apply(tx, vendorProfileId, changed) {
    const data: Prisma.VendorProfileUpdateInput = {};
    if (has(changed, "businessName") && changed["businessName"]) {
      data.businessName = changed["businessName"];
    }
    if (has(changed, "phone")) data.phone = changed["phone"];
    if (has(changed, "telephone")) data.telephone = changed["telephone"];
    if (has(changed, "gstin")) data.gstin = changed["gstin"];
    if (has(changed, "pan")) data.pan = changed["pan"];
    if (Object.keys(data).length > 0) {
      await tx.vendorProfile.update({ where: { id: vendorProfileId }, data });
    }
  },
};

// ---------------------------------------------------------------- catalog listings

type ListingKind = "PRODUCT" | "SERVICE" | "PROJECT";

const LISTING_FIELDS: Record<ListingKind, readonly FieldSpec[]> = {
  PRODUCT: [
    { key: "title", label: "Title" },
    { key: "categoryId", label: "Category" },
    { key: "subcategoryId", label: "Subcategory" },
    { key: "description", label: "Description" },
    { key: "price", label: "Price" },
    { key: "sku", label: "SKU" },
    { key: "stock", label: "Stock" },
  ],
  SERVICE: [
    { key: "title", label: "Title" },
    { key: "categoryId", label: "Category" },
    { key: "subcategoryId", label: "Subcategory" },
    { key: "description", label: "Description" },
    { key: "pricingType", label: "Pricing" },
    { key: "price", label: "Price" },
  ],
  PROJECT: [
    { key: "title", label: "Title" },
    { key: "categoryId", label: "Category" },
    { key: "subcategoryId", label: "Subcategory" },
    { key: "description", label: "Description" },
    { key: "price", label: "Price" },
  ],
};

/**
 * Prisma gives each model its own delegate type; these three share the same shape for what is
 * needed here, so they are reached through one small, explicit lookup instead of three copies.
 */
type AnyDelegate = any;

function listingDelegates(client: Tx | typeof prisma, kind: ListingKind) {
  switch (kind) {
    case "PRODUCT":
      return {
        item: client.product as AnyDelegate,
        category: client.productCategory as AnyDelegate,
        subcategory: client.productSubcategory as AnyDelegate,
      };
    case "SERVICE":
      return {
        item: client.service as AnyDelegate,
        category: client.serviceCategory as AnyDelegate,
        subcategory: client.serviceSubcategory as AnyDelegate,
      };
    case "PROJECT":
      return {
        item: client.project as AnyDelegate,
        category: client.projectCategory as AnyDelegate,
        subcategory: client.projectSubcategory as AnyDelegate,
      };
  }
}

function listingHandler(kind: ListingKind): ChangeHandler {
  return {
    fields: LISTING_FIELDS[kind],
    async load(id) {
      const row = await listingDelegates(prisma, kind).item.findUnique({ where: { id } });
      if (!row || row.deletedAt) return null;
      return {
        label: row.title,
        raw: {
          title: row.title,
          categoryId: row.categoryId,
          subcategoryId: row.subcategoryId,
          description: row.description,
          price: row.price === null || row.price === undefined ? null : String(row.price),
          sku: row.sku ?? null,
          stock: row.stock === undefined ? null : String(row.stock),
          pricingType: row.pricingType ?? null,
        },
      };
    },
    async display(raw) {
      const d = listingDelegates(prisma, kind);
      const [category, subcategory] = await Promise.all([
        raw["categoryId"]
          ? d.category.findUnique({ where: { id: raw["categoryId"] }, select: { name: true } })
          : null,
        raw["subcategoryId"]
          ? d.subcategory.findUnique({
              where: { id: raw["subcategoryId"] },
              select: { name: true },
            })
          : null,
      ]);
      return {
        ...raw,
        categoryId: category?.name ?? null,
        subcategoryId: subcategory?.name ?? null,
        price: raw["price"] ? formatPaise(raw["price"]) : null,
        pricingType:
          raw["pricingType"] === "QUOTE"
            ? "Quote on request"
            : raw["pricingType"] === "FIXED"
              ? "Fixed price"
              : null,
      };
    },
    async apply(tx, id, changed) {
      const data: Record<string, unknown> = {};
      if (has(changed, "title") && changed["title"]) data["title"] = changed["title"];
      if (has(changed, "categoryId") && changed["categoryId"]) {
        data["categoryId"] = changed["categoryId"];
      }
      if (has(changed, "subcategoryId")) data["subcategoryId"] = changed["subcategoryId"];
      if (has(changed, "description")) data["description"] = changed["description"];
      if (has(changed, "price")) data["price"] = changed["price"] ? BigInt(changed["price"]) : null;
      if (has(changed, "sku")) data["sku"] = changed["sku"];
      if (has(changed, "stock")) data["stock"] = Number(changed["stock"] ?? 0);
      if (has(changed, "pricingType")) data["pricingType"] = changed["pricingType"];
      if (Object.keys(data).length > 0) {
        await listingDelegates(tx, kind).item.update({ where: { id }, data });
      }
    },
  };
}

const HANDLERS: Record<ChangeEntityType, ChangeHandler> = {
  MEMBER_PROFILE: memberHandler,
  VENDOR_PROFILE: vendorHandler,
  PRODUCT: listingHandler("PRODUCT"),
  SERVICE: listingHandler("SERVICE"),
  PROJECT: listingHandler("PROJECT"),
};

export function getChangeHandler(entityType: ChangeEntityType): ChangeHandler {
  return HANDLERS[entityType];
}

export const ENTITY_LABELS: Record<ChangeEntityType, string> = {
  MEMBER_PROFILE: "Member profile",
  VENDOR_PROFILE: "Vendor profile",
  PRODUCT: "Product",
  SERVICE: "Service",
  PROJECT: "Project",
};

/** Where an admin goes to look at the record itself. */
export function entityPath(entityType: ChangeEntityType, entityId: string): string {
  switch (entityType) {
    case "MEMBER_PROFILE":
      return `/admin/members/${entityId}`;
    case "VENDOR_PROFILE":
      return `/admin/vendors/${entityId}`;
    case "PRODUCT":
      return `/admin/catalog/products/${entityId}`;
    case "SERVICE":
      return `/admin/catalog/services/${entityId}`;
    case "PROJECT":
      return `/admin/catalog/projects/${entityId}`;
  }
}
