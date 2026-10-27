import { msg } from "@/i18n/locales";
import Link from "next/link";
import type { Route } from "next";
import { ChevronDown, House, Menu, ShoppingCart, UserRound } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { OUR_SERVICES } from "@/components/portal/our-services";
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
import { LanguageSwitch } from "@/components/layout/language-switch";
import { FontSizeControl } from "@/components/layout/font-size-control";
import { getT, type TFunction } from "@/i18n/server";
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
 *      "More" menu for the secondary pages (What we do, News, Feedback)
 * Session, cart count and categories are all server-fetched; the category
 * query is cached (marketplace-stats.ts) and failure-tolerant so a
 * database hiccup degrades the menu, never the page.
 */

const NAV_LINKS: { href: Route; label: string }[] = [
  { href: "/products", label: msg("Products") },
  { href: "/services", label: msg("Services") },
  { href: "/projects", label: msg("Projects") },
  // New routes aren't in the generated typed-route table until the next typegen, hence the cast.
  { href: "/bids" as Route, label: "Bids and tenders" },
  { href: "/auctions" as Route, label: "Auctions" },
];

/** Secondary pages: one dropdown on desktop, plain links in the mobile sheet. */
const MORE_LINKS: { href: Route; label: string }[] = [
  { href: "/what-we-do" as Route, label: msg("What we do") },
  { href: "/blog", label: "News and updates" },
  { href: "/feedback", label: msg("Feedback") },
];

const SERVICE_LINKS: { href: Route; label: string }[] = OUR_SERVICES.map((service) => ({
  href: `/our-services/${service.slug}` as Route,
  label: service.label,
}));

/** Company bar under the category band: plain links; Our Services and Career are dropdowns. */
const COMPANY_LINKS = {
  home: { href: "/" as Route, label: msg("Home") },
  aboutUs: { href: "/about" as Route, label: msg("About Us") },
  whatYouDo: { href: "/what-you-do" as Route, label: msg("What You Do") },
  mediaRelation: { href: "/media-relation" as Route, label: msg("Media Relation") },
  wayToWork: { href: "/way-to-work" as Route, label: msg("Way to Work") },
  contact: { href: "/contact" as Route, label: msg("Contact Us") },
  support: { href: "/support" as Route, label: msg("Supports") },
} as const;

/** Career dropdown: why join, the open roles, and how to apply. */
const CAREER_LINKS: { href: Route; label: string }[] = [
  { href: "/careers/why-justreference" as Route, label: msg("Why Justreference?") },
  { href: "/careers" as Route, label: msg("Current Openings") },
  { href: "/careers/applying" as Route, label: msg("Applying with Justreference") },
];

const MENU_CATEGORY_LIMIT = 10;

const mobileLinkClass = "hover:bg-muted flex h-11 items-center rounded-lg px-2 text-sm font-medium";
const bandLinkClass =
  "flex h-11 items-center px-3 text-sm font-medium outline-none hover:bg-white/10 focus-visible:bg-white/10";

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
  const t = await getT();
  const session = await getAuthSession();
  const [cartCount, categories] = await Promise.all([
    session ? countOpenCartItems(session.userId) : Promise.resolve(0),
    loadCategories(),
  ]);
  const cartLabel = cartCount > 0 ? t("Cart, {count} items", { count: cartCount }) : t("Cart");
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
  const accountLabel = session ? t("Dashboard") : t("Sign in");

  return (
    <header className="sticky top-0 z-30">
      {/* Tier 0 — language, text size and help, the way government portals open */}
      <div className="bg-ink text-ink-foreground hidden border-b border-white/15 text-xs lg:block">
        <div className="mx-auto flex h-8 w-full max-w-7xl items-center gap-4 px-4">
          <LanguageSwitch onDark className="border-0 p-0" />
          <span className="h-4 w-px bg-white/25" aria-hidden="true" />
          <FontSizeControl />
          <span className="h-4 w-px bg-white/25" aria-hidden="true" />
          <a href="#main" className="hover:underline focus-visible:underline">
            {t("Skip to content")}
          </a>
          <nav aria-label={t("Help")} className="ml-auto flex items-center gap-4">
            <Link href="/feedback" className="hover:underline focus-visible:underline">
              {t("Feedback")}
            </Link>
          </nav>
        </div>
      </div>
      {/* Tier 1 — brand, search, account */}
      <div className="bg-ink text-ink-foreground">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-touch"
                  className="hover:bg-white/10 hover:text-white lg:hidden"
                />
              }
            >
              <Menu />
              <span className="sr-only">{t("Open menu")}</span>
            </SheetTrigger>
            <SheetContent side="left" className="w-4/5 overflow-y-auto sm:max-w-sm">
              <SheetHeader>
                <SheetTitle className="sr-only">{t("Menu")}</SheetTitle>
                <Link href="/" aria-label={t("Justreference home")}>
                  <Logo size={28} withWordmark />
                </Link>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-4" aria-label={t("Mobile")}>
                {NAV_LINKS.map((link) => (
                  <SheetClose
                    key={link.href}
                    nativeButton={false}
                    render={<Link href={link.href} />}
                    className={mobileLinkClass}
                  >
                    {t(link.label)}
                  </SheetClose>
                ))}
                <SheetClose
                  nativeButton={false}
                  render={<Link href="/referrals" />}
                  className={mobileLinkClass}
                >
                  {t("Refer and earn")}
                </SheetClose>
                {[
                  COMPANY_LINKS.home,
                  COMPANY_LINKS.aboutUs,
                  COMPANY_LINKS.whatYouDo,
                  ...SERVICE_LINKS,
                  COMPANY_LINKS.mediaRelation,
                  ...CAREER_LINKS,
                  COMPANY_LINKS.wayToWork,
                  COMPANY_LINKS.contact,
                  COMPANY_LINKS.support,
                  ...MORE_LINKS,
                ].map((link) => (
                  <SheetClose
                    key={link.href}
                    nativeButton={false}
                    render={<Link href={link.href} />}
                    className={mobileLinkClass}
                  >
                    {t(link.label)}
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
                heading={t("Product categories")}
                basePath="/products"
                categories={categories.products}
              />
              <MobileCategories
                heading={t("Service categories")}
                basePath="/services"
                categories={categories.services}
              />
              <div className="mt-auto space-y-3 p-4">
                <LanguageSwitch />
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

          <Link
            href="/"
            className="flex shrink-0 items-center"
            aria-label={t("Justreference home")}
          >
            <span className="sm:hidden">
              <Logo size={32} />
            </span>
            <span className="hidden sm:inline-flex">
              <Logo size={36} withWordmark onDark />
            </span>
          </Link>

          <PortalSearch
            idPrefix="header-search"
            popularCategories={popularCategories}
            className="hidden max-w-2xl flex-1 md:block"
          />

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <LanguageSwitch onDark className="hidden sm:inline-flex lg:hidden" />
            <Button
              variant="ghost"
              size="icon-touch"
              className="relative hover:bg-white/10 hover:text-white"
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
              className={
                session
                  ? "hidden sm:inline-flex"
                  : "hidden border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white sm:inline-flex"
              }
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
      <div className="bg-ink text-ink-foreground hidden border-t border-white/15 lg:block">
        <div className="relative mx-auto flex h-11 w-full max-w-7xl items-center gap-1 px-4">
          <div className="group">
            <button
              type="button"
              aria-haspopup="true"
              className="flex h-11 items-center gap-2 px-3 text-sm font-medium outline-none hover:bg-white/10 focus-visible:bg-white/10"
            >
              <Menu className="size-4" />
              {t("All categories")}
              <ChevronDown className="size-4" />
            </button>
            <div className="text-foreground bg-background invisible absolute top-full left-4 z-40 w-[min(56rem,calc(100vw-2rem))] translate-y-1 border opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
              <div className="grid grid-cols-2 gap-8 p-6">
                <MegaColumn
                  heading={t("Products")}
                  t={t}
                  basePath="/products"
                  categories={categories.products.slice(0, MENU_CATEGORY_LIMIT)}
                />
                <MegaColumn
                  heading={t("Services")}
                  t={t}
                  basePath="/services"
                  categories={categories.services.slice(0, MENU_CATEGORY_LIMIT)}
                />
              </div>
            </div>
          </div>

          <nav aria-label={t("Main")} className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={bandLinkClass}>
                {t(link.label)}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <div className="group relative">
              <button type="button" aria-haspopup="true" className={`${bandLinkClass} gap-1.5`}>
                {t("More")}
                <ChevronDown className="size-4" />
              </button>
              <ul className="text-foreground bg-background invisible absolute top-full right-0 z-40 w-56 translate-y-1 rounded-b-lg border p-1.5 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
                {MORE_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="hover:bg-muted flex h-10 items-center rounded-md px-3 text-sm"
                    >
                      {t(link.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <Link href="/referrals" className={bandLinkClass}>
              {t("Refer and earn")}
            </Link>
            {session ? null : (
              <Link
                href={"/become-seller" as Route}
                className="bg-primary text-primary-foreground hover:bg-primary/90 ml-2 flex h-8 items-center px-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                {t("Become a vendor")}
              </Link>
            )}
          </div>
        </div>
      </div>
      {/* Tier 3 — company pages (desktop) */}
      <div className="bg-primary text-primary-foreground hidden border-t border-white/15 lg:block">
        <nav
          aria-label={t("Company")}
          className="mx-auto flex h-11 w-full max-w-7xl items-center gap-1 px-4"
        >
          <Link
            href={COMPANY_LINKS.home.href}
            aria-label={t(COMPANY_LINKS.home.label)}
            className={bandLinkClass}
          >
            <House className="size-4" aria-hidden="true" />
          </Link>
          <Link href={COMPANY_LINKS.aboutUs.href} className={bandLinkClass}>
            {t(COMPANY_LINKS.aboutUs.label)}
          </Link>
          <Link href={COMPANY_LINKS.whatYouDo.href} className={bandLinkClass}>
            {t(COMPANY_LINKS.whatYouDo.label)}
          </Link>
          <div className="group relative">
            <button type="button" aria-haspopup="true" className={`${bandLinkClass} gap-1.5`}>
              {t("Our Services")}
              <ChevronDown className="size-4" />
            </button>
            <ul className="text-foreground bg-background invisible absolute top-full left-0 z-40 w-64 translate-y-1 rounded-b-lg border p-1.5 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
              {SERVICE_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:bg-muted flex h-10 items-center rounded-md px-3 text-sm"
                  >
                    {t(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <Link href={COMPANY_LINKS.mediaRelation.href} className={bandLinkClass}>
            {t(COMPANY_LINKS.mediaRelation.label)}
          </Link>
          <div className="group relative">
            <button type="button" aria-haspopup="true" className={`${bandLinkClass} gap-1.5`}>
              {t("Career")}
              <ChevronDown className="size-4" />
            </button>
            <ul className="text-foreground bg-background invisible absolute top-full left-0 z-40 w-64 translate-y-1 rounded-b-lg border p-1.5 opacity-0 shadow-lg transition group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:transition-none">
              {CAREER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="hover:bg-muted flex h-10 items-center rounded-md px-3 text-sm"
                  >
                    {t(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <Link href={COMPANY_LINKS.wayToWork.href} className={bandLinkClass}>
            {t(COMPANY_LINKS.wayToWork.label)}
          </Link>
          <Link href={COMPANY_LINKS.contact.href} className={bandLinkClass}>
            {t(COMPANY_LINKS.contact.label)}
          </Link>
          <Link href={COMPANY_LINKS.support.href} className={bandLinkClass}>
            {t(COMPANY_LINKS.support.label)}
          </Link>
        </nav>
      </div>
    </header>
  );
}

function MegaColumn({
  heading,
  basePath,
  categories,
  t,
}: {
  heading: string;
  t: TFunction;
  basePath: "/products" | "/services";
  categories: CategoryWithCount[];
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between border-b pb-2">
        <p className="text-sm font-semibold">{heading}</p>
        <Link href={basePath} className="text-primary text-xs font-medium hover:underline">
          {t("View all")}
        </Link>
      </div>
      {categories.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("Categories will appear as vendors list items.")}
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
