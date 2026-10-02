import type { Letter, LetterCommand, LetterContext, LetterReceipt } from "./model";
export const letterTestContext: LetterContext = { accountId: "11111111-1111-4111-8111-111111111111", houseId: "33333333-3333-4333-8333-333333333333" };
export const letterTestPartner = "22222222-2222-4222-8222-222222222222";
export function letterTestCommand(): Extract<LetterCommand, { kind: "send" }> {
  return { operationId: crypto.randomUUID(), letterId: crypto.randomUUID(), kind: "send", payload: { content: "Một điều riêng.", clue: "Một chiếc lá", delivery: { mode: "immediate" }, revealTogether: false } };
}
export function letterTestSnapshot(command = letterTestCommand()): Letter {
  return { id: command.letterId, houseId: letterTestContext.houseId, senderId: letterTestContext.accountId, recipientId: letterTestPartner, delivery: command.payload.delivery, deliverAt: "2026-10-01T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", clue: command.payload.clue, revealTogether: command.payload.revealTogether, state: "sent", version: 1, content: command.payload.content, canOpen: false, canJoin: false };
}
export function letterTestReceipt(command = letterTestCommand()): LetterReceipt {
  return { operationId: command.operationId, actorId: letterTestContext.accountId, houseId: letterTestContext.houseId, letterId: command.letterId, snapshot: letterTestSnapshot(command) };
}
