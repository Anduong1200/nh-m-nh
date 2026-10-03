import { setPushWorkerBinding } from "@/modules/notifications/push-browser";
/** Run before local logout cleanup. Failure keeps drafts and the signed-in state intact. */
export async function disconnectLocalPush() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) return;
  const subscription = await registration.pushManager?.getSubscription();
  if (!subscription) { registration.active?.postMessage({ type: "CLEAR_PUSH_BINDING" }); return; }
  if (!registration.active || !await setPushWorkerBinding(registration.active, null)) throw new Error("Cannot confirm notification cleanup.");
  await subscription.unsubscribe();
  if (await registration.pushManager.getSubscription()) throw new Error("Cannot confirm notification unsubscribe.");
}
