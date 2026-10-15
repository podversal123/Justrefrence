"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/server/auth/session";
import { PANEL_COOKIE, canSwitchPanel, type SwitchablePanel } from "@/server/auth/panel";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Moves a member who is also an approved seller between the Member and Seller / Vendor panels.
 * Anyone else has nothing to switch to, so they are simply sent back to their dashboard.
 */
export async function switchPanelAction(formData: FormData): Promise<void> {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  if (canSwitchPanel(session)) {
    const target: SwitchablePanel = formData.get("panel") === "VENDOR" ? "VENDOR" : "CUSTOMER";
    (await cookies()).set(PANEL_COOKIE, target, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ONE_YEAR_SECONDS,
    });
  }

  redirect("/dashboard");
}
