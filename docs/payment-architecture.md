# Just Reference — Payment Architecture (Phase 0)

Razorpay integration detail, expanding [security.md](security.md) §5 and [financial-ledger.md](financial-ledger.md) Stage 2. Covers orders, wallet top-ups, e-pin/subscription purchases — every flow that calls Razorpay uses this same architecture.

## 1. Principle

The browser is a **notifier**, never a **source of truth**. It tells the server "the user attempted payment X and the checkout widget reported success" — the server independently confirms this via signature verification and, authoritatively, via the Razorpay webhook before any financial state changes.

## 2. Payment creation flow

```mermaid
sequenceDiagram
    participant C as Client
    participant SA as Server Action / Route Handler
    participant PS as Payment Service
    participant RZP as Razorpay

    C->>SA: initiate payment (orderId | purpose=WALLET_TOPUP | purpose=EPIN_PURCHASE)
    SA->>PS: initiatePayment(payerId, purpose, referenceId, amount)
    PS->>PS: recompute amount server-side from the referenced order/top-up request — never trust a client-supplied amount
    PS->>RZP: create Razorpay order (amount, currency, receipt=idempotency_key)
    RZP-->>PS: razorpay_order_id
    PS->>PS: INSERT payments (status=CREATED, provider_order_id, idempotency_key)
    PS-->>C: razorpay_order_id + key_id (public) for the checkout widget
    C->>RZP: opens Razorpay Checkout, pays
```

## 3. Client-side callback (UX only, not authoritative)

```mermaid
sequenceDiagram
    participant RZP as Razorpay Checkout
    participant C as Client
    participant RH as /api/v1/payments/verify
    participant PS as Payment Service

    RZP-->>C: razorpay_payment_id, razorpay_order_id, razorpay_signature
    C->>RH: POST /payments/verify {payment_id, order_id, signature}
    RH->>PS: verifySignature(payload)
    PS->>PS: HMAC-SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET) == signature ?
    alt valid
        PS-->>RH: {verified: true}
        RH-->>C: 200 — show "payment received, confirming..." (order still PLACED, not yet PAID)
    else invalid
        PS-->>RH: {verified: false}
        RH-->>C: 400 PAYMENT_VERIFICATION_FAILED
    end
```

This call **never** flips `orders.status` to `PAID` or writes to `wallet_transactions` — it only gives the client fast, honest UI feedback. The authoritative state change happens exclusively via §4.

## 4. Webhook processing (authoritative path)

```mermaid
sequenceDiagram
    participant RZP as Razorpay
    participant WH as /api/webhooks/razorpay
    participant PS as Payment Service
    participant DB as Postgres

    RZP->>WH: POST event (payment.captured / payment.failed / refund.processed), header X-Razorpay-Signature
    WH->>WH: verify HMAC over the RAW request body (not the parsed/re-serialized JSON) using RAZORPAY_WEBHOOK_SECRET
    alt signature invalid
        WH-->>RZP: 400 (logged, no side effect)
    else signature valid
        WH->>DB: INSERT payment_events (provider='RAZORPAY', event_id, raw_payload, signature_valid=true) — UNIQUE(provider, event_id)
        alt event_id already exists (replay)
            DB-->>WH: unique constraint hit
            WH-->>RZP: 200 (acknowledged, no second side effect — idempotent)
        else new event
            WH->>PS: processEvent(event)
            PS->>DB: BEGIN
            PS->>DB: UPDATE payments SET status=CAPTURED WHERE provider_order_id=...
            PS->>DB: order/top-up/e-pin specific downstream effect (order PLACED->PAID, wallet top-up credit, e-pin issuance) — via the owning module's service, not inline here
            PS->>DB: UPDATE payment_events SET processed_at=now()
            PS->>DB: COMMIT
            WH-->>RZP: 200
        end
    end
```

Key points, each already stated as a rule elsewhere and repeated here because this is the highest-risk code path in the system:
- Signature verification uses the **raw** request body — re-serializing parsed JSON before verifying can silently change byte content and break HMAC matching, a common real-world bug class for webhook integrations.
- The unique constraint on `(provider, event_id)` is the idempotency mechanism, not an application-level "have I seen this before" check (which would itself have a race condition) — the database constraint is the one thing guaranteed to be atomic under concurrent delivery.
- The webhook handler returns 200 as soon as the event is durably recorded and processed, so Razorpay stops retrying; a 4xx/5xx here causes Razorpay to retry per its own schedule, which the idempotency handling above makes safe.

## 5. Refunds

```mermaid
flowchart LR
    A["Admin/Finance initiates refund\n(order or payment reference)"] --> B["Payment Service calls Razorpay Refund API"]
    B --> C["payment_transactions INSERT (type=REFUND)"]
    C --> D["Razorpay sends refund.processed webhook"]
    D --> E["Same webhook path as §4 — idempotent, signature-verified"]
    E --> F["orders.status -> REFUNDED (state machine)"]
    F --> G["OrderRefunded event -> commission reversal (see referral-commission.md §5)"]
```

Per the client's own status document, the gateway refund call-out is a production-build-stage task (Phase 4-equivalent), not a Phase 0/1 gap — the ledger-recording side (`payment_transactions`, the downstream `orders`/`commission` reaction) is designed and built regardless; only the literal Razorpay Refund API call is deferred to when live credentials exist.

## 6. Payment methods & scope (Q-28)

Razorpay online methods only (UPI, cards, net banking) — no cash-on-delivery in Phase 1, per the adopted default in [business-rules.md](business-rules.md) Q-28. Wallet-balance-as-payment-method is a separate, internal flow (debit `wallet_transactions` directly, no Razorpay call) gated on Q-09's confirmation that wallet balance may pay for orders.

## 7. Test coverage required (see [testing.md](testing.md) §2)

- Valid signature → processed once.
- Invalid signature → rejected, no side effect, logged.
- Duplicate webhook delivery (same `event_id`) → acknowledged, no second side effect.
- Out-of-order delivery (e.g., `refund.processed` arriving before the corresponding `payment.captured` was ever recorded) → handled gracefully, not assumed to arrive in order.
- Client claims success but no webhook ever arrives (e.g., user closes tab) → order remains `PLACED`, a reconciliation job periodically polls Razorpay for orders stuck in `CREATED`/`PLACED` past a timeout window and resolves them explicitly rather than leaving them ambiguous forever.
