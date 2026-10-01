import { describe, expect, it } from "vitest";
import { parseKnockInput } from "./model";

const operationId = "11111111-1111-4111-8111-111111111111";

describe("small Knock payloads", () => {
  it("preserves the operation UUID for retry and ignores actor/House spoofing", () => {
    expect(parseKnockInput({ operationId, kind: "note", content: "  Nghĩ đến cậu  ", senderId: "victim", houseId: "outsider" }).value)
      .toEqual({ operationId, kind: "note", content: "Nghĩ đến cậu" });
  });
  it.each(["leaf", "star", "tea", "hug"])("accepts the small fixed sticker %s", (content) => {
    expect(parseKnockInput({ operationId, kind: "sticker", content }).value?.content).toBe(content);
  });
  it.each([
    { operationId: "guessable" }, { content: "" }, { content: "x".repeat(161) },
    { content: "two\nlines" }, { kind: "chat" }, { kind: "sticker", content: "javascript:alert(1)" },
  ])("rejects invalid or expanded payloads %j", (patch) => {
    expect(parseKnockInput({ operationId, kind: "note", content: "hello", ...patch }).error).toBeTruthy();
  });
});
