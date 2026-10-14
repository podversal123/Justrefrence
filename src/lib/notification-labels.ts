/** The one place that turns a notification type into a sentence a person can read. */
import { msg } from "@/i18n/locales";

const NOTIFICATION_LABELS: Record<string, string> = {
  WELCOME: msg("Welcome to Justreference"),
  BIRTHDAY_GREETING: msg("Happy birthday from Justreference!"),
  TICKET_REPLY: msg("New reply on your support ticket"),
  TICKET_STATUS: msg("Your support ticket was updated"),
  MESSAGE_RECEIVED: msg("You have a new message"),
  BID_RECEIVED: msg("A vendor placed a bid on your requirement"),
  OUTBID: msg("You were outbid in a reverse auction"),
  BID_AWARDED: msg("Your bid was awarded"),
  BID_NOT_SELECTED: msg("Your bid was not selected"),
  REQUIREMENT_CANCELLED: msg("A requirement you bid on was cancelled"),
  AUCTION_BID_RECEIVED: msg("Someone placed a bid on your auction"),
  AUCTION_OUTBID: msg("You were outbid in an auction"),
  AUCTION_WON: msg("You won an auction. Pay to confirm your order"),
  AUCTION_LOST: msg("An auction you bid in has ended"),
  AUCTION_SOLD: msg("Your auction ended with a winner"),
  AUCTION_UNSOLD: msg("Your auction ended without a sale"),
  AUCTION_CANCELLED: msg("An auction you bid in was cancelled"),
  AUCTION_PAID: msg("The winner paid for your auction"),
  REWARD_RECEIVED: msg("You received a reward"),
  AD_SUBMITTED: msg("An ad is waiting for your approval"),
  AD_APPROVED: msg("Your ad was approved and is now showing"),
  AD_REJECTED: msg("Your ad was not approved"),
  SMS_RECEIVED: msg("You have a new SMS from the team"),
  CHANGE_REQUESTED: msg("A change is waiting for your approval"),
  CHANGE_APPROVED: msg("Your change was approved"),
  CHANGE_REJECTED: msg("Your change was not approved"),
  KYC_VERIFIED: msg("Your document was verified"),
  KYC_REJECTED: msg("Your document needs to be uploaded again"),
};

export function describeNotification(type: string): string {
  return NOTIFICATION_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
}
