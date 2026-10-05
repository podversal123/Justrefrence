import { NextResponse } from "next/server";
import { processWebhookEvent } from "@/server/domain/payment/payment-service";
import { logger } from "@/server/lib/logger";

/**
 * Razorpay webhook — the authoritative payment-confirmation path (see
 * docs/adr/0016-razorpay-payment-integration.md). The RAW body is read and
 * passed straight through to signature verification before any JSON
 * parsing happens inside payment-service.ts — re-serializing a
 * parsed-then-stringified body would not reproduce the exact bytes
 * Razorpay signed.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");

  try {
    const result = await processWebhookEvent(rawBody, signature);

    if (!result.accepted) {
      // Invalid signature / unknown order / malformed payload — logged
      // inside processWebhookEvent already; respond 400 so Razorpay's
      // retry logic doesn't treat this as a transient failure to retry
      // forever, while never finalizing anything on our side.
      return NextResponse.json({ error: result.reason ?? "Rejected" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("razorpay_webhook_processing_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    // 500 so Razorpay retries — this is an unexpected failure on our side,
    // not a signature/validity rejection.
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
