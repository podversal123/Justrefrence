const TIME_ZONE = "Asia/Kolkata";

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TIME_ZONE,
});

/** "5 Oct 2026" — fixed to IST so server and client render identically (no hydration drift). */
export function formatDate(value: Date | string): string {
  return dateFormat.format(new Date(value));
}

/** "5 Oct 2026, 3:20 pm" in IST. */
export function formatDateTime(value: Date | string): string {
  return dateTimeFormat.format(new Date(value));
}
