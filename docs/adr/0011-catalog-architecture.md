# ADR-0011: Catalog — three parallel Prisma model families, one shared application-layer engine

## Status
Accepted

## Context
Phase 3 asks for a **reusable catalog architecture** across three genuinely similar-but-distinct listing types — Products, Services, Projects — each needing category/subcategory, CRUD, approval, active/inactive, images, vendor association, search/filter/pagination, with admin managing everything, vendors managing only their own, and customers seeing only approved+active listings.

Two axes of "reusable" had to be decided: the **database shape** (one polymorphic table vs. three parallel tables) and the **application code shape** (three hand-written copies vs. one shared implementation).

## Decision

**Database: three parallel model families**, not one polymorphic `listings` table. `ProductCategory/ProductSubcategory/Product/ProductImage`, and the same pattern for `Service*` and `Project*`. Field **names** are kept identical across all three (including calling a project's price `price`, not `cost`, even though docs/database-tables.md originally used "cost") specifically so the application layer can address any of the three through one config shape without a field-name lookup table.

**Application layer: one generic engine, thin per-kind edges.**

```
UI (three thin page.tsx files per surface — admin/vendor/public — each ~15-20 lines,
    rendering shared components: DataTable, FilterBar, ImageUploader, etc.)
        ↓
Server Actions (ONE file, src/server/services/catalog-actions.ts — every exported
    action takes a `kind: "PRODUCT" | "SERVICE" | "PROJECT"` field from FormData
    and dispatches to the generic implementation; this is what Next.js's "use server"
    static analysis actually requires — see below)
        ↓
Domain (src/server/domain/catalog/*.ts — pure state machine + validation rules,
    generic over CatalogKind, unit-testable with no I/O)
        ↓
Repository (src/server/repositories/catalog/*.ts — one factory function,
    createCatalogRepository(config), instantiated three times — once per Prisma
    model family — returning the same method set for all three)
        ↓
PostgreSQL (three parallel table families)
```

### Why not one polymorphic `listings` table?
- **Referential integrity.** A `product_id` FK on `product_images` is enforceable by Postgres; a polymorphic `(listing_type, listing_id)` pair on a shared `images` table is not — the database can't stop an image row from pointing at a project when `listing_type='PRODUCT'`.
- **Divergent fields.** Products have `stock` and `sku`; Services have `pricingType`/nullable `price` (Q-24: fixed-or-quote); Projects have neither. A shared table would need every field nullable for two-thirds of its rows, and CHECK constraints to simulate what three tables give for free.
- **Independent evolution.** Phase 0's docs already anticipated Projects growing `project_milestones`/`project_documents` that Products/Services will never need (deferred past Phase 3, but the schema needs room for it without touching Product/Service).

### Why not three independently hand-written implementations?
That's the opposite failure mode: three copies of the same search/filter/pagination/approval-transition/image-upload logic, drifting apart over time, tripling the surface area for bugs and tests. Since Prisma generates a **structurally identical** delegate API for every model (`findMany`, `create`, `update`, …), a single generic factory function typed over that shared shape gives one real implementation with three instantiations — see `src/server/repositories/catalog/factory.ts`.

### Why Server Actions aren't also generated per-kind
Next.js's `"use server"` compiler transform requires each server action to be a **statically visible** top-level export — it cannot recognize a function returned at runtime from a factory call as a callable action. So the *action* functions themselves (`createListingAction`, `updateListingStatusAction`, `uploadListingImageAction`, …) are hand-written, but each is a ~10-line wrapper: validate the `kind` field, resolve the matching repository/permission/schema from a small lookup table, and call the one real generic implementation in the domain layer. The reuse lives one layer down from where Next.js's static-analysis constraint bites.

## Consequences
- Adding a fourth catalog type in a future phase (unlikely, but the architecture should say what happens if it did) means: one new Prisma model family, one new entry in the `CATALOG_CONFIG` lookup table, and zero new UI/service code beyond page-level wiring.
- A bug fix in search/filter/approval logic is fixed once, for all three kinds, instead of needing to be remembered and reapplied three times.
- The cost: the generic layer's types are necessarily a bit more abstract (discriminated unions, a config-object pattern) than three straightforwardly-typed implementations would be. Judged worth it given the brief's explicit "reusable" requirement and the real duplication risk otherwise.

## Alternatives considered
- **Single polymorphic table** — rejected per the referential-integrity and divergent-fields reasoning above.
- **Three independent copies** — rejected as the direct opposite of what was asked, and a maintainability trap (see docs/architecture.md's "no duplicated business logic" principle).
