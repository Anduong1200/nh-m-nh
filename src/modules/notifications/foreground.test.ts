import { describe, expect, it, vi } from "vitest";
import type { Knock } from "@/modules/knocks/model";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "./model";
import { ForegroundKnockNotifications, browserNotificationTransport, type ForegroundKnockContext, type NotificationTransport } from "./foreground";

const knock: Knock = { id: "first", senderId: "partner", recipientId: "actor", kind: "note", content: "Private note", createdAt: "2026-10-01T12:00:00Z" };
function setup() {
  const close = vi.fn();
  const transport: NotificationTransport = { permission: vi.fn(() => "granted" as const), requestPermission: vi.fn(), show: vi.fn(() => ({ close })) };
  const delivery = new ForegroundKnockNotifications(transport);
  const context: ForegroundKnockContext = { recipientId: "actor", knocks: [], preferences: { ...DEFAULT_NOTIFICATION_PREFERENCES }, online: true, visible: true, now: new Date("2026-10-01T12:00:00Z") };
  delivery.observe(context);
  return { delivery, context, transport, close };
}

describe("foreground Knock delivery abstraction", () => {
  it("does not replay the existing inbox on first load or ask for permission", () => {
    const { delivery, context, transport } = setup();
    delivery.close();
    delivery.observe({ ...context, knocks: [knock] });
    delivery.observe({ ...context, knocks: [knock] });
    expect(transport.show).not.toHaveBeenCalled();
    expect(transport.requestPermission).not.toHaveBeenCalled();
  });
  it("delivers each fresh recipient event once with generic text", () => {
    const { delivery, context, transport } = setup();
    delivery.observe({ ...context, knocks: [knock] });
    delivery.observe({ ...context, knocks: [knock] });
    expect(transport.show).toHaveBeenCalledExactlyOnceWith({ title: "Nhà Mình", body: "Có một cú gõ cửa trong Nhà.", tag: knock.id });
    expect(JSON.stringify(vi.mocked(transport.show).mock.calls)).not.toContain(knock.content);
  });
  it("includes details only with recipient opt-in", () => {
    const { delivery, context, transport } = setup();
    delivery.observe({ ...context, knocks: [knock], preferences: { ...context.preferences, preview: "detail" } });
    expect(transport.show).toHaveBeenCalledWith(expect.objectContaining({ body: knock.content }));
  });
  it("deduplicates an event repeated in the same snapshot", () => {
    const { delivery, context, transport } = setup();
    delivery.observe({ ...context, knocks: [knock, { ...knock }] });
    expect(transport.show).toHaveBeenCalledOnce();
  });
  it.each([{ online: false }, { visible: false }, { now: new Date(NaN) }])("suppresses %j and does not replay it later", (patch) => {
    const { delivery, context, transport } = setup();
    delivery.observe({ ...context, ...patch, knocks: [knock] });
    delivery.observe({ ...context, knocks: [knock] });
    expect(transport.show).not.toHaveBeenCalled();
  });
  it.each(["default", "denied", "unsupported"] as const)("never delivers or requests permission when permission is %s", (permission) => {
    const { delivery, context, transport } = setup();
    vi.mocked(transport.permission).mockReturnValue(permission);
    delivery.observe({ ...context, knocks: [knock] });
    vi.mocked(transport.permission).mockReturnValue("granted");
    delivery.observe({ ...context, knocks: [knock] });
    expect(transport.show).not.toHaveBeenCalled();
    expect(transport.requestPermission).not.toHaveBeenCalled();
  });
  it("honors quiet hours and disabled notices without delayed replay", () => {
    const { delivery, context, transport } = setup();
    const quiet = { ...context.preferences, quietEnabled: true };
    delivery.observe({ ...context, knocks: [knock], preferences: quiet, now: new Date("2026-10-01T16:00:00Z") });
    delivery.observe({ ...context, knocks: [knock] });
    delivery.observe({ ...context, knocks: [{ ...knock, id: "second" }], preferences: { ...quiet, knocksEnabled: false } });
    expect(transport.show).not.toHaveBeenCalled();
  });
  it("fails closed on invalid preferences and ignores another recipient's events", () => {
    const { delivery, context, transport } = setup();
    delivery.observe({ ...context, knocks: [knock], preferences: { ...context.preferences, timeZone: "Invalid/Zone" } });
    delivery.observe({ ...context, knocks: [{ ...knock, id: "wrong-recipient", recipientId: "other" }] });
    expect(transport.show).not.toHaveBeenCalled();
  });
  it("closes private notices and primes a fresh baseline when the account changes", () => {
    const { delivery, context, transport, close } = setup();
    delivery.observe({ ...context, knocks: [knock] });
    delivery.observe({ ...context, recipientId: "other", knocks: [{ ...knock, recipientId: "other" }] });
    expect(close).toHaveBeenCalledOnce();
    expect(transport.show).toHaveBeenCalledOnce();
    delivery.observe({ ...context, recipientId: "other", knocks: [{ ...knock, id: "new", recipientId: "other" }] });
    expect(transport.show).toHaveBeenCalledTimes(2);
    delivery.close();
    expect(close).toHaveBeenCalledTimes(2);
  });
  it("keeps the inbox flow usable if the browser constructor or cleanup fails", () => {
    const { delivery, context, transport } = setup();
    vi.mocked(transport.show).mockImplementationOnce(() => { throw new Error("Unsupported platform"); });
    expect(() => delivery.observe({ ...context, knocks: [knock] })).not.toThrow();
    vi.mocked(transport.show).mockReturnValueOnce({ close: () => { throw new Error("Closed window"); } });
    delivery.observe({ ...context, knocks: [{ ...knock, id: "next" }] });
    expect(() => delivery.close()).not.toThrow();
  });
  it("imports the browser adapter safely without a window during server rendering", async () => {
    expect(browserNotificationTransport.permission()).toBe("unsupported");
    expect(await browserNotificationTransport.requestPermission()).toBe("unsupported");
  });
});
