"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/server/services/auth-actions";

const WARNING_SECONDS = 60;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll", "pointermove"] as const;
/** Shared between tabs, so activity in one tab keeps the others signed in too. */
const STORAGE_KEY = "jr:last-activity";

function readLastActivity(): number | null {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeLastActivity(time: number) {
  try {
    localStorage.setItem(STORAGE_KEY, String(time));
  } catch {
    // Storage can be blocked; this tab still tracks its own activity.
  }
}

/**
 * Logs the user out after `minutes` without any activity, with a one-minute warning first.
 * Renders nothing until the warning shows. `minutes` of 0 turns it off (the caller skips mounting it).
 */
export function IdleLogout({ minutes }: { minutes: number }) {
  const t = useT();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const formRef = useRef<HTMLFormElement>(null);
  const loggingOut = useRef(false);

  const markActive = useCallback(() => {
    const now = Date.now();
    lastActivity.current = now;
    writeLastActivity(now);
    setSecondsLeft(null);
  }, []);

  useEffect(() => {
    const limitMs = minutes * 60_000;
    lastActivity.current = Date.now();
    writeLastActivity(lastActivity.current);

    let lastWrite = 0;
    function onActivity() {
      const now = Date.now();
      // A warning in view needs a deliberate click on "Stay signed in", so stray movement doesn't dismiss it.
      if (now - lastActivity.current > limitMs - WARNING_SECONDS * 1000) return;
      lastActivity.current = now;
      // Writing storage on every mouse move is wasteful; once every 5 seconds is plenty.
      if (now - lastWrite > 5000) {
        lastWrite = now;
        writeLastActivity(now);
      }
    }
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });

    const tick = window.setInterval(() => {
      const shared = readLastActivity();
      if (shared && shared > lastActivity.current) lastActivity.current = shared;
      const idleMs = Date.now() - lastActivity.current;
      if (idleMs >= limitMs) {
        if (!loggingOut.current) {
          loggingOut.current = true;
          formRef.current?.requestSubmit();
        }
        return;
      }
      const remaining = Math.ceil((limitMs - idleMs) / 1000);
      setSecondsLeft(remaining <= WARNING_SECONDS ? remaining : null);
    }, 1000);

    return () => {
      window.clearInterval(tick);
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
    };
  }, [minutes]);

  return (
    <>
      <form ref={formRef} action={logoutAction} className="hidden" />
      {secondsLeft !== null ? (
        <div
          role="alertdialog"
          aria-live="assertive"
          aria-label={t("You will be logged out soon")}
          className="bg-background fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-3 rounded-xl border p-4 shadow-lg"
        >
          <div>
            <p className="font-semibold">{t("Are you still there?")}</p>
            <p className="text-muted-foreground text-sm">
              {t("You will be logged out in {seconds} seconds because you have been inactive.", {
                seconds: String(secondsLeft),
              })}
            </p>
          </div>
          <Button onClick={markActive}>{t("Stay signed in")}</Button>
        </div>
      ) : null}
    </>
  );
}
