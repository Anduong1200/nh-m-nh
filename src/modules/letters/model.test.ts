import { expect, it } from "vitest";
import { parseLetter, parseLetterCommand, parseLetterReceipt, parseRevealCommand, parseRevealSession } from "./model";
import { letterTestCommand, letterTestContext as context, letterTestPartner, letterTestReceipt, letterTestSnapshot } from "./test-fixtures";
it("accepts typed commands and exact sender receipts", () => {
  const c = letterTestCommand(); expect(parseLetterCommand(c)).toEqual(c);
  expect(parseLetterReceipt(letterTestReceipt(c), context, c)).toEqual(letterTestReceipt(c));
});
it("rejects forged actors, extra fields, blank or oversized contents and mismatched receipts", () => {
  const c = letterTestCommand();
  for (const value of [{ ...c, senderId: letterTestPartner }, { ...c, payload: { ...c.payload, content: "\u00a0" } }, { ...c, payload: { ...c.payload, content: "a".repeat(2001) } }, { ...c, payload: { ...c.payload, clue: "a\nb" } }]) expect(parseLetterCommand(value)).toBeNull();
  expect(parseLetterReceipt({ ...letterTestReceipt(c), actorId: letterTestPartner }, context, c)).toBeNull();
  expect(parseLetterReceipt({ ...letterTestReceipt(c), snapshot: { ...letterTestSnapshot(c), content: "Đổi" } }, context, c)).toBeNull();
});
it("never accepts premature recipient content or sender read-receipt fields", () => {
  const letter = letterTestSnapshot(); const recipient = { ...context, accountId: letterTestPartner };
  const sealed = { ...letter, state: "sealed", content: null, canOpen: true };
  expect(parseLetter(sealed, recipient)).not.toBeNull();
  expect(parseLetter({ ...sealed, content: letter.content }, recipient)).toBeNull();
  expect(parseLetter({ ...letter, openedAt: "2026-10-01T00:01:00Z" }, context)).toBeNull();
  expect(parseLetter({ ...letter, state: "opened", version: 2 }, context)).toBeNull();
  expect(parseLetter({ ...letter, houseId: crypto.randomUUID() }, context)).toBeNull();
  expect(parseLetter({ ...sealed, state: "opened", version: 2, canOpen: false, content: letter.content }, recipient)).not.toBeNull();
});
it("requires a known session on heartbeat/ready and enforces reveal state consistency", () => {
  const c = letterTestCommand(); const sessionId = crypto.randomUUID();
  const join = { kind: "join", letterId: c.letterId, sessionId: null } as const;
  expect(parseRevealCommand(join)).toEqual(join);
  expect(parseRevealCommand({ ...join, kind: "ready" })).toBeNull();
  const snapshot = { ...letterTestSnapshot(c), revealTogether: true, state: "sealed", canJoin: true };
  const room = { sessionId, letterId: c.letterId, houseId: context.houseId, expiresAt: "2026-10-01T00:02:00Z", status: "active", connectedPlayers: 1, ownPresent: true, ownReady: false, snapshot };
  expect(parseRevealSession(room, context, join)).not.toBeNull();
  expect(parseRevealSession({ ...room, status: "revealed" }, context, join)).toBeNull();
  expect(parseRevealSession({ ...room, connectedPlayers: 0 }, context, join)).toBeNull();
  expect(parseRevealSession({ ...room, status: "expired" }, context, join)).toBeNull();
});
