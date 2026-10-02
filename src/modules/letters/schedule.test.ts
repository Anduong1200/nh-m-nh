import { expect, it } from "vitest";
import { makeLetterSchedule, parseLetterDelivery, resolveLetterTime } from "./schedule";
it("resolves Vietnam and quarter-hour timezones to UTC", () => {
  expect(makeLetterSchedule("2027-01-10T08:00", "Asia/Ho_Chi_Minh").deliverAt).toBe("2027-01-10T01:00:00.000Z");
  expect(makeLetterSchedule("2027-01-10T08:00", "Asia/Kathmandu").deliverAt).toBe("2027-01-10T02:15:00.000Z");
});
it("rejects nonexistent DST wall times instead of moving them", () => {
  expect(resolveLetterTime("2027-03-14T02:30", "America/New_York").kind).toBe("gap");
  expect(() => makeLetterSchedule("2027-03-14T02:30", "America/New_York")).toThrow("does not exist");
});
it("requires an explicit choice for repeated DST wall times", () => {
  expect(resolveLetterTime("2027-11-07T01:30", "America/New_York").instants).toEqual(["2027-11-07T05:30:00.000Z", "2027-11-07T06:30:00.000Z"]);
  expect(() => makeLetterSchedule("2027-11-07T01:30", "America/New_York")).toThrow("explicit instant");
  expect(makeLetterSchedule("2027-11-07T01:30", "America/New_York", "later").deliverAt).toBe("2027-11-07T06:30:00.000Z");
});
it("handles half-hour DST transitions", () => {
  expect(resolveLetterTime("2027-10-03T02:15", "Australia/Lord_Howe").kind).toBe("gap");
  expect(resolveLetterTime("2027-04-04T01:45", "Australia/Lord_Howe").instants).toHaveLength(2);
});
it.each([["2027-02-30T10:00", "UTC"], ["2027-01-10T08:00Z", "UTC"], ["2027-01-10T08:00", "not/a-zone"], ["1999-01-01T00:00", "UTC"]])("rejects invalid input %s %s", (local, zone) => expect(resolveLetterTime(local!, zone!).kind).toBe("invalid"));
it("rejects forged timezone/UTC combinations", () => {
  const good = makeLetterSchedule("2027-01-10T08:00", "Asia/Ho_Chi_Minh");
  expect(parseLetterDelivery(good)).toEqual(good);
  expect(parseLetterDelivery({ ...good, deliverAt: "2027-01-10T08:00:00.000Z" })).toBeNull();
  expect(parseLetterDelivery({ mode: "immediate", deliverAt: good.deliverAt })).toBeNull();
});
