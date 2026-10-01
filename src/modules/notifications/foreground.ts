import type { Knock } from "@/modules/knocks/model";
import { canNotifyKnock, formatKnockNotification, parseNotificationPreferences, type NotificationPreferences } from "./model";

export type ForegroundPermission = NotificationPermission | "unsupported";
export type NotificationNotice = { title: string; body: string; tag: string };
export interface NotificationTransport {
  permission(): ForegroundPermission;
  requestPermission(): Promise<ForegroundPermission>;
  show(notice: NotificationNotice): { close(): void };
}

const permissionEvent = "nha-minh:notification-permission";

export function readForegroundPermission(): ForegroundPermission {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission : "unsupported";
}

export function serverForegroundPermission(): "unsupported" { return "unsupported"; }

export function subscribeForegroundPermission(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(permissionEvent, onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(permissionEvent, onChange);
    window.removeEventListener("focus", onChange);
  };
}

/** Lazy browser access keeps this module safe to import during SSR. No Web Push. */
export const browserNotificationTransport: NotificationTransport = {
  permission: readForegroundPermission,
  async requestPermission() {
    const permission = readForegroundPermission();
    if (permission !== "default") return permission;
    try {
      const result = await Notification.requestPermission();
      window.dispatchEvent(new Event(permissionEvent));
      return result;
    } catch { return readForegroundPermission(); }
  },
  show(notice) {
    return new Notification(notice.title, { body: notice.body, tag: notice.tag });
  },
};

export type ForegroundKnockContext = {
  recipientId: string;
  knocks: readonly Knock[];
  preferences: NotificationPreferences;
  online: boolean;
  visible: boolean;
  now?: Date;
};

/** Session-scoped delivery policy. Observing state never asks for permission. */
export class ForegroundKnockNotifications {
  private recipientId: string | null = null;
  private known = new Set<string>();
  private primed = false;
  private handles: Array<{ close(): void }> = [];

  constructor(private readonly transport: NotificationTransport = browserNotificationTransport) {}

  observe(context: ForegroundKnockContext): void {
    if (context.recipientId !== this.recipientId) {
      this.close();
      this.recipientId = context.recipientId;
    }
    const incoming = context.knocks.filter((knock) => knock.recipientId === context.recipientId);
    if (!this.primed) {
      incoming.forEach((knock) => this.known.add(knock.id));
      this.primed = true;
      return;
    }
    const fresh: Knock[] = [];
    // Suppression consumes an event; permission changes or quiet-hour end do not replay it.
    for (const knock of incoming) {
      if (!this.known.has(knock.id)) fresh.push(knock);
      this.known.add(knock.id);
    }
    const now = context.now ?? new Date();
    const preferences = parseNotificationPreferences(context.preferences).value;
    if (!context.online || !context.visible || !Number.isFinite(now.getTime()) || !preferences ||
      this.transport.permission() !== "granted" || !canNotifyKnock(preferences, now)) return;
    for (const knock of fresh) {
      try {
        const content = formatKnockNotification(knock, preferences);
        this.handles.push(this.transport.show({ ...content, tag: knock.id }));
      } catch {
        // Unsupported foreground constructors never break the independent in-app inbox.
      }
    }
  }

  close(): void {
    for (const handle of this.handles) {
      try { handle.close(); } catch { /* Continue cleanup of other notices. */ }
    }
    this.handles = [];
    this.known.clear();
    this.primed = false;
    this.recipientId = null;
  }
}
