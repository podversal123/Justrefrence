import { z } from "zod";
import { checkSmsBody } from "@/server/domain/sms/rules";

/** Writing an SMS — shared client+server validation. */

export const SMS_AUDIENCES = ["SINGLE", "ALL_MEMBERS", "VENDORS"] as const;

export const composeSmsSchema = z
  .object({
    intent: z.enum(["send", "draft"]).default("send"),
    audience: z.enum(SMS_AUDIENCES),
    recipientEmail: z.string().trim().max(200).optional(),
    body: z.string().max(2000),
    draftId: z.string().uuid().optional(),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    if (data.audience === "SINGLE") {
      const email = data.recipientEmail ?? "";
      if (!z.string().email().safeParse(email).success) {
        ctx.addIssue({
          code: "custom",
          path: ["recipientEmail"],
          message: "Enter the member's email address.",
        });
      }
    }
    const check = checkSmsBody(data.body);
    if (!check.ok) {
      ctx.addIssue({
        code: "custom",
        path: ["body"],
        message: check.message ?? "Check the message.",
      });
    }
  })
  .transform((data) => ({
    ...data,
    body: data.body.trim(),
    recipientEmail: data.audience === "SINGLE" ? (data.recipientEmail ?? "").trim() : undefined,
  }));

export type ComposeSmsInput = z.infer<typeof composeSmsSchema>;

export const smsIdSchema = z.object({ smsId: z.string().uuid() });
export const draftIdSchema = z.object({ draftId: z.string().uuid() });
