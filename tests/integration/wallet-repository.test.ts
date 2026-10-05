import { describe, expect, it, vi } from "vitest";

/**
 * Concurrent-transaction and duplicate-operation tests for the wallet
 * ledger — the Phase 7 brief's explicit final requirement. These run
 * against a STATEFUL mock Prisma client (a real in-memory wallet row, not
 * a bare spy) so the assertions exercise the actual conditional-update and
 * idempotency-check LOGIC in wallet-repository.ts, not just that a mock
 * function was called. True multi-connection Postgres row-locking can't be
 * reproduced without a live database — what IS verified here is the
 * application logic that makes that locking effective: the exact
 * `WHERE balance >= amount` guard, and that a repeated idempotencyKey never
 * re-applies a balance change. See docs/adr/0015-wallet-epin-subscription.md.
 */

vi.mock("@/server/lib/prisma", () => ({ prisma: {} }));

const { creditWallet, debitWallet, recordLedgerEntry } = await import(
  "@/server/repositories/wallet/wallet-repository"
);

interface MockWallet {
  id: string;
  balance: bigint;
  pendingBalance: bigint;
}

function createStatefulTx(initialBalance: bigint) {
  const wallet: MockWallet = { id: "wallet-1", balance: initialBalance, pendingBalance: 0n };
  const transactionsByKey = new Map<string, { id: string; balanceAfter: bigint }>();
  let nextTxnId = 1;

  const tx = {
    wallet: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const balanceOp = data["balance"] as { increment?: bigint } | undefined;
        if (balanceOp?.increment !== undefined) wallet.balance += balanceOp.increment;
        return { ...wallet };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const gte = (where["balance"] as { gte: bigint }).gte;
        if (wallet.balance < gte) return { count: 0 };
        const decrement = (data["balance"] as { decrement: bigint }).decrement;
        wallet.balance -= decrement;
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async () => ({ ...wallet })),
    },
    walletTransaction: {
      findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
        return transactionsByKey.get(where.idempotencyKey) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> & { idempotencyKey: string; balanceAfter: bigint } }) => {
        const created = { id: `txn-${nextTxnId++}`, ...data };
        transactionsByKey.set(data.idempotencyKey, created);
        return created;
      }),
    },
  };

  return { tx, wallet };
}

describe("debitWallet — concurrent-debit race safety", () => {
  it("allows a debit when the balance is sufficient", async () => {
    const { tx, wallet } = createStatefulTx(10000n);

    const result = await debitWallet(tx as never, {
      walletId: "wallet-1",
      amount: 6000n,
      type: "PAYOUT",
      referenceType: "TEST",
      referenceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "debit-1",
    });

    expect(result.applied).toBe(true);
    expect(wallet.balance).toBe(4000n);
  });

  it("refuses a debit that would overdraw the balance — never goes negative", async () => {
    const { tx, wallet } = createStatefulTx(5000n);

    const result = await debitWallet(tx as never, {
      walletId: "wallet-1",
      amount: 6000n,
      type: "PAYOUT",
      referenceType: "TEST",
      referenceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "debit-1",
    });

    expect(result.applied).toBe(false);
    expect(wallet.balance).toBe(5000n); // untouched
  });

  it("'concurrent' debits: the second of two same-amount debits against insufficient remaining balance fails, the first succeeds", async () => {
    // Two requests for 6000 against a starting balance of 10000. In real
    // Postgres these would race for the same row lock; whichever commits
    // first wins and the second re-evaluates WHERE against the now-lower
    // balance and fails — exactly what this sequential simulation proves
    // the repository's logic does (see the module doc comment above for
    // why true concurrency itself needs a live database to observe).
    const { tx, wallet } = createStatefulTx(10000n);

    const [first, second] = await Promise.all([
      debitWallet(tx as never, {
        walletId: "wallet-1",
        amount: 6000n,
        type: "PAYOUT",
        referenceType: "TEST",
        referenceId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "debit-a",
      }),
      debitWallet(tx as never, {
        walletId: "wallet-1",
        amount: 6000n,
        type: "PAYOUT",
        referenceType: "TEST",
        referenceId: "22222222-2222-4222-8222-222222222222",
        idempotencyKey: "debit-b",
      }),
    ]);

    const outcomes = [first.applied, second.applied];
    expect(outcomes.filter(Boolean)).toHaveLength(1); // exactly one succeeded
    expect(wallet.balance).toBe(4000n); // only ONE debit actually applied
    expect(wallet.balance).toBeGreaterThanOrEqual(0n); // the invariant that matters
  });

  it("three concurrent debits of 4000 against a balance of 10000 — only two can succeed", async () => {
    const { tx, wallet } = createStatefulTx(10000n);

    const results = await Promise.all(
      ["debit-1", "debit-2", "debit-3"].map((key) =>
        debitWallet(tx as never, {
          walletId: "wallet-1",
          amount: 4000n,
          type: "PAYOUT",
          referenceType: "TEST",
          referenceId: "11111111-1111-4111-8111-111111111111",
          idempotencyKey: key,
        }),
      ),
    );

    expect(results.filter((r) => r.applied)).toHaveLength(2);
    expect(wallet.balance).toBe(2000n);
    expect(wallet.balance).toBeGreaterThanOrEqual(0n);
  });

  it("rejects a non-positive debit amount outright", async () => {
    const { tx } = createStatefulTx(10000n);
    await expect(
      debitWallet(tx as never, {
        walletId: "wallet-1",
        amount: 0n,
        type: "PAYOUT",
        referenceType: "TEST",
        referenceId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "debit-1",
      }),
    ).rejects.toThrow();
  });
});

describe("creditWallet / debitWallet — duplicate-operation idempotency", () => {
  it("applying the same credit idempotencyKey twice only credits once", async () => {
    const { tx, wallet } = createStatefulTx(0n);
    const input = {
      walletId: "wallet-1",
      amount: 5000n,
      type: "COMMISSION" as const,
      referenceType: "COMMISSION",
      referenceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "commission-available:commission-1",
    };

    const first = await creditWallet(tx as never, input);
    const second = await creditWallet(tx as never, input);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(wallet.balance).toBe(5000n); // not 10000 — the retry was a true no-op
  });

  it("applying the same debit idempotencyKey twice only debits once", async () => {
    const { tx, wallet } = createStatefulTx(10000n);
    const input = {
      walletId: "wallet-1",
      amount: 3000n,
      type: "PAYOUT" as const,
      referenceType: "PAYOUT_REQUEST",
      referenceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "payout-request-1",
    };

    const first = await debitWallet(tx as never, input);
    const second = await debitWallet(tx as never, input);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(wallet.balance).toBe(7000n); // not 4000 — the retry did not debit again
  });

  it("a replayed idempotencyKey returns the ORIGINAL transaction's balanceAfter, not a fresh computation", async () => {
    const { tx } = createStatefulTx(10000n);
    const input = {
      walletId: "wallet-1",
      amount: 1000n,
      type: "COMMISSION" as const,
      referenceType: "COMMISSION",
      referenceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "replay-key",
    };

    const first = await creditWallet(tx as never, input);
    const second = await creditWallet(tx as never, input);

    expect(second.existing?.balanceAfter).toBe(first.transaction?.balanceAfter);
  });

  it("recordLedgerEntry is also idempotent and never double-inserts for the same key", async () => {
    const { tx } = createStatefulTx(10000n);
    const input = {
      walletId: "wallet-1",
      direction: "DEBIT" as const,
      amount: 2000n,
      type: "PAYOUT" as const,
      referenceType: "PAYOUT_REQUEST",
      referenceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "hold-entry-1",
    };

    const first = await recordLedgerEntry(tx as never, input);
    const second = await recordLedgerEntry(tx as never, input);

    expect(first.applied).toBe(true);
    expect(second.applied).toBe(false);
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
  });
});

describe("balance invariant", () => {
  it("never produces a negative balance across a mix of credits and debits, concurrent or not", async () => {
    const { tx, wallet } = createStatefulTx(1000n);

    await Promise.all([
      debitWallet(tx as never, {
        walletId: "wallet-1",
        amount: 800n,
        type: "PAYOUT",
        referenceType: "TEST",
        referenceId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "d1",
      }),
      debitWallet(tx as never, {
        walletId: "wallet-1",
        amount: 800n,
        type: "PAYOUT",
        referenceType: "TEST",
        referenceId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "d2",
      }),
      creditWallet(tx as never, {
        walletId: "wallet-1",
        amount: 500n,
        type: "COMMISSION",
        referenceType: "TEST",
        referenceId: "11111111-1111-4111-8111-111111111111",
        idempotencyKey: "c1",
      }),
    ]);

    expect(wallet.balance).toBeGreaterThanOrEqual(0n);
  });
});
