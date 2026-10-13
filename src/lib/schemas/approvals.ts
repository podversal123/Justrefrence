import { z } from "zod";

const optionalNote = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined));

/** Why an Admin is asking for a change; shown to the Super Admin next to the before/after. */
export const requestNoteSchema = optionalNote;

export const reviewChangeSchema = z
  .object({
    requestId: z.string().uuid(),
    decision: z.enum(["APPROVE", "REJECT"]),
    note: optionalNote,
  })
  .refine((d) => d.decision !== "REJECT" || !!d.note, {
    message: "Tell the admin why, so they know what to change.",
    path: ["note"],
  });
export type ReviewChangeInput = z.infer<typeof reviewChangeSchema>;
