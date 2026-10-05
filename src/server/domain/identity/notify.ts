// No "server-only" import — orchestration over notification-repository.ts
// and notification-providers.ts, which each carry their own guard. See
// docs/notifications.md §2: this is the single choke point that decides
// in-app + email/SMS/WhatsApp delivery for an event, so channel rules live
// in one place rather than scattered across call sites.
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { sendEmail } from "@/server/lib/notification-providers";
import { logger } from "@/server/lib/logger";

export interface WelcomeNotificationInput {
  userId: string;
  email: string;
  fullName: string;
  memberId: string;
  referralCode: string;
}

/** Welcome letter — docs/notifications.md §5: email (primary) + in-app copy. */
export async function sendWelcomeNotification(input: WelcomeNotificationInput): Promise<void> {
  const payload = {
    fullName: input.fullName,
    email: input.email,
    memberId: input.memberId,
    referralCode: input.referralCode,
    sentAt: new Date().toISOString(),
  };

  // In-app + outbound email are independent best-effort sends: a delivery
  // failure on either must never fail the registration transaction that
  // already committed (the account exists regardless of whether the welcome
  // message went out) — this is the one sanctioned "log and continue"
  // boundary for notifications, mirroring recordAudit()'s own failure mode.
  try {
    await createNotification({ userId: input.userId, type: "WELCOME", payload });
  } catch (error) {
    logger.error("welcome_notification_in_app_failed", {
      userId: input.userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await sendEmail({
      to: input.email,
      template: "welcome_letter",
      vars: {
        fullName: input.fullName,
        email: input.email,
        memberId: input.memberId,
        referralCode: input.referralCode,
      },
    });
  } catch (error) {
    logger.error("welcome_notification_email_failed", {
      userId: input.userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export interface BirthdayNotificationInput {
  userId: string;
  email: string;
  fullName: string;
}

/** Birthday greeting — docs/notifications.md §5: email, daily cron scan of dob. */
export async function sendBirthdayNotification(input: BirthdayNotificationInput): Promise<void> {
  try {
    await createNotification({
      userId: input.userId,
      type: "BIRTHDAY_GREETING",
      payload: { fullName: input.fullName, sentAt: new Date().toISOString() },
    });
  } catch (error) {
    logger.error("birthday_notification_in_app_failed", {
      userId: input.userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    await sendEmail({
      to: input.email,
      template: "birthday_greeting",
      vars: { fullName: input.fullName },
    });
  } catch (error) {
    logger.error("birthday_notification_email_failed", {
      userId: input.userId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
