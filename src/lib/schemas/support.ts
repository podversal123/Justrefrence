import { z } from "zod";

/** Support tickets, internal messages, blog and feedback — shared client+server validation. */

export const TICKET_CATEGORIES = [
  "Account and login",
  "Orders and delivery",
  "Payments and invoices",
  "Wallet and payouts",
  "Referrals and commission",
  "Vendor listings",
  "Other",
] as const;

export const createTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(3, "Add a short subject.")
    .max(120, "Keep the subject under 120 characters."),
  category: z.enum(TICKET_CATEGORIES).default("Other"),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).default("NORMAL"),
  message: z.string().trim().min(10, "Describe the problem in at least 10 characters.").max(4000),
});

export const replyTicketSchema = z.object({
  ticketId: z.string().uuid(),
  body: z.string().trim().min(1, "Write a reply first.").max(4000),
});

export const updateTicketStatusSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(["IN_PROGRESS", "RESOLVED", "CLOSED"]),
});

export const sendMessageSchema = z.object({
  /** Empty/absent = "to the Justreference team" (members). Staff must pick a recipient. */
  toUserId: z.string().uuid().optional(),
  subject: z.string().trim().min(2, "Add a subject.").max(140),
  body: z.string().trim().min(1, "Write a message first.").max(4000),
});

/** Browsers submit textarea newlines as CRLF; store plain LF so paragraph logic is simple everywhere. */
const normalizeNewlines = (value: string) => value.replace(/\r\n?/g, "\n");

export const blogPostSchema = z.object({
  title: z.string().trim().min(3, "Add a title.").max(160),
  excerpt: z.string().trim().max(300).optional(),
  body: z
    .string()
    .transform(normalizeNewlines)
    .pipe(z.string().trim().min(20, "Write at least a couple of sentences.").max(40000)),
});

export const feedbackSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  message: z.string().trim().min(10, "Tell us a little more (10 characters or more).").max(3000),
});

export const memberModerationSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(["BLOCK", "UNBLOCK"]),
  reason: z.string().trim().min(3, "Give a short reason.").max(300),
});
