"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Per-browser dashboard widget configurability (Phase 9 brief: "configurable
 * widgets"). This is a per-viewer display preference, not shared business
 * data, so it's intentionally localStorage-only — never synced to the
 * server or other devices. Falls back to "show everything" if storage is
 * unavailable (private browsing, etc.) rather than erroring.
 */

const STORAGE_KEY = "jr.dashboard.widgetVisibility.v1";

interface WidgetVisibilityValue {
  isVisible: (id: string) => boolean;
  toggle: (id: string) => void;
}

const WidgetVisibilityContext = createContext<WidgetVisibilityValue | null>(null);

function readStoredHidden(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function WidgetVisibilityProvider({ children }: { children: ReactNode }) {
  // Starts as an empty hidden-set (everything visible) on both server and
  // client, matching first-paint markup exactly — then this effect applies
  // whatever the viewer previously hid, a normal post-hydration state
  // update, not a mismatch.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    // Reading localStorage during the lazy useState initializer would run
    // on the server too (where `window` doesn't exist) and could also
    // return a DIFFERENT value than the server-rendered markup, causing a
    // real hydration mismatch — doing it here, once, post-mount, is the
    // correct way to sync from a browser-only external source. Not the
    // "redundant derived state" anti-pattern the lint rule otherwise guards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(readStoredHidden());
  }, []);

  const value = useMemo<WidgetVisibilityValue>(
    () => ({
      isVisible: (id: string) => !hidden.has(id),
      toggle: (id: string) => {
        setHidden((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
          } catch {
            // Storage unavailable — the toggle still works for this render, just won't persist.
          }
          return next;
        });
      },
    }),
    [hidden],
  );

  return <WidgetVisibilityContext.Provider value={value}>{children}</WidgetVisibilityContext.Provider>;
}

function useWidgetVisibility(): WidgetVisibilityValue {
  const ctx = useContext(WidgetVisibilityContext);
  if (!ctx) throw new Error("useWidgetVisibility must be used within a WidgetVisibilityProvider.");
  return ctx;
}

export function Widget({ id, children }: { id: string; children: ReactNode }) {
  const { isVisible } = useWidgetVisibility();
  if (!isVisible(id)) return null;
  return <>{children}</>;
}

export function WidgetToggleMenu({ widgets }: { widgets: { id: string; label: string }[] }) {
  const { isVisible, toggle } = useWidgetVisibility();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm">
            <Settings2 />
            Widgets
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal">Show on dashboard</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {widgets.map((w) => (
          <DropdownMenuCheckboxItem
            key={w.id}
            checked={isVisible(w.id)}
            onCheckedChange={() => toggle(w.id)}
            closeOnClick={false}
          >
            {w.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
