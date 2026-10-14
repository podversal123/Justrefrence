/**
 * End-to-end verification of the admin SMS service against the REAL database (not mocks):
 * single send, the "recorded only" honesty, replay and concurrent double submit, who a group would go
 * to, drafts (ownership, sending removes them), and the member inbox. Group sends are NOT executed
 * here, so no real member gets a record; only who they would reach is checked.
 * Creates throwaway users (marker domain @smstest.justreference.test) and deletes them again.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/verify-sms.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import {
  deleteDraft,
  markAllSmsRead,
  markSmsRead,
  resolveRecipients,
  saveDraft,
  sendSmsBatch,
} from "@/server/domain/sms/sms-service";
import { countUnreadInbox, listInbox, listOutbox } from "@/server/repositories/sms/sms-repository";

const DOMAIN = "@smstest.justreference.test";
let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}`, detail ?? "");
  }
}

async function expectReject(label: string, run: () => Promise<unknown>, messagePart?: string) {
  try {
    await run();
    check(label, false, "(expected a rejection, but it succeeded)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(
      label,
      messagePart ? message.toLowerCase().includes(messagePart.toLowerCase()) : true,
      message,
    );
  }
}

let phoneCounter = 0;
async function makeUser(
  name: string,
  opts: { member?: boolean; phone?: boolean; status?: "ACTIVE" | "BLOCKED" } = {},
) {
  phoneCounter += 1;
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${name}-${randomUUID().slice(0, 8)}${DOMAIN}`,
      fullName: name,
      status: opts.status ?? "ACTIVE",
      emailVerifiedAt: new Date(),
      phone:
        opts.phone === false
          ? null
          : `+9199${String(Date.now()).slice(-6)}${phoneCounter}0`.slice(0, 13),
    },
  });
  if (opts.member !== false) {
    const member = await prisma.memberProfile.create({
      data: { userId: user.id, referralPath: "root" },
    });
    await prisma.memberProfile.update({
      where: { id: member.id },
      data: { memberId: `SM-${member.memberSeq}` },
    });
  }
  return user;
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.smsMessage.deleteMany({
    where: { OR: [{ senderId: { in: ids } }, { recipientUserId: { in: ids } }] },
  });
  await prisma.smsDraft.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.memberProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  await cleanup(); // leftovers from an interrupted earlier run

  const admin = await makeUser("admin", { member: false });
  const otherAdmin = await makeUser("admin2", { member: false });
  const ann = await makeUser("ann");
  const raj = await makeUser("raj");
  const noPhone = await makeUser("nophone", { phone: false });
  const blocked = await makeUser("blocked", { status: "BLOCKED" });
  const nonMember = await makeUser("nonmember", { member: false });

  // ---------------------------------------------------------------- single send
  const key = randomUUID();
  const send = (to: string, body: string, k = key) =>
    sendSmsBatch(admin.id, { audience: "SINGLE", recipientEmail: to, body, idempotencyKey: k });

  const first = await send(ann.email, "Your reward is ready.");
  check("a single send reaches one member", first.total === 1 && first.sent === 1 && first.created);
  check("with no real provider it says the text was only recorded", first.recordedOnly);
  const row = await prisma.smsMessage.findFirstOrThrow({ where: { recipientUserId: ann.id } });
  check(
    "the row keeps the number, text and provider",
    row.phone === ann.phone &&
      row.body === "Your reward is ready." &&
      row.provider === "console-sms",
  );
  check("the row is SENT with a time", row.status === "SENT" && row.sentAt !== null);

  const replay = await send(ann.email, "Your reward is ready.");
  check("the same submission is a replay, not a second SMS", !replay.created && replay.total === 1);
  check(
    "a replay creates no second row",
    (await prisma.smsMessage.count({ where: { recipientUserId: ann.id } })) === 1,
  );

  const burstKey = randomUUID();
  const burst = await Promise.allSettled([
    send(raj.email, "Burst", burstKey),
    send(raj.email, "Burst", burstKey),
    send(raj.email, "Burst", burstKey),
  ]);
  check(
    "three simultaneous identical sends make exactly one message",
    (await prisma.smsMessage.count({ where: { recipientUserId: raj.id } })) === 1,
  );
  check(
    "and none of them errors",
    burst.every((r) => r.status === "fulfilled"),
    burst.map((r) => r.status),
  );

  await expectReject(
    "a member without a mobile number is refused",
    () => send(noPhone.email, "Hi", randomUUID()),
    "mobile number",
  );
  await expectReject(
    "a blocked member can't be messaged",
    () => send(blocked.email, "Hi", randomUUID()),
    "no active member",
  );
  await expectReject(
    "a non-member can't be messaged",
    () => send(nonMember.email, "Hi", randomUUID()),
    "no active member",
  );
  await expectReject(
    "an unknown email is refused",
    () => send("nobody@smstest.justreference.test", "Hi", randomUUID()),
    "no active member",
  );

  // ---------------------------------------------------------------- who a group would reach
  const everyone = await resolveRecipients("ALL_MEMBERS");
  const ids = new Set(everyone.recipients.map((r) => r.userId));
  check(
    "a group send includes active members who have a number",
    ids.has(ann.id) && ids.has(raj.id),
  );
  check(
    "but not blocked, number-less or non-member accounts",
    !ids.has(blocked.id) && !ids.has(noPhone.id) && !ids.has(nonMember.id),
  );
  check("members without a number are counted as skipped", everyone.skippedNoPhone >= 1);
  const vendors = await resolveRecipients("VENDORS");
  check(
    "a vendor group excludes ordinary members",
    !vendors.recipients.some((r) => r.userId === ann.id),
  );

  // ---------------------------------------------------------------- drafts
  const draft = await saveDraft(admin.id, {
    audience: "SINGLE",
    recipientEmail: ann.email,
    body: "Draft text",
  });
  const edited = await saveDraft(admin.id, {
    draftId: draft.id,
    audience: "SINGLE",
    recipientEmail: ann.email,
    body: "Edited draft",
  });
  check(
    "a draft can be saved and edited by its author",
    edited.id === draft.id &&
      (await prisma.smsDraft.findUniqueOrThrow({ where: { id: draft.id } })).body ===
        "Edited draft",
  );
  await expectReject(
    "another admin can't overwrite it",
    () =>
      saveDraft(otherAdmin.id, {
        draftId: draft.id,
        audience: "SINGLE",
        recipientEmail: ann.email,
        body: "Hijack",
      }),
    "not found",
  );
  await expectReject(
    "another admin can't delete it",
    () => deleteDraft(otherAdmin.id, draft.id),
    "not found",
  );

  const sentFromDraft = await sendSmsBatch(admin.id, {
    audience: "SINGLE",
    recipientEmail: ann.email,
    body: "Edited draft",
    idempotencyKey: randomUUID(),
    draftId: draft.id,
  });
  check("sending a draft sends it", sentFromDraft.sent === 1);
  check("and removes the draft", (await prisma.smsDraft.count({ where: { id: draft.id } })) === 0);

  const stray = await saveDraft(admin.id, { audience: "ALL_MEMBERS", body: "Group draft" });
  await deleteDraft(admin.id, stray.id);
  check(
    "a draft can be deleted by its author",
    (await prisma.smsDraft.count({ where: { id: stray.id } })) === 0,
  );

  // ---------------------------------------------------------------- inbox and outbox
  const inbox = await listInbox(ann.id);
  check(
    "the member's inbox lists what was sent to them",
    inbox.length === 2 && inbox.every((m) => m.readAt === null),
  );
  check(
    "the bell notification was created",
    (await prisma.notification.count({ where: { userId: ann.id, type: "SMS_RECEIVED" } })) === 2,
  );
  check("unread count matches", (await countUnreadInbox(ann.id)) === 2);

  await markSmsRead(raj.id, inbox[0]!.id); // someone else's message
  check(
    "a member can't mark another member's message read",
    (await countUnreadInbox(ann.id)) === 2,
  );
  await markSmsRead(ann.id, inbox[0]!.id);
  check("a member can mark their own message read", (await countUnreadInbox(ann.id)) === 1);
  await markAllSmsRead(ann.id);
  check("and mark all read", (await countUnreadInbox(ann.id)) === 0);

  await prisma.smsMessage.update({
    where: { id: row.id },
    data: { status: "FAILED", failureReason: "x" },
  });
  check(
    "a failed message is not shown in the member's inbox",
    (await listInbox(ann.id)).every((m) => m.id !== row.id),
  );

  const outbox = await listOutbox({ search: "Burst" });
  check(
    "the outbox search finds a message by its words",
    outbox.items.some((m) => m.body === "Burst"),
  );
  const failed = await listOutbox({ status: "FAILED", search: ann.email });
  check(
    "the outbox filters by status",
    failed.items.length === 1 && failed.items[0]?.id === row.id,
  );
}

main()
  .catch((error) => {
    failures.push("script crashed");
    console.error(error);
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log("cleaned up test rows");
    } catch (error) {
      console.error("CLEANUP FAILED: delete users ending in", DOMAIN, error);
    }
    await prisma.$disconnect();
    console.log(
      `\n${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`,
    );
    process.exit(failures.length ? 1 : 0);
  });
