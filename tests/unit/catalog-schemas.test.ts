import { describe, expect, it } from "vitest";
import {
  categorySchema,
  createProductSchema,
  createProjectSchema,
  createServiceSchema,
  generateSlug,
  getListingSchema,
  subcategorySchema,
  updateListingStatusSchema,
  catalogListQuerySchema,
} from "@/lib/schemas/catalog";

const validCategoryId = "11111111-1111-4111-8111-111111111111";

describe("createProductSchema", () => {
  it("accepts a valid product", () => {
    const result = createProductSchema.safeParse({
      kind: "PRODUCT",
      categoryId: validCategoryId,
      title: "Wireless Mouse",
      price: "1500",
      stock: "10",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      // The form takes RUPEES; the schema hands back integer paise.
      expect(result.data.price).toBe(150000n);
      expect(result.data.stock).toBe(10);
    }
  });

  it.each([
    ["499", 49900n],
    ["1499.5", 149950n],
    ["1499.50", 149950n],
    ["0.05", 5n],
    ["0", 0n],
  ])("converts the rupee price %s to %s paise exactly", (input, expected) => {
    const result = createProductSchema.parse({
      kind: "PRODUCT",
      categoryId: validCategoryId,
      title: "Widget",
      price: input,
    });
    expect(result.price).toBe(expected);
  });

  it.each(["12.345", "1,500", "₹500", "1e3", ".5", "5."])(
    "rejects the malformed price %s",
    (input) => {
      const result = createProductSchema.safeParse({
        kind: "PRODUCT",
        categoryId: validCategoryId,
        title: "Widget",
        price: input,
      });
      expect(result.success).toBe(false);
    },
  );

  it("rejects a negative-looking price string", () => {
    const result = createProductSchema.safeParse({
      kind: "PRODUCT",
      categoryId: validCategoryId,
      title: "Widget",
      price: "-100",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-numeric price", () => {
    const result = createProductSchema.safeParse({
      kind: "PRODUCT",
      categoryId: validCategoryId,
      title: "Widget",
      price: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("defaults stock to 0 when omitted", () => {
    const result = createProductSchema.parse({
      kind: "PRODUCT",
      categoryId: validCategoryId,
      title: "Widget",
      price: "100",
    });
    expect(result.stock).toBe(0);
  });
});

describe("createServiceSchema — fixed vs quote pricing (Q-24)", () => {
  it("requires a price when pricingType is FIXED", () => {
    const result = createServiceSchema.safeParse({
      kind: "SERVICE",
      categoryId: validCategoryId,
      title: "Plumbing repair",
      pricingType: "FIXED",
    });
    expect(result.success).toBe(false);
  });

  it("allows an absent price when pricingType is QUOTE", () => {
    const result = createServiceSchema.safeParse({
      kind: "SERVICE",
      categoryId: validCategoryId,
      title: "Custom consulting",
      pricingType: "QUOTE",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a FIXED service with a price", () => {
    const result = createServiceSchema.safeParse({
      kind: "SERVICE",
      categoryId: validCategoryId,
      title: "Plumbing repair",
      pricingType: "FIXED",
      price: "50000",
    });
    expect(result.success).toBe(true);
  });
});

describe("createProjectSchema", () => {
  it("requires a price (projects are never quote-based)", () => {
    const result = createProjectSchema.safeParse({
      kind: "PROJECT",
      categoryId: validCategoryId,
      title: "Kitchen renovation",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid project", () => {
    const result = createProjectSchema.safeParse({
      kind: "PROJECT",
      categoryId: validCategoryId,
      title: "Kitchen renovation",
      price: "50000000",
    });
    expect(result.success).toBe(true);
  });
});

describe("getListingSchema", () => {
  it("returns the correct schema per kind", () => {
    expect(getListingSchema("PRODUCT")).toBe(createProductSchema);
    expect(getListingSchema("SERVICE")).toBe(createServiceSchema);
    expect(getListingSchema("PROJECT")).toBe(createProjectSchema);
  });
});

describe("categorySchema / subcategorySchema", () => {
  it("rejects a one-character category name", () => {
    expect(categorySchema.safeParse({ name: "A" }).success).toBe(false);
  });

  it("requires a valid category id for a subcategory", () => {
    expect(subcategorySchema.safeParse({ categoryId: "not-a-uuid", name: "Widgets" }).success).toBe(
      false,
    );
    expect(
      subcategorySchema.safeParse({ categoryId: validCategoryId, name: "Widgets" }).success,
    ).toBe(true);
  });
});

describe("generateSlug", () => {
  it("lowercases, strips punctuation, and hyphenates", () => {
    expect(generateSlug("Wireless Mouse (2.4GHz)")).toBe("wireless-mouse-2-4ghz");
  });

  it("appends a disambiguator when given one", () => {
    expect(generateSlug("Widget", "ab12cd34")).toBe("widget-ab12cd34");
  });
});

describe("updateListingStatusSchema", () => {
  const base = { kind: "PRODUCT" as const, id: validCategoryId };

  it("requires a reason to reject", () => {
    expect(updateListingStatusSchema.safeParse({ ...base, action: "reject" }).success).toBe(false);
    expect(
      updateListingStatusSchema.safeParse({ ...base, action: "reject", reason: "Blurry photos" })
        .success,
    ).toBe(true);
  });

  it("does not require a reason to approve/activate/deactivate/resubmit", () => {
    for (const action of ["approve", "activate", "deactivate", "resubmit"] as const) {
      expect(updateListingStatusSchema.safeParse({ ...base, action }).success).toBe(true);
    }
  });
});

describe("catalogListQuerySchema", () => {
  it("applies defaults", () => {
    const result = catalogListQuerySchema.parse({});
    expect(result).toMatchObject({ sortBy: "createdAt", sortDir: "desc", limit: 20 });
  });

  it("coerces the isActive string param to a boolean", () => {
    expect(catalogListQuerySchema.parse({ isActive: "true" }).isActive).toBe(true);
    expect(catalogListQuerySchema.parse({ isActive: "false" }).isActive).toBe(false);
    expect(catalogListQuerySchema.parse({}).isActive).toBeUndefined();
  });
});

describe("paiseToRupeesInput (editor field value)", () => {
  it.each([
    ["150000", "1500"],
    ["149950", "1499.50"],
    ["5", "0.05"],
    ["0", "0"],
    [null, ""],
    [undefined, ""],
  ])("shows %s paise as %j", async (paise, expected) => {
    const { paiseToRupeesInput } = await import("@/lib/money");
    expect(paiseToRupeesInput(paise as string | null | undefined)).toBe(expected);
  });

  it("round-trips with the schema parser", async () => {
    const { paiseToRupeesInput } = await import("@/lib/money");
    for (const paise of ["1", "99", "100", "123456", "99999999"]) {
      const result = createProductSchema.parse({
        kind: "PRODUCT",
        categoryId: validCategoryId,
        title: "Widget",
        price: paiseToRupeesInput(paise),
      });
      expect(result.price.toString()).toBe(paise);
    }
  });
});
