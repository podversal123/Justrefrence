import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, Menu, ShoppingCart, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PortalSearch } from "@/components/portal/portal-search";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { getAuthSession } from "@/server/auth/session";
import { countOpenCartItems } from "@/server/repositories/commerce/cart-repository";
import {
  getProductCategoriesWithCounts,
  getServiceCategoriesWithCounts,
  type CategoryWithCount,
} from "@/server/repositories/marketplace-stats";

/**
 * Public portal header, two tiers (a layout pattern borrowed from
 * government/enterprise procurement portals, which have the same job:
 * many categories, one search, lots of returning buyers):
 *   1. brand + search — the primary task, always one click away
 *   2. category band  — mega-menu of real categories, main sections, and a
 *      "More" menu for the secondary pages (About, Contact, News, Feedback)
 * Session, cart count and categories are all server-fetched; the category
 * query is cached (marketplace-stats.ts) and failure-tolerant so a
 * database hiccup degrades the menu, never the page.
 */

const NAV_LINKS: { href: Route; label: string }[] = [
  { href: "/products", label: "Products" },
  { href: "/services", label: "Services" },
  { href: "/projects", label: "Projects" },
  // New routes aren't in the generated typed-route table until the next typegen, hence the cast.
  { href: "/bids" as Route, label: "Bids and auctions" },
];

/** Secondary pages: one dropdown on desktop, plain links in the mobile sheet. */
const MORE_LINKS: { href: Route; label: string }[] = [
  { href: "/about" as Route, label: "About us" },
  { href: "/contact" as Route, label: "Contact us" },
  { href: "/blog", label: "News and updates" },
  { href: "/feedback", label: "Feedback" },
];

const MENU_CATEGORY_LIMIT = 10;

const mobileLinkClass = "hover:bg-muted flex h-11 items-center rounded-lg px-2 text-sm font-medium";
const bandLinkClass =
  "hover:bg-primary-foreground/10 focus-visible:bg-primary-foreground/10 flex h-11 items-center rounded-md px-3 text-sm font-medium outline-none";

async function loadCategories(): Promise<{
  products: CategoryWithCount[];
  services: CategoryWithCount[];
}> {
  const [products, services] = await Promise.allSettled([
    getProductCategoriesWithCounts(),
    getServiceCategoriesWithCounts(),
  ]);
  const byPopularity = (a: CategoryWithCount, b: CategoryWithCount) => b.itemCount - a.itemCount;
  return {
    products: products.status === "fulfilled" ? [...products.value].sort(byPopularity) : [],
    services: services.status === "fulfilled" ? [...services.value].sort(byPopularity) : [],
  };
}

export async function PortalHeader() {
  const session = await getAuthSession();
  const [cartCount, categories] = await Promise.all([
    session ? countOpenCartItems(session.userId) : Promise.resolve(0),
    loadCategories(),
  ]);
  const cartLabel = cartCount > 0 ? `Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}` : "Cart";
  const popularCategories = [
    ...categories.products.slice(0, 4).map((c) => ({
      id: `p-${c.id}`,
      name: c.name,
      href: `/products?categoryId=${c.id}`,
    })),
    ...categories.services.slice(0, 2).map((c) => ({
      id: `s-${c.id}`,
      name: c.name,
      href: `/services?categoryId=${c.id}`,
    })),
  ];
  const accountHref = (session ? "/dashboard" : "/login") as Route;
  const accountLabel = session ? "Dashboard" : "Sign in";

  return (
    <header className="sticky top-0 z-30">
      {/* Tier 1 — brand, search, account */}
      <div className="bg-background border-b shadow-[0_8px_24px_-18px_oklch(0.2_0.05_257/0.35)]">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6">
          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-touch" className="lg:hidden" />}
            >
              <Menu />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-4/5 overflow-y-auto sm:max-w-sm">
              <SheetHeader>
                <SheetTitle className="sr-only">Menu</SheetTitle>
                <Link href="/" aria-label="Justreference home">
                  <Logo size={28} withWordmark />
                </Link>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label="Mobile">
                {NAV_LINKS.map((link) => (
                  <SheetClose
                    key={link.href}
                    nativeButton={false}
                    render={<Link href={link.href} />}
                    className={mobileLinkClass}
                  >
                    {link.label}
                  </SheetClose>
                ))}
                <SheetClose
                  nativeButton={false}
                  render={<Link href="/referrals" />}
                  className={mobileLinkClass}
                >
                  Refer and earn
                </SheetClose>
                {MORE_LINKS.map((link) => (
                  <SheetClose
                    key={link.href}
                    nativeButton={false}
                    render={<Link href={link.href} />}
                    className={mobileLinkClass}
                  >
                    {link.label}
                  </SheetClose>
                ))}
                <SheetClose
                  nativeButton={false}
                  render={<Link href="/cart" />}
                  className={mobileLinkClass}
                >
                  {cartLabel}
                </SheetClose>
              </nav>
              <MobileCategories
                heading="Product categories"
                basePath="/products"
                categories={categories.products}
              />
              <MobileCategories
                heading="Service categories"
                basePath="/services"
                categories={categories.services}
              />
              <div className="mt-auto p-4">
                <SheetClose
                  nativeButton={false}
                  render={<Link href={accountHref} />}
                  className={buttonVariants({ size: "touch", className: "w-full" })}
                >
                  {accountLabel}
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>

          <Link href="/" className="flex shrink-0 items-center" aria-label="Justreference home">
            <span className="sm:hidden">
              <Logo size={32} />
            </span>
            <span className="hidden sm:inline-flex">
              <Logo size={36} withWordmark />
            </span>
          </Link>

          <PortalSearch
            idPrefix="header-search"
            popularCategories={popularCategories}
            className="hidden max-w-2xl flex-1 md:block"
          />

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <Button
              variant="ghost"
              size="icon-touch"
              className="relative"
              nativeButton={false}
              render={<Link href="/cart" />}
            >
              <ShoppingCart />
              <span className="sr-only">{cartLabel}</span>
              {cartCount > 0 ? (
                <Badge
                  variant="destructive"
                  className="absolute top-1 right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]"
                  aria-hidden="true"
                >
                  {cartCount > 9 ? "9+" : cartCount}
                </Badge>
              ) : null}
            </Button>
            <Button
              size="touch"
              variant={session ? "default" : "outline"}
              className="hidden sm:inline-flex"
              nativeButton={false}
              render={
                <Link href={accountHref}>
                  <UserRound />
                  {accountLabel}
                </Link>
              }
            />
          </div>
        </div>
        <div className="mx-auto w-full max-w-7xl px-4 pb-3 md:hidden">
          <PortalSearch idPrefix="header-search-mobile" popularCategories={popularCategories} />
        </div>
      </div>

      {/* Tier 2 — category band + mega-menu (desktop) */}
      <div className="from-primary text-primary-foreground hidden bg-gradient-to-r to-[oklch(0.45_0.2_22)] lg:block">
        <div className="relative mx-auto flex h-11 w-full max-w-7xl items-center gap-1 px-4">
          <div className="group">
            <button
              type="button"
              aria-haspopup="true"
              className="hover:bg-primary-foreground/10 focus-visible:bg-primary-foreground/10 flex h-11 items-center gap-2 rounded-md px-3 text-sm font-semibold outline-none"
            >
              <Menu className="size-4" />
              All categories
              <ChevronDown className="size-4" />
            </button>
            <div className="text-foreground bg-background invisible absolute top-full left-4 z-40 w-[min(56rem,calc(100vw-2rem))] translate-y-1 rounded-b-lg border opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
              <div className="grid grid-cols-2 gap-8 p-6">
                <MegaColumn
                  heading="Products"
                  basePath="/products"
                  categories={categories.products.slice(0, MENU_CATEGORY_LIMIT)}
                />
                <MegaColumn
                  heading="Services"
                  basePath="/services"
                  categories={categories.services.slice(0, MENU_CATEGORY_LIMIT)}
                />
              </div>
            </div>
          </div>

          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={bandLinkClass}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <div className="group relative">
              <button type="button" aria-haspopup="true" className={`${bandLinkClass} gap-1.5`}>
                More
                <ChevronDown className="size-4" />
              </button>
              <ul className="text-foreground bg-background invisible absolute top-full right-0 z-40 w-56 translate-y-1 rounded-b-lg border p-1.5 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
                {MORE_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:bg-muted flex h-10 items-center rounded-md px-3 text-sm"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/referrals" className={bandLinkClass}>
              Refer and earn
            </Link>
            {session ? null : (
              <Link
                href="/register"
                className="text-primary hover:bg-background/90 bg-background ml-2 flex h-8 items-center rounded-full px-4 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                Become a vendor
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function MegaColumn({
  heading,
  basePath,
  categories,
}: {
  heading: string;
  basePath: "/products" | "/services";
  categories: CategoryWithCount[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between border-b pb-2">
        <p className="text-sm font-semibold">{heading}</p>
        <Link href={basePath} className="text-primary text-xs font-medium hover:underline">
          View all
        </Link>
      </div>
      {categories.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Categories will appear as vendors list items.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`${basePath}?categoryId=${category.id}` as Route}
                className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
              >
                <span className="truncate">{category.name}</span>
                <span className="text-muted-foreground ml-2 text-xs tabular-nums">
                  {category.itemCount}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MobileCategories({
  heading,
  basePath,
  categories,
}: {
  heading: string;
  basePath: "/products" | "/services";
  categories: CategoryWithCount[];
}) {
  if (categories.length === 0) return null;
  return (
    <div className="px-4 pt-4">
      <p className="text-muted-foreground mb-1 px-2 text-xs font-semibold">{heading}</p>
      <ul>
        {categories.slice(0, MENU_CATEGORY_LIMIT).map((category) => (
          <li key={category.id}>
            <SheetClose
              nativeButton={false}
              render={<Link href={`${basePath}?categoryId=${category.id}` as Route} />}
              className="hover:bg-muted flex h-10 items-center justify-between rounded-lg px-2 text-sm"
            >
              <span className="truncate">{category.name}</span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {category.itemCount}
              </span>
            </SheetClose>
          </li>
        ))}
      </ul>
    </div>
  );
}
