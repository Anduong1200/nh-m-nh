const CHANNEL = "nha-minh-account-cleared-v1";
const EVENT = "nha-minh-account-cleared";

/** A privacy invalidation signal only; it can never grant account access. */
export function notifyAccountInvalidation(accountId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: accountId }));
  if (typeof BroadcastChannel !== "undefined") {
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel(CHANNEL); channel.postMessage({ accountId }); }
    catch { /* Persistent IDB epochs remain the authority when messaging is unavailable. */ }
    finally { channel?.close(); }
  }
}

export function subscribeAccountInvalidation(accountId: string, closePrivateView: () => void) {
  if (typeof window === "undefined") return () => {};
  const local = (event: Event) => { if ((event as CustomEvent<unknown>).detail === accountId) closePrivateView(); };
  let channel: BroadcastChannel | null = null;
  try { if (typeof BroadcastChannel !== "undefined") channel = new BroadcastChannel(CHANNEL); }
  catch { /* A unavailable channel must not prevent an authorized private view opening. */ }
  if (channel) channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (data && typeof data === "object" && "accountId" in data && data.accountId === accountId) closePrivateView();
  };
  window.addEventListener(EVENT, local);
  return () => { window.removeEventListener(EVENT, local); channel?.close(); };
}
