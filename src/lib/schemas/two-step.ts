import { z } from "zod";

/** A Super Admin clearing another account's two-step login: always with a recorded reason. */
export const resetTwoStepSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(3, "Give a short reason.").max(300),
});
