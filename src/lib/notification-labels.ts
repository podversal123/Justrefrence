/** The one place that turns a notification type into a sentence a person can read. */
const NOTIFICATION_LABELS: Record<string, string> = {
  WELCOME: "Welcome to Justreference",
  BIRTHDAY_GREETING: "Happy birthday from Justreference!",
  TICKET_REPLY: "New reply on your support ticket",
  TICKET_STATUS: "Your support ticket was updated",
  MESSAGE_RECEIVED: "You have a new message",
  BID_RECEIVED: "A vendor placed a bid on your requirement",
  OUTBID: "You were outbid in a reverse auction",
  BID_AWARDED: "Your bid was awarded",
  BID_NOT_SELECTED: "Your bid was not selected",
  REQUIREMENT_CANCELLED: "A requirement you bid on was cancelled",
  CHANGE_REQUESTED: "A change is waiting for your approval",
  CHANGE_APPROVED: "Your change was approved",
  CHANGE_REJECTED: "Your change was not approved",
  KYC_VERIFIED: "Your document was verified",
  KYC_REJECTED: "Your document needs to be uploaded again",
};

export function describeNotification(type: string): string {
  return NOTIFICATION_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
}
