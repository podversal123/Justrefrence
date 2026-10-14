import "server-only";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import type { AuctionEnding } from "@/server/domain/auction/auction-service";

/** Notifications are a courtesy: a failure to deliver one never undoes the bid or sale it describes. */
export async function notifyAuction(
  userId: string,
  type: string,
  payload: Record<string, string | number>,
) {
  await createNotification({ userId, type, payload }).catch(() => undefined);
}

/** Tells the seller, the winner and the other bidders how an ended auction turned out. */
export async function notifyAuctionEnding(ending: AuctionEnding) {
  const payload = { auctionId: ending.auctionId, number: ending.number };
  const tasks: Promise<void>[] = [
    notifyAuction(
      ending.vendorUserId,
      ending.outcome === "SOLD" ? "AUCTION_SOLD" : "AUCTION_UNSOLD",
      payload,
    ),
    ...ending.loserUserIds.map((id) => notifyAuction(id, "AUCTION_LOST", payload)),
  ];
  if (ending.winnerUserId) tasks.push(notifyAuction(ending.winnerUserId, "AUCTION_WON", payload));
  await Promise.all(tasks);
}
