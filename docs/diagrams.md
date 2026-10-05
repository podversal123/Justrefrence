# Just Reference — High-Level Architecture Diagrams (Phase 0)

Companion to [architecture.md](architecture.md). Detailed ERD lives in [database.md](database.md); this document covers system-context, component, and key sequence diagrams.

## 1. System context

```mermaid
flowchart TB
    subgraph Users
        Cust[Customer]
        Vend[Vendor]
        Staff[Admin / Finance / Support / Super Admin]
    end

    Cust & Vend & Staff -->|HTTPS| Vercel

    subgraph Vercel["Vercel — Next.js 15 App Router"]
        UI[Server/Client Components]
        SA[Server Actions]
        RH[Route Handlers /api/v1/*]
        WH[Webhook Handlers /api/webhooks/*]
        CRON[Vercel Cron -> /api/cron/*]
    end

    UI --> SA
    UI --> RH

    SA & RH --> SVC[Application Services]
    SVC --> DOM[Domain Services]
    DOM --> REPO[Repositories - Prisma]
    REPO --> PG[(Supabase Postgres)]

    SVC --> AUTH[Supabase Auth]
    SVC --> STORE[Supabase Storage]
    SVC --> RT[Supabase Realtime]

    WH -->|signed webhook| RZP[Razorpay]
    SVC -->|initiate payment| RZP
    SVC -->|send SMS/OTP/WhatsApp| MSG91[MSG91]
    SVC -->|send email| RESEND[Resend]

    RT -.push.-> UI
```

## 2. Component / layering view

```mermaid
flowchart TB
    UI["UI: Server/Client Components (App Router)"] --> ROUTE["Route Handlers / Server Actions (thin: auth, parse, call service)"]
    ROUTE --> APPSVC["Application Services (use-case orchestration, transaction boundary)"]
    APPSVC --> DOMSVC["Domain Services (business rules — per bounded context, see modules.md)"]
    DOMSVC --> REPO["Repositories (Prisma — data access only)"]
    REPO --> DB[(PostgreSQL)]

    APPSVC -.emits.-> EVT["Domain events (OrderCompleted, PaymentConfirmed, OrderRefunded)"]
    EVT -.subscribed by.-> COMM["Commission engine"]
    EVT -.subscribed by.-> NOTIF["Notification dispatcher"]
```

This is the same rule stated in [architecture.md §2](architecture.md#2-layering-rule-mandatory) — the diagram exists so a reviewer can see the boundary at a glance: nothing above the "Application Services" line is allowed to contain money math or wallet/commission writes.

## 3. Order → Payment → Commission → Wallet → Payout sequence

Full state-transition detail lives in [financial-ledger.md](financial-ledger.md); this is the message-flow view.

```mermaid
sequenceDiagram
    participant C as Customer (browser)
    participant SA as Server Action / Route Handler
    participant OS as Order Service
    participant PS as Payment Service
    participant RZP as Razorpay
    participant WH as Webhook Handler
    participant CS as Commission Service
    participant WS as Wallet Service
    participant PO as Payout Service

    C->>SA: place order (cart -> checkout)
    SA->>OS: createOrder()
    OS-->>SA: order(status=PLACED), invoice draft
    SA->>PS: initiatePayment(order)
    PS->>RZP: create Razorpay order
    RZP-->>C: checkout widget
    C->>RZP: pays
    RZP-->>WH: webhook: payment.captured (signed)
    WH->>PS: verify signature, check idempotency (payment_events)
    PS->>OS: markOrderPaid() [state machine: PLACED -> PAID]
    PS-->>CS: emit PaymentConfirmed
    Note over OS: later, vendor/admin moves order through<br/>PROCESSING -> DELIVERED -> COMPLETED
    OS-->>CS: emit OrderCompleted
    CS->>CS: apply commission_rules, write commission_ledger (status=PENDING)
    Note over CS: release_after computed from return-window rule (Q-06)
    CS->>WS: on release: credit wallet_transactions + wallets.balance (single tx)
    C->>SA: request payout
    SA->>PO: requestPayout()
    PO->>WS: hold/verify balance
    PO-->>Staff: pending approval (2nd approver required)
    Staff->>PO: approve
    PO->>WS: debit wallet_transactions (single tx, row-locked)
    PO->>PO: payout_transactions (manual bank transfer ref)
```

## 4. Payment verification (server-side, never client-trusted)

```mermaid
sequenceDiagram
    participant C as Client
    participant RH as Route Handler
    participant PS as Payment Service
    participant RZP as Razorpay

    C->>RH: POST /payments/verify {razorpay_payment_id, razorpay_order_id, razorpay_signature}
    RH->>PS: verify(payload)
    PS->>PS: recompute HMAC(order_id + "|" + payment_id, key_secret)
    alt signature valid
        PS->>RZP: (webhook, independently) fetch/confirm event
        PS-->>RH: verified=true
        RH-->>C: 200 {success:true}
    else signature invalid
        PS-->>RH: verified=false
        RH-->>C: 400 PAYMENT_VERIFICATION_FAILED
    end
    Note over PS: The actual order/wallet state change only ever happens<br/>from the webhook path (payment_events), never from this<br/>client-triggered verify call alone — this call is a UX nicety.
```

## 5. Referral tree read path (no recursion)

```mermaid
flowchart LR
    A["Request: 'show all of X's descendants'"] --> B["Query: WHERE referral_path <@ X.referral_path"]
    B --> C["GiST index seek on ltree column"]
    C --> D["Result set — no recursive CTE, no per-level round trip"]
```

See [ADR-0003](adr/0003-referral-tree-model.md) and [database.md §Referral tree model](database.md#referral-tree-model).
