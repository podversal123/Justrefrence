import { z } from "zod";

export const kycDocumentTypeSchema = z.enum(["PAN_CARD", "GST_CERTIFICATE"]);

export const reviewKycSchema = z
  .object({
    documentId: z.string().uuid(),
    decision: z.enum(["VERIFY", "REJECT"]),
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((d) => d.decision !== "REJECT" || !!d.reason, {
    message: "Tell the person what to fix, so they can upload it again.",
    path: ["reason"],
  });
export type ReviewKycInput = z.infer<typeof reviewKycSchema>;
