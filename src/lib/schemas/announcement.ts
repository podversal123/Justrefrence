import { z } from "zod";

export const ANNOUNCEMENT_AUDIENCES = ["ALL", "CUSTOMERS", "VENDORS"] as const;
export type AnnouncementAudienceValue = (typeof ANNOUNCEMENT_AUDIENCES)[number];

export const AUDIENCE_LABELS: Record<AnnouncementAudienceValue, string> = {
  ALL: "Everyone",
  CUSTOMERS: "Customers only",
  VENDORS: "Vendors only",
};

export const announcementFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Write a short title.")
    .max(100, "Keep the title under 100 characters."),
  body: z
    .string()
    .trim()
    .min(5, "Write the message.")
    .max(1000, "Keep the message under 1000 characters."),
  audience: z.enum(ANNOUNCEMENT_AUDIENCES, { message: "Choose who should see this." }),
});
export type AnnouncementFields = z.infer<typeof announcementFieldsSchema>;

export const announcementIdSchema = z.string().uuid();
