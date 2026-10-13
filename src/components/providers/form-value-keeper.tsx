"use client";

import { useEffect } from "react";
import { consumeKeepValuesFlag } from "@/lib/use-action-state";

/**
 * Mounted once at the top of the app. When a form action has just failed, it cancels the automatic
 * form reset so the person keeps what they typed. See `src/lib/use-action-state.ts` for the why.
 */
export function FormValueKeeper() {
  useEffect(() => {
    function onReset(event: Event) {
      if (consumeKeepValuesFlag()) event.preventDefault();
    }
    // Capture phase, so it runs before anything else can act on the reset.
    document.addEventListener("reset", onReset, true);
    return () => document.removeEventListener("reset", onReset, true);
  }, []);
  return null;
}
