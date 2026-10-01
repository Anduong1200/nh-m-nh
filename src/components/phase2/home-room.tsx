"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { HomeScene } from "@/components/home-scene";
import { ThemeControl } from "@/components/theme-control";
import type { HouseWithMembers } from "@/modules/houses/server";
import {
  AVAILABILITIES, AVAILABILITY_LABELS, ENERGIES, ENERGY_LABELS, EXPIRIES, EXPIRY_LABELS,
  MOODS, MOOD_LABELS, isPresenceVisible, parsePresenceInput,
  type PresenceInput, type PresenceStatus,
} from "@/modules/presence/model";
import type { Phase2State } from "@/modules/presence/server";
import type { PresenceActionResult } from "@/modules/presence/actions";
import {
  KNOCK_STICKERS, KNOCK_STICKER_LABELS, parseKnockInput,
  type Knock, type KnockInput, type KnockSticker,
} from "@/modules/knocks/model";
import {
  canNotifyKnock, formatKnockNotification, parseNotificationPreferences,
  type NotificationPreferences,
} from "@/modules/notifications/model";
import { HomeDialog } from "./home-dialog";

export type HomeRoomProps = {
  house: HouseWithMembers;
  currentUserId: string;
  state: Phase2State | null;
  refresh: () => Promise<void>;
  savePresence: (input: PresenceInput) => Promise<PresenceActionResult>;
  clearPresence: (expectedVersion: number) => Promise<PresenceActionResult>;
  sendKnock: (input: KnockInput) => Promise<{ knock?: Knock; error?: string }>;
  savePreferences: (input: NotificationPreferences) => Promise<{ preferences?: NotificationPreferences; error?: string }>;
  dismissKnock?: (knockId: string) => Promise<{ success?: boolean; error?: string }>;
  refreshing?: boolean;
  loadError?: string | null;
  online?: boolean;
  signOutControl?: ReactNode;
};

const permissionEvent = "nha-minh:notification-permission";
function readPermission(): NotificationPermission | "unsupported" {
  return typeof window !== "undefined" && "Notification" in window
    ? Notification.permission
    : "unsupported";
}
function serverPermission(): "unsupported" { return "unsupported"; }
function subscribePermission(onChange: () => void) {
  window.addEventListener(permissionEvent, onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.removeEventListener(permissionEvent, onChange);
    window.removeEventListener("focus", onChange);
  };
}

function localTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
}
function minutesToTime(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
function newPresenceDraft(status: PresenceStatus | undefined): PresenceInput {
  const visible = isPresenceVisible(status);
  return {
    mood: visible ? status.mood : "calm",
    energy: visible ? status.energy : "medium",
    availability: visible ? status.availability : "later",
    note: visible ? status.note : "",
    need: visible ? status.need : "",
    expiry: visible && status.expiresAt === null ? "manual" : "4h",
    timeZone: localTimeZone(),
    expectedVersion: status?.version ?? 0,
  };
}
function stickerSymbol(sticker: string) {
  const symbols: Record<string, string> = { leaf: "🍃", star: "✨", tea: "🍵", hug: "🫂" };
  return symbols[sticker] ?? "✦";
}
function expiryText(status: PresenceStatus) {
  if (!status.expiresAt) return "Hiển thị đến khi người viết đổi hoặc xóa.";
  return `Hiển thị đến ${new Intl.DateTimeFormat("vi", {
    hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit",
  }).format(new Date(status.expiresAt))}.`;
}

/** No data fetching or server actions: callbacks are supplied by the authorized controller. */
export function HomeRoom({
  house, currentUserId, state, refresh, savePresence, clearPresence, sendKnock,
  savePreferences, dismissKnock, refreshing = false, loadError = null,
  online = true, signOutControl,
}: HomeRoomProps) {
  const [openDialog, setOpenDialog] = useState<"presence" | "knock" | "settings" | null>(null);
  const [presenceDraft, setPresenceDraft] = useState<PresenceInput | null>(null);
  const [preferencesDraft, setPreferencesDraft] = useState<NotificationPreferences | null>(null);
  const [knockKind, setKnockKind] = useState<"note" | "sticker">("note");
  const [knockNote, setKnockNote] = useState("");
  const [knockSticker, setKnockSticker] = useState<KnockSticker>("leaf");
  const [knockAttempt, setKnockAttempt] = useState<KnockInput | null>(null);
  const knownKnocks = useRef<Set<string> | null>(null);
  const openNotifications = useRef<Notification[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const permission = useSyncExternalStore(subscribePermission, readPermission, serverPermission);
  const ownStatus = state?.statuses.find((status) => status.userId === currentUserId);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!state) return;
    const incoming = state.knocks.filter((knock) => knock.recipientId === currentUserId);
    if (knownKnocks.current === null) {
      knownKnocks.current = new Set(incoming.map((knock) => knock.id));
      return;
    }
    const fresh = incoming.filter((knock) => !knownKnocks.current!.has(knock.id));
    incoming.forEach((knock) => knownKnocks.current!.add(knock.id));
    if (
      permission !== "granted" || !online || document.visibilityState !== "visible" ||
      !canNotifyKnock(state.preferences)
    ) return;
    for (const knock of fresh) {
      const content = formatKnockNotification(knock, state.preferences);
      try {
        openNotifications.current.push(new Notification(content.title, { body: content.body, tag: knock.id }));
      } catch {
        // Some installed mobile browsers lack foreground Notification construction.
        // The private in-app shelf remains available on all supported browsers.
      }
    }
  }, [state, currentUserId, online, permission]);

  useEffect(() => () => {
    openNotifications.current.forEach((notification) => notification.close());
  }, []);

  function openPresence(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.focus();
    if (!presenceDraft) setPresenceDraft(newPresenceDraft(ownStatus));
    setFormError(null);
    setConflict(false);
    setOpenDialog("presence");
  }
  function openKnock(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.focus();
    setFormError(null);
    setOpenDialog("knock");
  }
  function openSettings(event: MouseEvent<HTMLButtonElement>) {
    event.currentTarget.focus();
    if (state && !preferencesDraft) setPreferencesDraft({ ...state.preferences });
    setFormError(null);
    setOpenDialog("settings");
  }
  function closeDialog() { setOpenDialog(null); }

  async function submitPresence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!presenceDraft || busy || !online) return;
    const parsed = parsePresenceInput(presenceDraft);
    if (!parsed.value) { setFormError(parsed.error); return; }
    setBusy(true);
    setFormError(null);
    try {
      const result = await savePresence(parsed.value);
      if (result.error || !result.status) {
        setFormError(result.error ?? "Chưa xác nhận được trạng thái. Bản đang viết vẫn ở đây.");
        setConflict(result.conflict === true);
        if (result.conflict) await refresh();
      } else {
        setPresenceDraft(null);
        setConflict(false);
        setOpenDialog(null);
        setFeedback("Đã để lại trạng thái của bạn.");
      }
    } catch {
      setFormError("Chưa kết nối được với Nhà. Bản đang viết vẫn ở đây, bạn có thể thử lại.");
    } finally { setBusy(false); }
  }

  async function removePresence() {
    if (!presenceDraft || busy || !online) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await clearPresence(presenceDraft.expectedVersion);
      if (result.error || !result.status) {
        setFormError(result.error ?? "Chưa xóa được trạng thái.");
        setConflict(result.conflict === true);
        if (result.conflict) await refresh();
      } else {
        setPresenceDraft(null);
        setConflict(false);
        setOpenDialog(null);
        setFeedback("Đã xóa trạng thái của bạn.");
      }
    } catch { setFormError("Chưa kết nối được với Nhà. Thử lại khi có mạng nhé."); }
    finally { setBusy(false); }
  }

  async function submitKnock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !online) return;
    const content = knockKind === "note" ? knockNote : knockSticker;
    // Freeze the operation after its first send attempt. A retry uses exactly the same UUID and payload.
    const attempt = knockAttempt ?? { operationId: crypto.randomUUID(), kind: knockKind, content };
    const parsed = parseKnockInput(attempt);
    if (!parsed.value) { setKnockAttempt(null); setFormError(parsed.error); return; }
    setKnockAttempt(parsed.value);
    setBusy(true);
    setFormError(null);
    try {
      const result = await sendKnock(parsed.value);
      if (result.error || !result.knock) {
        setFormError(result.error ?? "Chưa xác nhận được cú gõ. Thử lại sẽ dùng cùng một cú gõ.");
      } else {
        setKnockAttempt(null);
        setKnockNote("");
        setOpenDialog(null);
        setFeedback("Đã để lại một cú gõ nhỏ.");
      }
    } catch { setFormError("Chưa kết nối được với Nhà. Cú gõ đang được giữ; thử lại khi có mạng nhé."); }
    finally { setBusy(false); }
  }

  async function submitPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferencesDraft || busy || !online) return;
    const parsed = parseNotificationPreferences(preferencesDraft);
    if (!parsed.value) { setFormError(parsed.error); return; }
    setBusy(true);
    setFormError(null);
    try {
      const result = await savePreferences(parsed.value);
      if (result.error || !result.preferences) setFormError(result.error ?? "Chưa lưu được tùy chọn.");
      else {
        setPreferencesDraft(null);
        setOpenDialog(null);
        setFeedback("Đã lưu nhịp thông báo của bạn.");
      }
    } catch { setFormError("Chưa kết nối được với Nhà. Các lựa chọn vẫn được giữ trong cửa sổ này."); }
    finally { setBusy(false); }
  }

  async function requestNotifications() {
    if (permission === "unsupported" || permission === "denied") return;
    try {
      await Notification.requestPermission();
      window.dispatchEvent(new Event(permissionEvent));
    } catch { setFormError("Trình duyệt này chưa bật được thông báo. Bạn vẫn có thể thấy cú gõ trong Nhà."); }
  }

  async function hideKnock(id: string) {
    if (!dismissKnock || busy || !online) return;
    setBusy(true);
    try {
      const result = await dismissKnock(id);
      setFeedback(result.error ?? (result.success ? "Đã cất cú gõ khỏi góc của bạn. Người kia không nhận thông báo về thao tác này." : "Chưa cất được cú gõ."));
    } catch { setFeedback("Chưa cất được cú gõ. Thử lại khi có mạng nhé."); }
    finally { setBusy(false); }
  }

  const incomingKnocks = state?.knocks.filter((knock) => knock.recipientId === currentUserId).slice(0, 3) ?? [];
  return (
    <div className="house-shell private-home">
      <header className="house-header">
        <div className="brand">
          <svg viewBox="0 0 44 44" aria-hidden="true" className="house-mark">
            <path d="M7 20 22 8l15 12v17H7Z" /><path d="M3 22 22 6l19 16M18 37V25h8v12" />
            <path d="M12 22h4v5h-4zm16 0h4v5h-4z" />
          </svg>
          <div><span className="brand-name">{house.name}</span><span className="brand-caption">Ngôi nhà nhỏ và thế giới của hai đứa</span></div>
        </div>
        <div className="house-header-actions"><ThemeControl />{signOutControl}</div>
      </header>

      <main id="main-content" tabIndex={-1}>
        {!state ? (
          <div className="home-loading" aria-live="polite">
            <div><h1>Cửa Nhà đang mở…</h1><p>{loadError ?? "Đang lấy những dấu vết nhỏ của hai đứa."}</p>
              <button type="button" className="home-subtle-button" onClick={() => void refresh()} disabled={refreshing || busy || !online}>{refreshing ? "Đang tải…" : "Thử tải lại"}</button>
            </div>
          </div>
        ) : (
          <div className="home-room">
            <div className="home-introduction">
              <div><p className="eyebrow">MỘT GÓC DÀNH RIÊNG CHO HAI ĐỨA</p><h1>Về Nhà rồi.</h1><p>Để lại một điều nhỏ, rồi ghé tiếp theo nhịp của mình.</p></div>
              <div className="home-utility"><button type="button" className="home-subtle-button" onClick={() => void refresh()} disabled={refreshing || busy || !online}>{refreshing ? "Đang làm mới…" : "Làm mới Nhà"}</button></div>
            </div>
            {!online && <p className="home-notice" role="status">Bạn đang ngoại tuyến. Nội dung đang viết vẫn ở trong lần mở này; cần có mạng để lưu hoặc gửi.</p>}
            {loadError && <p className="home-notice home-error" role="alert">{loadError} Nội dung đang viết vẫn được giữ.</p>}
            {feedback && <p className="home-notice" role="status">{feedback}</p>}

            <div className="home-spatial-layout">
              <figure className="home-room-stage">
                <HomeScene />
                <button type="button" className="home-object-button home-object-status" onClick={openPresence}><span aria-hidden="true">☀</span>Trạng thái của mình</button>
                <button type="button" className="home-object-button home-object-knock" onClick={openKnock}><span aria-hidden="true">⌁</span>Gõ cửa một chút</button>
                <button type="button" className="home-object-button home-object-settings" onClick={openSettings}><span aria-hidden="true">⚙</span>Nhịp thông báo</button>
                <span className="home-decor-label home-decor-map">Bản đồ · chưa mở</span>
                <span className="home-decor-label home-decor-games">Hộp trò chơi · chưa mở</span>
                <figcaption>Bảng vẽ, thư và bản đồ đang là đồ trang trí. Ba nhãn trong phòng mở những góc đã sẵn sàng.</figcaption>
              </figure>
              <div className="home-people" aria-label="Trạng thái do mỗi người tự chia sẻ">
                {house.members.map((member) => {
                  const status = state.statuses.find((item) => item.userId === member.user_id);
                  const self = member.user_id === currentUserId;
                  return (
                    <section className="home-person" key={member.user_id} aria-label={`Trạng thái ${self ? "của bạn" : "người thương"}`}>
                      <div className="home-person-header"><span className="home-mascot" aria-hidden="true">{self ? "🐰" : "🦉"}</span><div className="home-person-name">{member.profile?.display_name || (self ? "Mình" : "Người thương")}<span className="home-person-self">{self ? "Trạng thái của bạn" : "Người ấy tự chia sẻ"}</span></div></div>
                      {isPresenceVisible(status, new Date(now)) ? <>
                        <p className="home-presence-mood">{MOOD_LABELS[status.mood]}</p>
                        <p className="home-presence-details"><span>{ENERGY_LABELS[status.energy]}</span><span>{AVAILABILITY_LABELS[status.availability]}</span></p>
                        {status.note && <p className="home-presence-note">{status.note}</p>}
                        {status.need && <p className="home-presence-need">Cần một chút: {status.need}</p>}
                        <p className="home-presence-expiry">{expiryText(status)}</p>
                      </> : <p className="home-presence-empty">Chưa có trạng thái được chia sẻ lúc này. Mỗi người có thể để lại khi muốn.</p>}
                      {self && <button type="button" className="home-subtle-button" onClick={openPresence}>Viết trạng thái</button>}
                    </section>
                  );
                })}
              </div>
            </div>

            <section className="home-knock-shelf" aria-labelledby="knock-shelf-title">
              <div><h2 id="knock-shelf-title">Một cú gõ để lại</h2><p className="home-knock-caption">Chỉ một lời nghĩ tới nhau. Không có dấu đã xem hay yêu cầu trả lời.</p></div>
              <div className="home-knock-items">
                {incomingKnocks.length === 0 ? <p className="home-knock-empty">Góc này đang yên. Cú gõ mới sẽ ở đây khi người ấy gửi.</p> : incomingKnocks.map((knock) => (
                  <article key={knock.id} className="home-knock-item">
                    {knock.kind === "sticker" ? <><span className="home-knock-sticker" aria-hidden="true">{stickerSymbol(knock.content)}</span><p>{KNOCK_STICKER_LABELS[knock.content as KnockSticker] ?? "Một nhãn dán nhỏ"}</p></> : <p>{knock.content}</p>}
                    {dismissKnock && <button type="button" className="home-subtle-button" disabled={busy || !online} onClick={() => void hideKnock(knock.id)} aria-label="Cất cú gõ khỏi góc của bạn">Cất khỏi góc mình</button>}
                  </article>
                ))}
              </div>
            </section>
            {incomingKnocks.length > 0 && canNotifyKnock(state.preferences) && <p className="home-generic-notice" role="status">{state.preferences.preview === "generic" ? "Có một cú gõ cửa trong Nhà." : formatKnockNotification(incomingKnocks[0]!, state.preferences).body}</p>}
          </div>
        )}
      </main>
      <footer className="site-footer"><span>Nhà Mình <span aria-hidden="true">·</span> chỉ hai người</span><span>Ghé khi bạn muốn. Không cần vội.</span></footer>

      <HomeDialog open={openDialog === "presence"} title="Hôm nay, mình thế nào?" onClose={closeDialog}>
        <p className="home-dialog-intro">Chỉ những điều bạn chọn chia sẻ. Bạn có thể đổi hoặc xóa bất cứ lúc nào.</p>
        {presenceDraft && <form className="home-form" onSubmit={submitPresence}>
          <label>Tâm trạng<select disabled={busy} value={presenceDraft.mood} onChange={(event) => setPresenceDraft({ ...presenceDraft, mood: event.target.value as PresenceInput["mood"] })}>{MOODS.map((mood) => <option key={mood} value={mood}>{MOOD_LABELS[mood]}</option>)}</select></label>
          <div className="home-form-grid">
            <label>Năng lượng<select disabled={busy} value={presenceDraft.energy} onChange={(event) => setPresenceDraft({ ...presenceDraft, energy: event.target.value as PresenceInput["energy"] })}>{ENERGIES.map((energy) => <option key={energy} value={energy}>{ENERGY_LABELS[energy]}</option>)}</select></label>
            <label>Nhịp của mình<select disabled={busy} value={presenceDraft.availability} onChange={(event) => setPresenceDraft({ ...presenceDraft, availability: event.target.value as PresenceInput["availability"] })}>{AVAILABILITIES.map((availability) => <option key={availability} value={availability}>{AVAILABILITY_LABELS[availability]}</option>)}</select></label>
          </div>
          <label>Một dòng để lại<input disabled={busy} value={presenceDraft.note} maxLength={160} placeholder="Ví dụ: Hôm nay có nhiều việc, tối mình ghé." onChange={(event) => setPresenceDraft({ ...presenceDraft, note: event.target.value })} /><span className="home-form-hint">Tối đa 160 ký tự.</span></label>
          <label>Mình cần một chút<input disabled={busy} value={presenceDraft.need} maxLength={100} placeholder="Ví dụ: Một cái ôm hoặc một chút yên tĩnh." onChange={(event) => setPresenceDraft({ ...presenceDraft, need: event.target.value })} /><span className="home-form-hint">Không bắt buộc · tối đa 100 ký tự.</span></label>
          <label>Hiển thị đến khi<select disabled={busy} value={presenceDraft.expiry} onChange={(event) => setPresenceDraft({ ...presenceDraft, expiry: event.target.value as PresenceInput["expiry"] })}>{EXPIRIES.map((expiry) => <option key={expiry} value={expiry}>{EXPIRY_LABELS[expiry]}</option>)}</select></label>
          <p className="home-form-hint">Giờ của bạn: {presenceDraft.timeZone}. “Hết ngày” kết thúc vào nửa đêm tại múi giờ này.</p>
          {!online && <p className="home-inline-error" role="status">Cần có mạng để lưu. Nội dung đang viết vẫn ở đây trong lần mở này.</p>}
          {formError && <p className="home-inline-error" role="alert">{formError}</p>}
          {conflict && <div className="home-conflict"><p>Bản bạn đang viết vẫn được giữ. Bản hiện tại: {isPresenceVisible(ownStatus) ? `${MOOD_LABELS[ownStatus.mood]} · ${ownStatus.note || "Không có lời nhắn"}` : "Chưa có trạng thái hiển thị."}</p><button type="button" className="home-subtle-button" disabled={busy} onClick={() => { setPresenceDraft({ ...presenceDraft, expectedVersion: ownStatus?.version ?? 0 }); setConflict(false); setFormError(null); }}>Giữ bản đang viết để thay bản hiện tại</button></div>}
          <div className="home-form-actions"><button type="submit" className="home-submit" disabled={busy || !online || conflict}>{busy ? "Đang lưu…" : "Lưu trạng thái"}</button>{ownStatus && !ownStatus.cleared && <button type="button" className="home-subtle-button" onClick={() => void removePresence()} disabled={busy || !online || conflict}>Xóa trạng thái của mình</button>}</div>
          <p className="home-form-hint">Bản đang viết chỉ được giữ trong bộ nhớ của lần mở này. Đóng hoặc tải lại trang sẽ bỏ bản chưa lưu.</p>
        </form>}
      </HomeDialog>

      <HomeDialog open={openDialog === "knock"} title="Gõ cửa một chút" onClose={closeDialog}>
        <p className="home-dialog-intro">Một cách nhỏ để nói “mình nghĩ tới cậu”. Người ấy không cần trả lời.</p>
        <form className="home-form" onSubmit={submitKnock}>
          <label>Để lại bằng<select value={knockKind} disabled={busy || knockAttempt !== null} onChange={(event) => setKnockKind(event.target.value as "note" | "sticker")}><option value="note">Một lời nhắn nhỏ</option><option value="sticker">Một nhãn dán</option></select></label>
          {knockKind === "note" ? <label>Lời nhắn<input value={knockNote} maxLength={160} disabled={busy || knockAttempt !== null} placeholder="Có một tách trà dành cho cậu." onChange={(event) => setKnockNote(event.target.value)} /><span className="home-form-hint">Tối đa 160 ký tự. Knock không phải cuộc trò chuyện.</span></label> : <fieldset className="home-sticker-field" disabled={busy || knockAttempt !== null}><legend>Chọn một nhãn dán</legend><div className="home-sticker-options">{KNOCK_STICKERS.map((sticker) => <button type="button" key={sticker} aria-label={KNOCK_STICKER_LABELS[sticker]} aria-pressed={knockSticker === sticker} onClick={() => setKnockSticker(sticker)}>{stickerSymbol(sticker)}</button>)}</div></fieldset>}
          {!online && <p className="home-inline-error" role="status">Cần có mạng để gửi. Cú gõ chưa được gửi tự động.</p>}
          {formError && <p className="home-inline-error" role="alert">{formError}</p>}
          {knockAttempt && !busy && <p className="home-form-hint">Cú gõ này đã được thử gửi. Thử lại giữ nguyên nội dung để không gửi trùng.</p>}
          <div className="home-form-actions"><button type="submit" className="home-submit" disabled={busy || !online}>{busy ? "Đang gửi…" : knockAttempt ? "Thử gửi lại cú gõ này" : "Để lại cú gõ"}</button></div>
          <p className="home-form-hint">Không có thông báo “đã xem”. Bản chưa gửi được giữ trong bộ nhớ của lần mở này.</p>
        </form>
      </HomeDialog>

      <HomeDialog open={openDialog === "settings"} title="Theo nhịp của mình" onClose={closeDialog}>
        <p className="home-dialog-intro">Chọn khi nào và bao nhiêu điều hiện trên thông báo của bạn.</p>
        {preferencesDraft && <form className="home-form" onSubmit={submitPreferences}>
          <label className="home-checkbox"><input disabled={busy} type="checkbox" checked={preferencesDraft.knocksEnabled} onChange={(event) => setPreferencesDraft({ ...preferencesDraft, knocksEnabled: event.target.checked })} />Cho mình biết khi có cú gõ mới</label>
          <label className="home-checkbox"><input disabled={busy} type="checkbox" checked={preferencesDraft.quietEnabled} onChange={(event) => setPreferencesDraft({ ...preferencesDraft, quietEnabled: event.target.checked })} />Dành một khoảng giờ yên tĩnh</label>
          {preferencesDraft.quietEnabled && <div className="home-form-grid"><label>Từ lúc<input disabled={busy} type="time" value={minutesToTime(preferencesDraft.startMinute)} required onChange={(event) => setPreferencesDraft({ ...preferencesDraft, startMinute: timeToMinutes(event.target.value) })} /></label><label>Đến lúc<input disabled={busy} type="time" value={minutesToTime(preferencesDraft.endMinute)} required onChange={(event) => setPreferencesDraft({ ...preferencesDraft, endMinute: timeToMinutes(event.target.value) })} /></label></div>}
          <label>Múi giờ cho giờ yên tĩnh<input disabled={busy} value={preferencesDraft.timeZone} placeholder="Asia/Ho_Chi_Minh" onChange={(event) => setPreferencesDraft({ ...preferencesDraft, timeZone: event.target.value })} /><span className="home-form-hint">Tên múi giờ IANA, ví dụ Asia/Ho_Chi_Minh hoặc Europe/Paris.</span></label>
          <button type="button" className="home-subtle-button" disabled={busy} onClick={() => setPreferencesDraft({ ...preferencesDraft, timeZone: localTimeZone() })}>Dùng múi giờ trên thiết bị</button>
          <label className="home-checkbox"><input disabled={busy} type="checkbox" checked={preferencesDraft.preview === "detail"} onChange={(event) => setPreferencesDraft({ ...preferencesDraft, preview: event.target.checked ? "detail" : "generic" })} /><span>Hiện lời nhắn hoặc nhãn dán trong thông báo<span className="home-form-hint" style={{ display: "block" }}>Tùy chọn riêng tư: nội dung có thể hiện trên màn hình khóa hoặc trước người ở gần. Mặc định chỉ báo có cú gõ.</span></span></label>
          <div className="home-settings-section"><h3>Thông báo của trình duyệt</h3><p>Chỉ báo cú gõ mới khi Nhà đang mở và hiển thị trên thiết bị này. Chưa có thông báo nền khi đóng ứng dụng. Bật quyền là lựa chọn của bạn.</p>
            {permission === "unsupported" ? <p>Trình duyệt này chưa hỗ trợ thông báo kiểu này. Cú gõ vẫn ở trong Nhà.</p> : permission === "granted" ? <p className="home-permission-status">Trình duyệt đã cho phép. Giờ yên tĩnh và lựa chọn riêng tư vẫn được áp dụng.</p> : permission === "denied" ? <p>Thông báo đang bị chặn. Bạn có thể đổi quyền trong cài đặt trình duyệt nếu muốn.</p> : <button type="button" className="home-subtle-button" onClick={() => void requestNotifications()}>Cho phép thông báo khi Nhà đang mở</button>}
          </div>
          {!online && <p className="home-inline-error" role="status">Cần có mạng để lưu lựa chọn. Mẫu đang viết vẫn được giữ.</p>}
          {formError && <p className="home-inline-error" role="alert">{formError}</p>}
          <div className="home-form-actions"><button type="submit" className="home-submit" disabled={busy || !online}>{busy ? "Đang lưu…" : "Lưu nhịp thông báo"}</button></div>
        </form>}
      </HomeDialog>
    </div>
  );
}
