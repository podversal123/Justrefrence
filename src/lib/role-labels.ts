import { msg } from "@/i18n/locales";

/**
 * The names of the built-in roles as they are stored. They are written here so each one can be
 * translated; a role an admin creates keeps the name they typed. Show a role name as t(role.label).
 */
export const SYSTEM_ROLE_LABELS = [
  msg("Super Admin"),
  msg("Admin"),
  msg("Finance"),
  msg("Support"),
  msg("Vendor"),
  msg("Customer"),
] as const;
