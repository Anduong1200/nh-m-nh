"use client";
import { useEffect, useRef, useState } from "react";
import type { BoardContext } from "@/modules/board/model";
import { enrollPushAction, disablePushAction, readPushSubscriptionAction } from "@/modules/notifications/push-actions";
import { setPushWorkerBinding, vapidApplicationKey } from "@/modules/notifications/push-browser";
import type { BackgroundNotificationConfiguration } from "@/modules/notifications/push-model";
import { subscribeAccountInvalidation } from "@/lib/offline/invalidation";

export function BackgroundNotificationSettings({ context, configuration }: { context: BoardContext; configuration: BackgroundNotificationConfiguration }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [token, setToken] = useState<string | null>(null);
  const sequence = useRef({ value: 0 }), currentToken = useRef<string | null>(null);
  const { accountId, houseId } = context;
  useEffect(() => {
    const counter = sequence.current;
    const generation = ++counter.value;
    function invalidate() { counter.value++; currentToken.current = null; setToken(null); setBusy(false); }
    const unsubscribe = subscribeAccountInvalidation(accountId, invalidate);
    // Reading an existing subscription never asks for permission or creates a new one.
    void (async () => {
      if (!("serviceWorker" in navigator) || !navigator.onLine) return;
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription || !registration?.active) return;
        const result = await readPushSubscriptionAction(subscription.endpoint, { accountId, houseId });
        if (generation !== counter.value) return;
        if (result.deviceToken && await setPushWorkerBinding(registration.active, result.deviceToken)) {
          if (generation !== counter.value) { await setPushWorkerBinding(registration.active, null); return; }
          currentToken.current = result.deviceToken; setToken(result.deviceToken);
        } else await setPushWorkerBinding(registration.active, null);
      } catch { /* Settings remain usable without a currently reachable worker/server. */ }
    })();
    return () => { counter.value++; unsubscribe(); };
  }, [accountId, houseId]);

  async function enable() {
    if (busy || !configuration.enabled || !configuration.publicKey) return;
    if (!navigator.onLine) { setMessage("Kết nối lại để bật thông báo nền nhé."); return; }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setMessage("Trình duyệt này chưa hỗ trợ thông báo nền. Trên iPhone, hãy mở app đã thêm vào Màn hình chính."); return; }
    const generation = ++sequence.current.value, original = { ...context };
    setBusy(true); setMessage("");
    let registration: ServiceWorkerRegistration | undefined, subscription: PushSubscription | null = null, enrolled: string | undefined;
    try {
      // Only this explicit button gesture requests browser notification permission.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setMessage("Bạn có thể bật quyền thông báo trong trình duyệt khi muốn."); return; }
      registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration?.active) throw new Error("Worker unavailable");
      if (generation !== sequence.current.value) return;
      if (!await setPushWorkerBinding(registration.active, null)) throw new Error("Worker binding unavailable");
      const previous = await registration.pushManager.getSubscription();
      if (previous) await previous.unsubscribe();
      subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidApplicationKey(configuration.publicKey) });
      if (generation !== sequence.current.value) { await subscription.unsubscribe(); return; }
      const result = await enrollPushAction(subscription.toJSON(), original);
      if (!result.deviceToken) throw new Error(result.error ?? "Enrollment unavailable");
      enrolled = result.deviceToken;
      if (generation !== sequence.current.value) { await disablePushAction(enrolled, original); await subscription.unsubscribe(); return; }
      if (!await setPushWorkerBinding(registration.active, enrolled)) throw new Error("Worker binding unavailable");
      if (generation !== sequence.current.value) { await setPushWorkerBinding(registration.active, null); await disablePushAction(enrolled, original); await subscription.unsubscribe(); return; }
      currentToken.current = enrolled; setToken(enrolled); setMessage("Đã bật thông báo nền trên thiết bị này. Nội dung luôn được giữ riêng tư.");
    } catch {
      if (registration?.active) await setPushWorkerBinding(registration.active, null);
      if (subscription) await subscription.unsubscribe().catch(() => false);
      if (enrolled) await disablePushAction(enrolled, original);
      if (generation === sequence.current.value) setMessage("Chưa bật được thông báo nền. Thông báo trong Nhà vẫn hoạt động; bạn có thể thử lại sau.");
    } finally { if (generation === sequence.current.value) setBusy(false); }
  }
  async function disable() {
    if (busy) return;
    const original = { ...context }, ownedToken = currentToken.current;
    ++sequence.current.value; setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (registration?.active && !await setPushWorkerBinding(registration.active, null)) throw new Error("Worker binding unavailable");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      if (await registration?.pushManager.getSubscription()) throw new Error("Subscription still active");
      const result = ownedToken ? await disablePushAction(ownedToken, original) : { disabled: true };
      currentToken.current = null; setToken(null);
      setMessage(result.disabled ? "Đã tắt thông báo nền trên thiết bị này." : "Thiết bị đã ngừng nhận thông báo; kết nối lại để xác nhận với Nhà.");
    } catch { setMessage("Chưa xác nhận được việc tắt thông báo. Bạn có thể tắt quyền trong trình duyệt."); }
    finally { setBusy(false); }
  }
  return <section className="space-y-2" aria-label="Thông báo nền">
    <p>Thông báo nền cho cú gõ cửa, thư đến và lượt chơi. Nội dung trên màn hình khóa luôn là lời nhắc chung.</p>
    {!configuration.enabled && <p>Thông báo nền chưa được cấu hình. Bạn vẫn thấy điều mới khi mở Nhà.</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={!configuration.enabled || busy || Boolean(token)} onClick={enable} className="min-h-11 rounded-xl border border-[var(--line)] px-4 py-2">{busy ? "Đang xử lý…" : "Bật thông báo nền"}</button>
      <button type="button" disabled={busy} onClick={disable} className="min-h-11 rounded-xl border border-[var(--line)] px-4 py-2">Tắt trên thiết bị này</button>
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
