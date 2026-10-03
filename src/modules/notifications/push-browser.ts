import { isUuid } from "@/modules/knocks/model";

export async function setPushWorkerBinding(worker: ServiceWorker, token: string | null): Promise<boolean> {
  if (token !== null && !isUuid(token)) return false;
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 2500);
    channel.port1.onmessage = event => {
      if (event.data?.type !== "PUSH_BINDING_ACK" || event.data.token !== token) return;
      clearTimeout(timer); channel.port1.close(); resolve(true);
    };
    worker.postMessage(token === null ? { type: "CLEAR_PUSH_BINDING" } : { type: "SET_PUSH_BINDING", token }, [channel.port2]);
  });
}
export function vapidApplicationKey(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
}
