"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, Clock, Loader2, Search, Tag, X } from "lucide-react";
import { HitThumb } from "@/components/search/hit-thumb";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { MarketplaceSearchResult, SearchHit } from "@/server/domain/search/marketplace-search";

/**
 * Header search with live suggestions (ARIA combobox pattern):
 *  - typing 2+ characters shows matching categories, products, services and
 *    projects (debounced, cancelled when superseded, cached per query);
 *  - empty box shows recent searches and popular categories;
 *  - ArrowUp/ArrowDown move through options, Enter opens the highlighted one
 *    (or runs the full search), Esc closes, `/` focuses the box from anywhere;
 *  - the scope selector narrows suggestions and decides where Enter goes.
 * Everything still works without the dropdown: submitting always navigates to
 * a plain GET URL (/search?q=… or the listing page's ?search=…).
 */

const SCOPES = [
  { value: "all", label: "All" },
  { value: "products", label: "Products" },
  { value: "services", label: "Services" },
  { value: "projects", label: "Projects" },
] as const;
type Scope = (typeof SCOPES)[number]["value"];

export interface PopularCategory {
  id: string;
  name: string;
  href: string;
}

interface Option {
  id: string;
  href: string;
  /** Text to remember as a "recent search" when this option is chosen. */
  remember?: string;
  render: React.ReactNode;
}
interface OptionGroup {
  key: string;
  heading: string;
  options: Option[];
}

const RECENT_KEY = "jr:recent-searches";
const MAX_RECENT = 5;
const DEBOUNCE_MS = 220;
const MIN_LENGTH = 2;

function readRecent(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}
function writeRecent(values: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(values.slice(0, MAX_RECENT)));
  } catch {
    /* private mode / blocked storage: recent searches are a convenience only */
  }
}

/** Bold the part of `text` that matches `query` (case-insensitive, first match). */
function Highlight({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <strong className="font-semibold">{text.slice(index, index + query.length)}</strong>
      {text.slice(index + query.length)}
    </>
  );
}

function searchUrl(scope: Scope, query: string): string {
  const q = encodeURIComponent(query);
  return scope === "all" ? `/search?q=${q}` : `/${scope}?search=${q}`;
}

function hitOption(hit: SearchHit, query: string): Option {
  return {
    id: `${hit.kind}-${hit.id}`,
    href: hit.href,
    remember: query,
    render: (
      <>
        <HitThumb kind={hit.kind} imagePath={hit.imagePath} alt="" size={40} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">
            <Highlight text={hit.title} query={query} />
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {hit.categoryName} · {hit.vendorBusinessName}
          </span>
        </span>
        <span className="shrink-0 text-xs font-medium tabular-nums">
          {hit.price === null ? "Quote" : formatPaise(hit.price, hit.currency)}
        </span>
      </>
    ),
  };
}

export function PortalSearch({
  className,
  idPrefix,
  popularCategories = [],
  variant = "header",
}: {
  className?: string;
  idPrefix: string;
  popularCategories?: PopularCategory[];
  /** `hero` is the larger, elevated bar used on the homepage hero. */
  variant?: "header" | "hero";
}) {
  const router = useRouter();
  const reactId = useId();
  const listId = `${idPrefix}-${reactId}-list`;
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [recent, setRecent] = useState<string[]>([]);
  // Suggestions cached per normalised query; `errorKey` marks the query whose fetch failed.
  const [results, setResults] = useState<Record<string, MarketplaceSearchResult>>({});
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const trimmed = query.replace(/\s+/g, " ").trim();
  const searching = trimmed.length >= MIN_LENGTH;
  const key = trimmed.toLowerCase();
  const result = searching ? (results[key] ?? null) : null;
  const status: "idle" | "loading" | "error" =
    !searching || result ? "idle" : errorKey === key ? "error" : "loading";
  const needsFetch = searching && !result;

  // Debounced, cancellable fetch. State is only set from the async callback.
  useEffect(() => {
    if (!needsFetch) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const body = (await response.json()) as {
          success: boolean;
          data?: MarketplaceSearchResult;
        };
        if (!response.ok || !body.success || !body.data) throw new Error("search failed");
        const data = body.data;
        setResults((previous) => ({ ...previous, [key]: data }));
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") setErrorKey(key);
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [needsFetch, trimmed, key]);

  // Close when clicking elsewhere.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  // "/" focuses the search box (unless the user is already typing somewhere).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      const input = inputRef.current;
      if (!input || input.offsetParent === null) return; // the other (hidden) instance
      event.preventDefault();
      input.focus();
      setOpen(true);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const remember = useCallback((term: string) => {
    const clean = term.replace(/\s+/g, " ").trim();
    if (clean.length < MIN_LENGTH) return;
    const next = [
      clean,
      ...readRecent().filter((v) => v.toLowerCase() !== clean.toLowerCase()),
    ].slice(0, MAX_RECENT);
    writeRecent(next);
    setRecent(next);
  }, []);

  const go = useCallback(
    (href: string, rememberTerm?: string) => {
      if (rememberTerm) remember(rememberTerm);
      setOpen(false);
      setActive(-1);
      inputRef.current?.blur();
      router.push(href as Route);
    },
    [router, remember],
  );

  const groups: OptionGroup[] = useMemo(() => {
    const out: OptionGroup[] = [];
    if (!searching) {
      if (recent.length > 0) {
        out.push({
          key: "recent",
          heading: "Recent searches",
          options: recent.map((term) => ({
            id: `recent-${term}`,
            href: searchUrl(scope, term),
            remember: term,
            render: (
              <>
                <Clock className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="truncate text-sm">{term}</span>
              </>
            ),
          })),
        });
      }
      if (popularCategories.length > 0) {
        out.push({
          key: "popular",
          heading: "Popular categories",
          options: popularCategories.map((c) => ({
            id: `pop-${c.id}`,
            href: c.href,
            render: (
              <>
                <Tag className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="truncate text-sm">{c.name}</span>
              </>
            ),
          })),
        });
      }
      return out;
    }
    if (!result) return out;

    const show = (kind: "products" | "services" | "projects") => scope === "all" || scope === kind;
    if (scope === "all" || scope !== "projects") {
      const cats = result.categories.filter(
        (c) =>
          scope === "all" || (scope === "products" ? c.kind === "PRODUCT" : c.kind === "SERVICE"),
      );
      if (cats.length > 0) {
        out.push({
          key: "cats",
          heading: "Categories",
          options: cats.map((c) => ({
            id: `cat-${c.kind}-${c.id}`,
            href: c.href,
            remember: trimmed,
            render: (
              <>
                <Tag className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
                <span className="truncate text-sm">
                  <Highlight text={c.name} query={trimmed} />
                </span>
                <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                  {c.kind === "PRODUCT" ? "Products" : "Services"}
                </span>
              </>
            ),
          })),
        });
      }
    }
    if (show("products") && result.products.length > 0)
      out.push({
        key: "products",
        heading: "Products",
        options: result.products.map((h) => hitOption(h, trimmed)),
      });
    if (show("services") && result.services.length > 0)
      out.push({
        key: "services",
        heading: "Services",
        options: result.services.map((h) => hitOption(h, trimmed)),
      });
    if (show("projects") && result.projects.length > 0)
      out.push({
        key: "projects",
        heading: "Projects",
        options: result.projects.map((h) => hitOption(h, trimmed)),
      });
    return out;
  }, [searching, recent, popularCategories, result, scope, trimmed]);

  // The final "see all results" option is always available when searching.
  const seeAll: Option | null = useMemo(
    () =>
      searching
        ? {
            id: "see-all",
            href: searchUrl(scope, trimmed),
            remember: trimmed,
            render: (
              <>
                <Search className="text-primary size-4 shrink-0" aria-hidden="true" />
                <span className="text-primary truncate text-sm font-medium">
                  See all results for &ldquo;{trimmed}&rdquo;
                </span>
                <ArrowRight className="text-primary ml-auto size-4 shrink-0" aria-hidden="true" />
              </>
            ),
          }
        : null,
    [searching, scope, trimmed],
  );

  const flat: Option[] = useMemo(
    () => [...groups.flatMap((g) => g.options), ...(seeAll ? [seeAll] : [])],
    [groups, seeAll],
  );
  // The highlight can never point past the end of a list that just got shorter.
  const activeIndex = active < flat.length ? active : -1;
  const optionId = (index: number) => `${idPrefix}-${reactId}-opt-${index}`;

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const chosen = activeIndex >= 0 ? flat[activeIndex] : undefined;
    if (chosen) return go(chosen.href, chosen.remember);
    if (searching) return go(searchUrl(scope, trimmed), trimmed);
    // Empty box: just open the section the scope points at.
    go(scope === "all" ? "/products" : `/${scope}`);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (flat.length === 0) return;
      event.preventDefault();
      setOpen(true);
      const last = flat.length - 1;
      // Positions run -1 (back in the text box) .. last, wrapping at both ends.
      setActive((current) => {
        if (event.key === "ArrowDown") return current + 1 > last ? -1 : current + 1;
        return current - 1 < -1 ? last : current - 1;
      });
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    }
  }

  let runningIndex = -1;
  const showPanel = open && (flat.length > 0 || searching);
  const announcement = !open
    ? ""
    : status === "loading"
      ? "Searching"
      : searching
        ? `${flat.length - 1} suggestion${flat.length - 1 === 1 ? "" : "s"} available`
        : "";

  return (
    <form
      ref={containerRef}
      onSubmit={onSubmit}
      role="search"
      className={cn("relative", className)}
    >
      <div
        className={cn(
          "focus-within:border-ring focus-within:ring-ring/40 bg-background text-foreground flex w-full overflow-hidden border focus-within:ring-3",
          variant === "hero"
            ? "h-14 rounded-xl border-transparent text-base shadow-2xl shadow-black/30"
            : "h-11 rounded-lg",
        )}
      >
        <label htmlFor={`${idPrefix}-scope`} className="sr-only">
          Search in
        </label>
        <select
          id={`${idPrefix}-scope`}
          value={scope}
          onChange={(event) => {
            setScope(event.target.value as Scope);
            setActive(-1);
          }}
          className="bg-muted text-foreground border-r px-3 text-sm outline-none"
        >
          {SCOPES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${idPrefix}-input`} className="sr-only">
          Search the marketplace
        </label>
        <input
          ref={inputRef}
          id={`${idPrefix}-input`}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showPanel && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          autoComplete="off"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => {
            setRecent(readRecent());
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search products, services, projects"
          maxLength={80}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActive(-1);
              inputRef.current?.focus();
            }}
            className="text-muted-foreground hover:text-foreground px-2"
          >
            <X className="size-4" />
            <span className="sr-only">Clear search</span>
          </button>
        ) : (
          <kbd
            aria-hidden="true"
            className="text-muted-foreground bg-muted my-auto mr-2 hidden rounded border px-1.5 py-0.5 text-[10px] lg:inline-block"
          >
            /
          </kbd>
        )}
        <Button type="submit" className="h-full rounded-none px-4">
          <Search />
          <span className="sr-only sm:not-sr-only">Search</span>
        </Button>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {showPanel ? (
        <div className="bg-popover text-popover-foreground absolute top-full right-0 left-0 z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border shadow-lg">
          <ul id={listId} role="listbox" aria-label="Search suggestions" className="py-1">
            {searching && status === "loading" && !result ? (
              <li
                role="presentation"
                className="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm"
              >
                <Loader2
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
                Searching…
              </li>
            ) : null}
            {searching && status === "error" ? (
              <li role="presentation" className="text-muted-foreground px-3 py-3 text-sm">
                Couldn&apos;t load suggestions. Press Enter to search anyway.
              </li>
            ) : null}
            {searching && status === "idle" && result && groups.length === 0 ? (
              <li role="presentation" className="text-muted-foreground px-3 py-3 text-sm">
                No quick matches for &ldquo;{trimmed}&rdquo;. Press Enter to search everything.
              </li>
            ) : null}

            {groups.map((group) => (
              <Fragment key={group.key}>
                <li
                  role="presentation"
                  className="text-muted-foreground flex items-center justify-between px-3 pt-2 pb-1 text-xs font-semibold"
                >
                  {group.heading}
                  {group.key === "recent" ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        writeRecent([]);
                        setRecent([]);
                      }}
                      className="hover:text-foreground font-normal underline"
                    >
                      Clear
                    </button>
                  ) : null}
                </li>
                {group.options.map((option) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  return (
                    <li
                      key={option.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(option.href, option.remember)}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 px-3 py-2",
                        index === activeIndex && "bg-accent",
                      )}
                    >
                      {option.render}
                    </li>
                  );
                })}
              </Fragment>
            ))}

            {seeAll ? (
              <li
                id={optionId(flat.length - 1)}
                role="option"
                aria-selected={activeIndex === flat.length - 1}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(flat.length - 1)}
                onClick={() => go(seeAll.href, seeAll.remember)}
                className={cn(
                  "mt-1 flex cursor-pointer items-center gap-3 border-t px-3 py-2.5",
                  activeIndex === flat.length - 1 && "bg-accent",
                )}
              >
                {seeAll.render}
              </li>
            ) : null}
          </ul>
          {!searching ? (
            <p className="text-muted-foreground border-t px-3 py-2 text-xs">{BRAND.tagline}</p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
