import { describe, expect, it } from "vitest";
import { composeCommand, emptyLetterForm, parseComposerDraft, preferLetterProjection } from "./ui-model";
import type { Letter } from "@/modules/letters/model";
const ids = { operationId: "11111111-1111-4111-8111-111111111111", letterId: "22222222-2222-4222-8222-222222222222" };
describe("Letters composer boundary", () => {
  it("preserves multiline body exactly and produces a strict immediate command", () => {
    const form = { ...emptyLetterForm(), content: "  Một lá thư\ncho người thương.  ", clue: "Một chiếc lá", together: true };
    expect(composeCommand(form, ids)).toEqual({ ...ids, kind: "send", payload: { content: form.content, clue: form.clue, delivery: { mode: "immediate" }, revealTogether: true } });
  });
  it("counts Unicode codepoints and rejects control/multiline clue content", () => {
    expect(() => composeCommand({ ...emptyLetterForm(), content: "🐇".repeat(2000) }, ids)).not.toThrow();
    expect(() => composeCommand({ ...emptyLetterForm(), content: "🐇".repeat(2001) }, ids)).toThrow();
    expect(() => composeCommand({ ...emptyLetterForm(), content: "Một lá thư", clue: "hai\ndòng" }, ids)).toThrow();
  });
  it("keeps the chosen IANA wall-time metadata and UTC instant", () => {
    const command = composeCommand({ ...emptyLetterForm(), content: "Thư hẹn giờ", mode: "scheduled", localDateTime: "2027-01-10T08:00" }, ids);
    expect(command.kind === "send" && command.payload.delivery).toEqual({ mode: "scheduled", deliverAt: "2027-01-10T01:00:00.000Z", localDateTime: "2027-01-10T08:00", timeZone: "Asia/Ho_Chi_Minh" });
  });
  it("requires an explicit repeated-time choice and rejects a DST gap", () => {
    const form = { ...emptyLetterForm("America/New_York"), content: "Một giờ hẹn", mode: "scheduled" as const, localDateTime: "2027-11-07T01:30" };
    expect(() => composeCommand(form, ids)).toThrow(/xuất hiện hai lần/u);
    const command = composeCommand({ ...form, dst: "later" }, ids);
    expect(command.kind === "send" && command.payload.delivery).toMatchObject({ deliverAt: "2027-11-07T06:30:00.000Z" });
    expect(() => composeCommand({ ...form, localDateTime: "2027-03-14T02:30" }, ids)).toThrow(/không tồn tại/u);
  });
  it("restores the exact pending request and rejects a draft that attempts another action", () => {
    const form = { ...emptyLetterForm(), content: "Giữ nguyên lần gửi này" };
    const pending = composeCommand(form, ids);
    expect(parseComposerDraft(JSON.parse(JSON.stringify({ form, pending })))).toEqual({ form, pending });
    expect(parseComposerDraft({ form, pending: { ...ids, kind: "open" } })).toBeNull();
    expect(parseComposerDraft({ form: { ...form, timeZone: 12 }, pending: null })).toBeNull();
  });
  it("rejects a past or current scheduled instant before freezing a send request", () => {
    const form = { ...emptyLetterForm(), content: "Chưa gửi", mode: "scheduled" as const, localDateTime: "2027-01-10T08:00" };
    const instant = Date.parse("2027-01-10T01:00:00.000Z");
    expect(() => composeCommand(form, ids, instant)).toThrow(/tương lai/u);
    expect(() => composeCommand(form, ids, instant + 1)).toThrow(/tương lai/u);
    expect(() => composeCommand(form, ids, instant - 1)).not.toThrow();
  });
  it("never rolls an accepted opening or delivered author projection back with a late read", () => {
    const sealed = { id: ids.letterId, houseId: ids.operationId, version: 1, state: "sealed", content: null } as Letter;
    const opened = { ...sealed, version: 2, state: "opened", content: "Đã mở cùng nhau" } as Letter;
    expect(preferLetterProjection(opened, sealed)).toBe(opened);
    expect(preferLetterProjection(sealed, opened)).toBe(opened);
    const sent = { ...sealed, state: "sent", content: "Thư của tác giả" } as Letter;
    const scheduled = { ...sent, state: "scheduled" } as Letter;
    expect(preferLetterProjection(sent, scheduled)).toBe(sent);
    expect(preferLetterProjection(scheduled, sent)).toBe(sent);
  });
});
